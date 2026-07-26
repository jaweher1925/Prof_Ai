/**
 * HeyGen talking-avatar generation (#40)
 *
 * Produces a lip-synced presenter video from the scene's TTS audio:
 *   1. concatAudioFiles()      — merge per-segment TTS mp3s into one track
 *   2. uploadAudioAsset()      — push the audio to HeyGen's asset store
 *   3. createAvatarVideo()     — POST /v2/video/generate (avatar + audio)
 *   4. waitForAvatarVideo()    — poll /v1/video_status.get until completed
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
import { randomUUID, createHash } from 'crypto'

const ffmpegPath = require('ffmpeg-static')
const UPLOAD_DIR = join(process.cwd(), 'uploads')

const HEYGEN_API = 'https://api.heygen.com'
const HEYGEN_UPLOAD = 'https://upload.heygen.com'

function apiKey(): string {
  const key = process.env.HEYGEN_API_KEY
  if (!key) throw new Error('HEYGEN_API_KEY not configured')
  return key
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

/** Upload an audio file to HeyGen's asset store → returns asset id. */
export async function uploadAudioAsset(audioPath: string): Promise<string> {
  const buffer = readFileSync(audioPath)
  const res = await fetch(`${HEYGEN_UPLOAD}/v1/asset`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'audio/mpeg' },
    body: buffer,
  })
  if (!res.ok) throw new Error(`HeyGen asset upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json: any = await res.json()
  const assetId = json?.data?.id
  if (!assetId) throw new Error(`HeyGen asset upload: no asset id in response`)
  console.log(`[heygenAvatar] Uploaded audio asset ${assetId} (${buffer.length} bytes)`)
  return assetId
}

/** Create the avatar video job → returns video_id. */
export async function createAvatarVideo(opts: {
  avatarId: string
  audioAssetId: string
  avatarStyle?: string | null
  background?: string | null  // JSON string {"type":"color","value":"#1E293B"}
}): Promise<string> {
  let background: any = { type: 'color', value: '#0F172A' }
  try { if (opts.background) background = JSON.parse(opts.background) } catch { /* keep default */ }

  // HeyGen's v2 /video/generate only accepts background.type of 'color',
  // 'image' or 'video' — a 'transparent' type (from Avatar Studio's
  // transparent-background option) makes it 400 with "Input tag 'transparent'
  // … does not match any of the expected tags". The avatar is composited as a
  // solid cropped picture-in-picture box locally anyway (overlayAvatarOnVideo
  // does no chroma-keying), so real transparency isn't achievable through
  // HeyGen here — coerce it to a solid color HeyGen accepts instead of
  // crashing the whole render.
  const ALLOWED_BG = ['color', 'image', 'video']
  if (!background || typeof background !== 'object' || !ALLOWED_BG.includes(background.type)) {
    background = { type: 'color', value: (background && background.value) || '#0F172A' }
  } else if (background.type === 'color' && !background.value) {
    background.value = '#0F172A'
  }

  const submit = async (character: any): Promise<{ ok: boolean; status: number; videoId?: string; body: string }> => {
    const res = await fetch(`${HEYGEN_API}/v2/video/generate`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character,
          voice: { type: 'audio', audio_asset_id: opts.audioAssetId },
          background,
        }],
        dimension: { width: 1280, height: 720 },
      }),
    })
    const body = await res.text()
    if (!res.ok) return { ok: false, status: res.status, body }
    try {
      const videoId = JSON.parse(body)?.data?.video_id
      return videoId ? { ok: true, status: res.status, videoId, body } : { ok: false, status: res.status, body }
    } catch { return { ok: false, status: res.status, body } }
  }

  // Try as a studio avatar first; if HeyGen rejects the id (custom photo
  // avatars use a different character type), retry as a talking photo
  let result = await submit({
    type: 'avatar',
    avatar_id: opts.avatarId,
    avatar_style: opts.avatarStyle === 'closeUp' ? 'closeUp' : (opts.avatarStyle || 'normal'),
  })
  if (!result.ok && result.status >= 400 && result.status < 500) {
    console.log(`[heygenAvatar] avatar_id rejected (${result.status}), retrying as talking_photo`)
    result = await submit({ type: 'talking_photo', talking_photo_id: opts.avatarId })
  }
  if (!result.ok || !result.videoId) {
    throw new Error(`HeyGen video generate failed (${result.status}): ${result.body.slice(0, 300)}`)
  }
  console.log(`[heygenAvatar] Created avatar video job ${result.videoId}`)
  return result.videoId
}

/** Poll until the avatar video is rendered → returns the temporary video URL. */
export async function waitForAvatarVideo(videoId: string, maxWaitMs = 15 * 60_000): Promise<string> {
  const start = Date.now()
  let pollCount = 0
  const maxPolls = Math.ceil(maxWaitMs / 5_000)
  
  while (Date.now() - start < maxWaitMs && pollCount < maxPolls) {
    pollCount++
    try {
      const res = await fetch(`${HEYGEN_API}/v1/video_status.get?video_id=${videoId}`, {
        headers: { 'x-api-key': apiKey() },
      })
      if (!res.ok) {
        console.warn(`[heygenAvatar] Status check failed (${res.status}), will retry...`)
        await new Promise(r => setTimeout(r, 5_000))
        continue
      }
      const json: any = await res.json()
      const status = json?.data?.status
      const elapsedSec = Math.round((Date.now() - start) / 1000)
      
      if (status === 'completed') {
        const url = json?.data?.video_url
        if (!url) throw new Error('HeyGen completed but no video_url')
        console.log(`[heygenAvatar] ✅ Avatar video ${videoId} completed after ${elapsedSec}s`)
        return url
      }
      if (status === 'failed') {
        const error = JSON.stringify(json?.data?.error || {}).slice(0, 300)
        throw new Error(`HeyGen render failed after ${elapsedSec}s: ${error}`)
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
 *  persists the job id and pollHeyGenVideo.ts finishes the work (download,
 *  cache, composite) when HeyGen reports completed. This keeps API requests
 *  short instead of holding one open for the whole 2–15 min render. */
export async function startAvatarClipJob(opts: {
  audioPaths: string[]
  avatarId: string
  avatarStyle?: string | null
  avatarBackground?: string | null
  cacheKeyFiles?: string[]
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
