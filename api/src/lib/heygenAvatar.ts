/**
 * HeyGen talking-avatar generation (#40)
 *
 * Migrated to HeyGen API v3 (2026-08-04) — v1/v2 endpoints (upload.heygen.com/v1/asset,
 * v2/video/generate, v1/video_status.get) are retired by HeyGen on 2026-11-01. v3 is the
 * only version with a real webhook system (signed payloads, retries, dedup) instead of the
 * bare unauthenticated `callback_url` v2 offered — see verifyHeygenWebhookSignature() below
 * and heygenWebhook.ts.
 *
 * Produces a lip-synced presenter video from the scene's TTS audio:
 *   1. concatAudioFiles()      — merge per-segment TTS mp3s into one track
 *   2. uploadAudioAsset()      — POST /v3/assets (multipart)
 *   3. createAvatarVideo()     — POST /v3/videos (type: "avatar", audio_asset_id)
 *   4. waitForAvatarVideo()    — poll GET /v3/videos/{id} until completed (legacy path only;
 *                                 the main path is async via startAvatarClipJob + webhook/poll)
 *   5. downloadToUploads()     — save the finished MP4 locally
 *
 * The caller (generateHeyGenAvatar.ts) overlays the result bottom-right on the
 * slide video via overlayAvatarOnVideo() in ffmpegVideo.ts, matching the
 * presenter-avatar box shown in the Visual Designer preview.
 *
 * Every step throws on failure — callers must catch and fall back to the
 * slide-only video so avatar problems never block video generation.
 */

import { spawn } from 'child_process'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'crypto'

const ffmpegPath = require('ffmpeg-static')
const UPLOAD_DIR = join(process.cwd(), 'uploads')

const HEYGEN_API = 'https://api.heygen.com'

/** Chroma-key green used to render a HeyGen avatar clip when the project's
 *  Avatar Background is set to "Transparent". HeyGen's v3 /v3/videos API only
 *  documents 'color' and 'image' background types — there's no real
 *  transparent option — and the compositor (overlayAvatarOnVideo) used to
 *  just overlay a plain rectangular crop with no keying at all. Picking
 *  "Transparent" therefore silently fell back to a solid navy box (reported:
 *  "background transparency did not work — there's still a [visible] box").
 *  Fix: render on this specific, fully-saturated green instead — essentially
 *  never appears in skin, hair, or everyday clothing — then key it out to
 *  real per-pixel alpha in overlayAvatarOnVideo so only the presenter shows
 *  through onto the slide underneath. */
export const AVATAR_CHROMA_KEY_HEX = '#00FF00'

/** Bumped whenever a change to createAvatarVideo's request body would make an
 *  already-cached avatarcache_*.mp4 file the WRONG shape/content for what the
 *  compositor now expects — the cache key otherwise only covers
 *  avatarId/avatarStyle/avatarBackground, so it wouldn't notice on its own
 *  that (e.g.) aspect_ratio changed. Folded into both cache hashes below.
 *  'ar-9x16': 2026-08-15, aspect_ratio switched '16:9' -> '9:16' — an old
 *  cached clip is a landscape render that would letterbox tiny inside the new
 *  portrait strip box instead of filling it. Old cache files are left on disk
 *  (harmless, just orphaned) rather than deleted. */
const CACHE_VERSION = 'ar-9x16'

/** Parses the project's saved avatar_background JSON and decides what to
 *  actually send HeyGen (only 'color'/'image' are valid) plus whether the
 *  result needs chroma-keying afterward. Shared by createAvatarVideo (the
 *  HeyGen request body) and startAvatarClipJob (which needs to know
 *  chromaKey on a cache HIT too, without re-deriving it from a network call). */
function resolveAvatarBackground(raw?: string | null): { heygenBackground: { type: string; value?: string }; chromaKey: boolean } {
  let requested: any = null
  try { if (raw) requested = JSON.parse(raw) } catch { /* keep null — falls through to default below */ }

  if (requested?.type === 'transparent') {
    return { heygenBackground: { type: 'color', value: AVATAR_CHROMA_KEY_HEX }, chromaKey: true }
  }
  const ALLOWED_BG = ['color', 'image']
  // No explicit choice saved on the project → TRANSPARENT (chroma-keyed),
  // not the old solid '#0F172A'. That dark navy default is what put a hard
  // rectangular box around the presenter on every slide, which is what
  // "don't put the border on it keep it simple" (2026-08-15) was actually
  // reacting to — and the box is also what made HeyGen's tight native
  // framing read as "head not complete", since the hairline landed right on
  // a visible box edge instead of dissolving into the slide. Keying it out
  // instead means the presenter sits directly on the slide with no edge at
  // all, and the headroom padding below becomes invisible rather than a
  // visible margin. A project that HAS explicitly picked a solid color or
  // image still gets exactly that.
  if (!(requested && typeof requested === 'object' && ALLOWED_BG.includes(requested.type))) {
    return { heygenBackground: { type: 'color', value: AVATAR_CHROMA_KEY_HEX }, chromaKey: true }
  }
  let bg = requested
  if (bg.type === 'color' && !bg.value) bg = { ...bg, value: '#0F172A' }
  return { heygenBackground: bg, chromaKey: false }
}

/** Resolve just the flat color a SOLID (non-transparent) Avatar Background
 *  renders on, so overlayAvatarOnVideo can pad its headroom margin with a
 *  color that actually matches the presenter's own background instead of
 *  leaving black/nothing there. Returns null for the chromaKey (Transparent)
 *  case — that path already pads with real per-pixel alpha — and for
 *  `type: 'image'` backgrounds, which have no single flat color to match.
 *  Exported (unlike resolveAvatarBackground itself) because this is called
 *  from wherever overlayAvatarOnVideo is, not just from the HeyGen request
 *  builders in this file. */
export function resolveAvatarBackgroundColor(raw?: string | null): string | null {
  const { heygenBackground, chromaKey } = resolveAvatarBackground(raw)
  if (chromaKey) return null
  return heygenBackground.type === 'color' ? (heygenBackground.value || '#0F172A') : null
}

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY
  if (!key) throw new Error('HEYGEN_API_KEY not configured')
  return key
}

/** Public base URL of this API (e.g. https://profai-api.azurewebsites.net, or an ngrok
 *  tunnel in dev), if configured. Reuses PUBLIC_BASE_URL — api/.env already documented
 *  this exact variable (for HeyGen fetching audio/images) but nothing read it yet.
 *  Only set this once the API is reachable from the public internet — HeyGen webhooks are
 *  useless (and silently undeliverable) against localhost. Leave unset in local dev; the
 *  code falls back to pure polling exactly as before. */
function publicCallbackUrl(): string | null {
  const base = process.env.PUBLIC_BASE_URL
  if (!base) return null
  return `${base.replace(/\/+$/, '')}/api/heygenWebhook`
}

/** Verifies a HeyGen v3 webhook delivery. HeyGen signs the RAW request body with
 *  HMAC-SHA256 using the endpoint secret (from POST /v3/webhooks/endpoints or
 *  rotate-secret) — see https://developers.heygen.com/docs/webhooks.
 *  Callers MUST pass the raw body string (not a re-serialized JSON object) or the
 *  signature will never match. */
export function verifyHeygenWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  maxSkewSeconds = 300
): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.HEYGEN_WEBHOOK_SECRET
  if (!secret) return { ok: false, reason: 'HEYGEN_WEBHOOK_SECRET not configured' }
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: 'missing Heygen-Signature/Heygen-Timestamp headers' }

  const skew = Math.abs(Date.now() / 1000 - Number(timestampHeader))
  if (!Number.isFinite(skew) || skew > maxSkewSeconds) return { ok: false, reason: 'stale timestamp (possible replay)' }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  let sigBuf: Buffer, expBuf: Buffer
  try {
    sigBuf = Buffer.from(signatureHeader, 'hex')
    expBuf = Buffer.from(expected, 'hex')
  } catch {
    return { ok: false, reason: 'malformed signature header' }
  }
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'signature mismatch' }
  }
  return { ok: true }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`))
    })
  })
}

/** Merge per-segment TTS mp3 files into a single mp3 (re-encoded for safety). */
export async function concatAudioFiles(audioPaths: string[]): Promise<string> {
  if (audioPaths.length === 1) return audioPaths[0]
  const listFile = join(UPLOAD_DIR, `${randomUUID()}_audiolist.txt`)
  writeFileSync(listFile, audioPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_scene_audio.mp3`)
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-b:a', '128k', outPath])
  return outPath
}

/** Upload an audio file to HeyGen's v3 asset store (POST /v3/assets, multipart/form-data)
 *  → returns asset_id. Replaces the old v1 upload.heygen.com/v1/asset call (retired 2026-11-01). */
export async function uploadAudioAsset(audioPath: string): Promise<string> {
  const buffer = readFileSync(audioPath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/mpeg' }), 'audio.mp3')

  const res = await fetch(`${HEYGEN_API}/v3/assets`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey() }, // do NOT set Content-Type — fetch sets the multipart boundary itself
    body: form as any,
  })
  const bodyText = await res.text()
  if (!res.ok) throw new Error(`HeyGen asset upload failed (${res.status}): ${bodyText.slice(0, 300)}`)
  let json: any
  try { json = JSON.parse(bodyText) } catch { throw new Error(`HeyGen asset upload: non-JSON response: ${bodyText.slice(0, 300)}`) }
  const assetId = json?.data?.asset_id
  if (!assetId) throw new Error(`HeyGen asset upload: no asset_id in response: ${bodyText.slice(0, 300)}`)
  console.log(`[heygenAvatar] Uploaded audio asset ${assetId} (${buffer.length} bytes, v3)`)
  return assetId
}

/** Create the avatar video job (POST /v3/videos, type: "avatar") → returns video_id.
 *  When PUBLIC_API_BASE_URL is configured, attaches callback_url so HeyGen pushes a
 *  webhook to heygenWebhook.ts on completion instead of relying purely on polling. */
export async function createAvatarVideo(opts: {
  avatarId: string
  audioAssetId: string
  avatarStyle?: string | null
  background?: string | null  // JSON string {"type":"color","value":"#1E293B"}
  callbackId?: string | null  // echoed back in the webhook payload — pass sceneId for traceability
}): Promise<{ videoId: string; engineUsed: 'avatar_iii' | 'avatar_iv' }> {
  const { heygenBackground: background } = resolveAvatarBackground(opts.background)

  // v2's `avatar_style: 'closeUp' | 'normal'` framing control has no documented equivalent
  // in the v3 /v3/videos schema (type: avatar / audio_asset_id path). Rather than guess at
  // an undocumented field and risk a 400, surface this loudly so a closeUp preference is
  // visibly dropped instead of silently ignored — verify against HeyGen's live request
  // schema (`heygen video create --request-schema`) if framing control turns out to matter.
  if (opts.avatarStyle === 'closeUp') {
    console.warn('[heygenAvatar] avatarStyle="closeUp" requested but HeyGen v3 has no confirmed equivalent — framing preference NOT applied on this render.')
  }

  const callbackUrl = publicCallbackUrl()
  const requestBody = {
    type: 'avatar',
    avatar_id: opts.avatarId,
    audio_asset_id: opts.audioAssetId,
    background,
    // 2026-08-15 ("i need to get avatar with all the frame full portrait
    // (9:16)"): switched from '16:9' to a real portrait request. The box-shape
    // fix earlier the same day (AVATAR_BOX_ASPECT -> 9/16 in ffmpegVideo.ts)
    // stopped the avatar from being CROPPED, but it still only ever occupied a
    // landscape-shaped corner box. A true tall/narrow strip needs HeyGen to
    // actually render the presenter framed for portrait, not a landscape clip
    // squeezed into a portrait box (that would just letterbox small in the
    // middle — see fitAndPad in overlayAvatarOnVideo). AVATAR_BOX_ASPECT is
    // flipped to 16/9 in lockstep with this so the compositor box matches
    // HeyGen's new output shape exactly, same principle as before just mirrored.
    aspect_ratio: '9:16',
    // CORRECTION (2026-08-07): briefly "fixed" this to `dimension: { width,
    // height }` based on a web search claiming v3 uses that shape instead of
    // a resolution string — that was wrong. HeyGen's actual v3 schema for
    // this endpoint rejects `dimension` outright: 400 invalid_parameter,
    // "Extra inputs are not permitted" (param: "dimension"). Meanwhile
    // `resolution: '720p'` has never once errored across this whole
    // integration — it's the correct field, confirmed empirically rather
    // than by (apparently outdated/wrong) docs. Reverted. Lesson: trust the
    // API's own error responses over search results when they disagree —
    // this endpoint clearly DOES strictly validate unknown fields (see the
    // "Extra inputs are not permitted" wording), so if `resolution` were
    // wrong it would 400 too, and it never has.
    resolution: '720p',
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(opts.callbackId ? { callback_id: opts.callbackId } : {}),
  }

  // The avatar picker (listHeyGenAvatars) pulls its catalog from HeyGen's
  // broad v2 /v2/avatars list (stock + talking-photo avatars) — but /v3/videos
  // defaults to the "avatar_iv" engine when `engine` is omitted, and Avatar IV
  // only works with avatars specifically built as Digital Twin/Photo Avatar
  // "looks" (see GET /v3/avatars/looks/{id}.supported_api_engines). Almost
  // none of the v2 catalog qualifies, so most avatars 400 with "This video
  // avatar does not support Avatar IV video generation" ("no avatar in the
  // vd", reported 2026-08-07). Avatar III is the older, broadly-compatible
  // engine that works with regular avatar_ids — request it explicitly instead
  // of relying on the (incompatible-for-this-catalog) default, with a single
  // retry on the other engine below in case a specific avatar goes the other
  // way. Only revisit this properly (e.g. per-avatar engine detection via
  // /v3/avatars/looks) if the picker starts offering real Digital Twin looks.
  // IMPORTANT: `engine` is an OBJECT ({ type: "avatar_iii" }), not a bare string —
  // sending a string 400s with "Input should be a valid dictionary or object to
  // extract fields from" (param: "engine"), reported 2026-08-07. Verified against
  // HeyGen's docs (developers.heygen.com/models): engine: { type: "avatar_iv" |
  // "avatar_v" | "avatar_iii" }.
  const attempt = async (engineType: string) => fetch(`${HEYGEN_API}/v3/videos`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...requestBody, engine: { type: engineType } }),
  })

  let engineUsed: 'avatar_iii' | 'avatar_iv' = 'avatar_iii'
  let res = await attempt('avatar_iii')
  let bodyText = await res.text()
  // Some avatars go the other way (built only for IV, reject III) — retry
  // once with the other engine before giving up, instead of failing an
  // avatar that actually does work, just not on the engine we guessed first.
  // NOTE: this fallback isn't just a compatibility shim — it's a real cost
  // jump. Per HeyGen's pricing (developers.heygen.com/docs/pricing), Avatar
  // III is $0.0167–0.0433/sec depending on avatar type, while Avatar IV is
  // $0.05–0.0667/sec — roughly 2-4x more expensive for the exact same clip.
  // Callers surface `engineUsed` (see startAvatarClipJob) so this cost bump
  // is visible instead of a silent per-render cost multiplier.
  if (!res.ok && /avatar iii|avatar_iii/i.test(bodyText)) {
    console.warn(`[heygenAvatar] avatar_iii rejected for ${opts.avatarId}, retrying with avatar_iv (2-4x costlier per HeyGen's pricing): ${bodyText.slice(0, 200)}`)
    res = await attempt('avatar_iv')
    bodyText = await res.text()
    engineUsed = 'avatar_iv'
  }
  if (!res.ok) {
    throw new Error(`HeyGen video generate failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }
  let videoId: string | undefined
  try { videoId = JSON.parse(bodyText)?.data?.video_id } catch { /* fall through to error below */ }
  if (!videoId) throw new Error(`HeyGen video generate: no video_id in response: ${bodyText.slice(0, 300)}`)

  console.log(`[heygenAvatar] Created avatar video job ${videoId} (v3, engine=${engineUsed})${callbackUrl ? ' with webhook callback' : ' (polling only — PUBLIC_API_BASE_URL not set)'}`)
  return { videoId, engineUsed }
}

/** GET /v3/videos/{video_id} — the v3 replacement for v1's /v1/video_status.get.
 *  Used by both the polling endpoint and (indirectly, via webhook event_data) completion. */
export async function getVideoStatusV3(videoId: string): Promise<{
  status: string // 'pending' | 'processing' | 'completed' | 'failed' (treat anything else as still-processing)
  videoUrl: string | null
  thumbnailUrl: string | null
  failureMessage: string | null
}> {
  const res = await fetch(`${HEYGEN_API}/v3/videos/${videoId}`, {
    headers: { 'x-api-key': apiKey() },
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`HeyGen status check failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }
  let json: any
  try { json = JSON.parse(bodyText) } catch { throw new Error(`HeyGen status check: non-JSON response: ${bodyText.slice(0, 300)}`) }
  const data = json?.data || {}
  return {
    status: data.status,
    videoUrl: data.video_url ?? null,
    thumbnailUrl: data.thumbnail_url ?? null,
    failureMessage: data.failure_message ?? null,
  }
}

/** Poll until the avatar video is rendered → returns the video URL.
 *  Legacy blocking path — kept for generateAvatarClip() (unused by the main async flow,
 *  see startAvatarClipJob below), now reading v3 status instead of v1. */
export async function waitForAvatarVideo(videoId: string, maxWaitMs = 15 * 60_000): Promise<string> {
  const start = Date.now()
  let pollCount = 0
  const maxPolls = Math.ceil(maxWaitMs / 5_000)

  while (Date.now() - start < maxWaitMs && pollCount < maxPolls) {
    pollCount++
    try {
      const { status, videoUrl, failureMessage } = await getVideoStatusV3(videoId)
      const elapsedSec = Math.round((Date.now() - start) / 1000)

      if (status === 'completed') {
        if (!videoUrl) throw new Error('HeyGen completed but no video_url')
        console.log(`[heygenAvatar] ✅ Avatar video ${videoId} completed after ${elapsedSec}s`)
        return videoUrl
      }
      if (status === 'failed') {
        throw new Error(`HeyGen render failed after ${elapsedSec}s: ${failureMessage || 'unknown error'}`)
      }

      console.log(`[heygenAvatar] Poll #${pollCount}: ${videoId} status=${status} (${elapsedSec}s elapsed)`)
      await new Promise(r => setTimeout(r, 5_000))
    } catch (err: any) {
      if (err.message.includes('render failed') || err.message.includes('timeout')) throw err
      console.warn(`[heygenAvatar] Poll error (will retry): ${err.message}`)
      await new Promise(r => setTimeout(r, 5_000))
    }
  }

  const elapsedMin = Math.round((Date.now() - start) / 60_000)
  throw new Error(`HeyGen render timed out after ${elapsedMin}min (${pollCount} polls). Video may still be processing on HeyGen's servers. Try checking status manually or contacting support.`)
}

/** Download the finished avatar MP4 into the local uploads dir → local path. */
export async function downloadToUploads(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Avatar video download failed (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_avatar.mp4`)
  writeFileSync(outPath, buffer)
  console.log(`[heygenAvatar] Downloaded avatar video to ${outPath} (${buffer.length} bytes)`)
  return outPath
}

/** Non-blocking variant: checks the cache and, on a miss, SUBMITS the HeyGen
 *  job and returns immediately with the video_id — no waiting. The caller
 *  persists the job id (and, as of the v3 migration, the owning sceneId) and
 *  either pollHeyGenVideo.ts or heygenWebhook.ts finishes the work (download,
 *  cache, composite) when HeyGen reports completed. This keeps API requests
 *  short instead of holding one open for the whole 2–15 min render. */
export async function startAvatarClipJob(opts: {
  audioPaths: string[]
  avatarId: string
  avatarStyle?: string | null
  avatarBackground?: string | null
  cacheKeyFiles?: string[]
  /** Echoed back in the HeyGen webhook payload as callback_id — pass sceneId (or
   *  sceneId:segmentId for a single-part preview) purely for traceability in the
   *  HeyGen dashboard. Not required for correctness — the sidecar file is the source
   *  of truth for what to do when the job completes. */
  callbackId?: string | null
}): Promise<
  | { cached: true; avatarPath: string; chromaKey: boolean }
  | { cached: false; videoId: string; cachePath: string; chromaKey: boolean; engineUsed: 'avatar_iii' | 'avatar_iv' }
> {
  const audioPath = await concatAudioFiles(opts.audioPaths)
  // Derived up front (cheap, no network) so both the cache-hit and cache-miss
  // returns below agree on whether the clip needs chroma-keying — the cached
  // file itself was rendered under the same avatarBackground (it's part of
  // the cache key just below), so this is safe to compute independently of
  // whatever createAvatarVideo would separately resolve on a miss.
  const { chromaKey } = resolveAvatarBackground(opts.avatarBackground)

  const hasher = createHash('md5')
  for (const f of (opts.cacheKeyFiles?.length ? opts.cacheKeyFiles : [audioPath])) {
    try { hasher.update(readFileSync(f)) } catch { hasher.update(f) }
  }
  const hash = hasher
    .update(opts.avatarId)
    .update(opts.avatarStyle || 'normal')
    .update(opts.avatarBackground || '')
    .update(CACHE_VERSION)
    .digest('hex')
  const cachePath = join(UPLOAD_DIR, `avatarcache_${hash}.mp4`)

  if (existsSync(cachePath)) {
    console.log(`[heygenAvatar] Cache hit — reusing avatar clip ${cachePath} (skipping HeyGen render)`)
    return { cached: true, avatarPath: cachePath, chromaKey }
  }

  const assetId = await uploadAudioAsset(audioPath)
  const { videoId, engineUsed } = await createAvatarVideo({
    avatarId: opts.avatarId,
    audioAssetId: assetId,
    avatarStyle: opts.avatarStyle,
    background: opts.avatarBackground,
    callbackId: opts.callbackId,
  })
  console.log(`[heygenAvatar] Submitted async avatar job ${videoId} (not waiting, engine=${engineUsed})`)
  return { cached: false, videoId, cachePath, chromaKey, engineUsed }
}

/** Full pipeline: TTS audio files → local path of the rendered avatar MP4.
 *
 *  Cached (#43): HeyGen takes 1-5 min per render REGARDLESS of clip length,
 *  so the finished avatar MP4 is kept on disk keyed by a hash of
 *  (audio bytes + avatar + style). Re-rendering a scene whose narration and
 *  avatar haven't changed — e.g. after tweaking only the slide design —
 *  reuses the cached clip instantly instead of hitting HeyGen again (also
 *  saves credits). */
export async function generateAvatarClip(opts: {
  audioPaths: string[]
  avatarId: string
  avatarStyle?: string | null
  avatarBackground?: string | null
  /** Stable cache key material (e.g. the raw TTS file bytes) — re-encoded
   *  audio tracks aren't byte-stable between renders, source TTS files are. */
  cacheKeyFiles?: string[]
}): Promise<string> {
  const audioPath = await concatAudioFiles(opts.audioPaths)

  const hasher = createHash('md5')
  for (const f of (opts.cacheKeyFiles?.length ? opts.cacheKeyFiles : [audioPath])) {
    try { hasher.update(readFileSync(f)) } catch { hasher.update(f) }
  }
  const hash = hasher
    .update(opts.avatarId)
    .update(opts.avatarStyle || 'normal')
    .update(opts.avatarBackground || '')
    .update(CACHE_VERSION)
    .digest('hex')
  const cachePath = join(UPLOAD_DIR, `avatarcache_${hash}.mp4`)

  if (existsSync(cachePath)) {
    console.log(`[heygenAvatar] Cache hit — reusing avatar clip ${cachePath} (skipping HeyGen render)`)
    return cachePath
  }

  const assetId = await uploadAudioAsset(audioPath)
  const { videoId } = await createAvatarVideo({
    avatarId: opts.avatarId,
    audioAssetId: assetId,
    avatarStyle: opts.avatarStyle,
    background: opts.avatarBackground,
  })
  const videoUrl = await waitForAvatarVideo(videoId)
  const localPath = await downloadToUploads(videoUrl)

  try { copyFileSync(localPath, cachePath) } catch { /* cache is best-effort */ }
  return localPath
}
