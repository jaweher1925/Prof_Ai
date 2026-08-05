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
}): Promise<string> {
  let background: any = { type: 'color', value: '#0F172A' }
  try { if (opts.background) background = JSON.parse(opts.background) } catch { /* keep default */ }

  // v3 /v3/videos only documents 'color' and 'image' background types for avatar videos
  // (no 'transparent', no 'video'). The avatar is composited as a solid cropped
  // picture-in-picture box locally anyway (overlayAvatarOnVideo does no chroma-keying),
  // so real transparency isn't achievable through HeyGen here — coerce anything else to
  // a solid color HeyGen accepts instead of a 400.
  const ALLOWED_BG = ['color', 'image']
  if (!background || typeof background !== 'object' || !ALLOWED_BG.includes(background.type)) {
    background = { type: 'color', value: (background && background.value) || '#0F172A' }
  } else if (background.type === 'color' && !background.value) {
    background.value = '#0F172A'
  }

  // v2's `avatar_style: 'closeUp' | 'normal'` framing control has no documented equivalent
  // in the v3 /v3/videos schema (type: avatar / audio_asset_id path). Rather than guess at
  // an undocumented field and risk a 400, surface this loudly so a closeUp preference is
  // visibly dropped instead of silently ignored — verify against HeyGen's live request
  // schema (`heygen video create --request-schema`) if framing control turns out to matter.
  if (opts.avatarStyle === 'closeUp') {
    console.warn('[heygenAvatar] avatarStyle="closeUp" requested but HeyGen v3 has no confirmed equivalent — framing preference NOT applied on this render.')
  }

  const callbackUrl = publicCallbackUrl()
  const res = await fetch(`${HEYGEN_API}/v3/videos`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'avatar',
      avatar_id: opts.avatarId,
      audio_asset_id: opts.audioAssetId,
      background,
      aspect_ratio: '16:9',
      resolution: '720p',
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      ...(opts.callbackId ? { callback_id: opts.callbackId } : {}),
    }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`HeyGen video generate failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }
  let videoId: string | undefined
  try { videoId = JSON.parse(bodyText)?.data?.video_id } catch { /* fall through to error below */ }
  if (!videoId) throw new Error(`HeyGen video generate: no video_id in response: ${bodyText.slice(0, 300)}`)

  console.log(`[heygenAvatar] Created avatar video job ${videoId} (v3)${callbackUrl ? ' with webhook callback' : ' (polling only — PUBLIC_API_BASE_URL not set)'}`)
  return videoId
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
  | { cached: true; avatarPath: string }
  | { cached: false; videoId: string; cachePath: string }
> {
  const audioPath = await concatAudioFiles(opts.audioPaths)

  const hasher = createHash('md5')
  for (const f of (opts.cacheKeyFiles?.length ? opts.cacheKeyFiles : [audioPath])) {
    try { hasher.update(readFileSync(f)) } catch { hasher.update(f) }
  }
  const hash = hasher
    .update(opts.avatarId)
    .update(opts.avatarStyle || 'normal')
    .update(opts.avatarBackground || '')
    .digest('hex')
  const cachePath = join(UPLOAD_DIR, `avatarcache_${hash}.mp4`)

  if (existsSync(cachePath)) {
    console.log(`[heygenAvatar] Cache hit — reusing avatar clip ${cachePath} (skipping HeyGen render)`)
    return { cached: true, avatarPath: cachePath }
  }

  const assetId = await uploadAudioAsset(audioPath)
  const videoId = await createAvatarVideo({
    avatarId: opts.avatarId,
    audioAssetId: assetId,
    avatarStyle: opts.avatarStyle,
    background: opts.avatarBackground,
    callbackId: opts.callbackId,
  })
  console.log(`[heygenAvatar] Submitted async avatar job ${videoId} (not waiting)`)
  return { cached: false, videoId, cachePath }
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
    .digest('hex')
  const cachePath = join(UPLOAD_DIR, `avatarcache_${hash}.mp4`)

  if (existsSync(cachePath)) {
    console.log(`[heygenAvatar] Cache hit — reusing avatar clip ${cachePath} (skipping HeyGen render)`)
    return cachePath
  }

  const assetId = await uploadAudioAsset(audioPath)
  const videoId = await createAvatarVideo({
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
