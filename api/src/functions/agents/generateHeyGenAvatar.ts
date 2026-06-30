/**
 * POST /api/generateHeyGenAvatar
 *
 * Step 5 of the pipeline — Voice to Video (expensive, last).
 * Takes a scene's TTS audio + visual background + avatar selection
 * and submits a video generation job.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { renderVoiceOnlyVideo, renderSceneSegmentsVideo } from '../../lib/ffmpegVideo'

const HEYGEN_API = 'https://api.heygen.com'
const HEYGEN_UPLOAD_API = 'https://upload.heygen.com'
const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818' // free default avatar
const UPLOAD_DIR = join(process.cwd(), 'uploads')

/** Turn a relative /api/uploads/... path into an absolute, internet-reachable URL.
 *  HeyGen's servers fetch the audio/image over the public internet — they cannot
 *  reach "localhost". Set PUBLIC_BASE_URL (e.g. an ngrok/tunnel URL) in api/.env
 *  when testing avatar video generation locally. Only used as a fallback now —
 *  see uploadLocalAudioToHeyGen below for the path that avoids needing this
 *  entirely for locally-stored audio (ElevenLabs TTS output).
 */
function toAbsoluteUrl(url: string, request: HttpRequest): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (base) return `${base}${url}`
  const host = request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return `${proto}://${host}${url}`
}

function isLocalUrl(url: string): boolean {
  return /:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(url)
}

/** Resolve a "/api/uploads/xyz.mp3" URL to its local file path on disk, if it exists. */
function localPathFromUploadUrl(url?: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/api\/uploads\/([^/?]+)/)
  if (!match) return null
  const path = join(UPLOAD_DIR, match[1])
  return existsSync(path) ? path : null
}

/**
 * Pushes a locally-stored audio file's bytes straight to HeyGen's own asset
 * storage (POST https://upload.heygen.com/v1/asset, raw binary body) instead
 * of asking HeyGen to fetch it from us — this is what actually fixes the
 * "HeyGen cannot reach a localhost URL" problem, because there is no URL for
 * HeyGen to fetch in the first place: we hand them the bytes directly and
 * they return back a URL already hosted on their own CDN. No PUBLIC_BASE_URL/
 * ngrok tunnel needed for the common case (ElevenLabs TTS output sitting in
 * api/uploads). See https://docs.heygen.com/reference/upload-asset.
 */
async function uploadLocalAudioToHeyGen(localPath: string, apiKey: string): Promise<string> {
  const buffer = readFileSync(localPath)
  const res = await fetch(`${HEYGEN_UPLOAD_API}/v1/asset`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'audio/mpeg' },
    body: buffer,
  })
  const data = await res.json() as any
  const hostedUrl = data?.data?.url || data?.url
  if (!res.ok || !hostedUrl) {
    const msg = (typeof data?.error === 'string' && data.error) || data?.error?.message || data?.message || `HeyGen asset upload failed (${res.status})`
    throw new Error(msg)
  }
  return hostedUrl
}

async function generateHeyGenAvatarHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      scene_id?: string
      avatar_id?: string
      voice_id?: string
      use_avatar?: boolean
    }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    // Get scene with module, project, and segment info. A scene rendered from
    // segments (#32 — see schema.prisma's SceneSegment doc comment) carries
    // its narration per-segment instead of on scene.ttsAudioUrl directly.
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: {
        module: { include: { project: true } },
        segments: { orderBy: { orderIndex: 'asc' } },
      },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const hasSegments = scene.segments.length > 0
    const segmentsHaveAudio = hasSegments && scene.segments.every(s => !!s.ttsAudioUrl)

    if (!scene.ttsAudioUrl && !segmentsHaveAudio) {
      return { status: 400, jsonBody: { error: 'Scene has no TTS audio yet. Generate voice first.' } }
    }

    // ── Voice-only mode: skip HeyGen entirely, render audio + static slide locally ──
    // Avatar slide space is still reserved by the frontend (avatar placeholder block).
    if (body.use_avatar === false) {
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'rendering' } })
      try {
        let parsedCues: { text: string; duration_seconds?: number }[] | null = null
        try { parsedCues = scene.textCues ? JSON.parse(scene.textCues) : null } catch { /* no cues, ignore */ }

        const videoUrl = hasSegments
          ? await renderSceneSegmentsVideo({
              segments: scene.segments,
              textAnimationType: scene.textAnimationType,
              moduleTitle: scene.module?.title,
            })
          : await renderVoiceOnlyVideo({
              audioUrl: scene.ttsAudioUrl as string,
              imageUrl: scene.visualAssetUrl,
              textAnimationType: scene.textAnimationType,
              textCues: parsedCues,
            })
        await prisma.scene.update({
          where: { id: body.scene_id },
          data: { avatarVideoUrl: videoUrl, status: 'completed' },
        })
        return {
          status: 200,
          jsonBody: { success: true, scene_id: body.scene_id, completed: true, video_url: videoUrl, mode: 'voice_only' },
        }
      } catch (e: any) {
        await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
        context.error('Voice-only render error:', e)
        return { status: 500, jsonBody: { error: e?.message || 'Voice-only video render failed' } }
      }
    }

    const apiKey = process.env.HEYGEN_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
    }

    // Resolve avatar ID: body > project default > system default
    const avatarId = body.avatar_id
      || scene.module?.project?.defaultAvatarId
      || DEFAULT_AVATAR_ID

    // Resolve avatar style + background from the Avatar Studio settings (#37),
    // saved as JSON strings on Project. Both fall back to the same values this
    // endpoint always used before Avatar Studio existed, so projects that
    // never visited that stage keep behaving exactly as before.
    const avatarStyle = scene.module?.project?.avatarStyle || 'normal'

    // Build the HeyGen-compatible background object.
    // HeyGen only accepts type: 'color' | 'image' | 'video' — never 'transparent'.
    // We also strip our internal-only keys (layout, radius) before sending.
    // When the user picks "transparent/none", we send black (#000000) which
    // disappears entirely after ffmpeg composites the PiP over the slide.
    let avatarBackground: { type: string; value: string } = { type: 'color', value: '#1E293B' }
    try {
      const raw = scene.module?.project?.avatarBackground
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const bgType  = typeof parsed.type  === 'string' ? parsed.type  : 'color'
        const bgValue = typeof parsed.value === 'string' ? parsed.value : '#1E293B'
        // Map 'transparent' → 'color' with black; pass 'image'/'video' through as-is
        if (bgType === 'transparent' || bgType === 'color') {
          avatarBackground = {
            type:  'color',
            value: bgType === 'transparent' ? '#000000' : bgValue,
          }
        } else if (bgType === 'image' || bgType === 'video') {
          avatarBackground = { type: bgType, value: bgValue }
        }
      }
    } catch { /* malformed JSON — keep default background */ }

    context.log(`Generating video for scene ${body.scene_id} with avatar ${avatarId} (style: ${avatarStyle})`)

    // scene.ttsAudioUrl is only a back-compat mirror of the first segment's
    // audio (see generateTTS.ts) — fall back to it directly here so this
    // still works even if the mirror hasn't been (re)written for some reason.
    const resolvedAudioUrl = scene.ttsAudioUrl || scene.segments.find(s => s.ttsAudioUrl)?.ttsAudioUrl
    if (!resolvedAudioUrl) {
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
      return { status: 400, jsonBody: { error: 'Scene has no TTS audio yet. Generate voice first.' } }
    }

    let absoluteAudioUrl = toAbsoluteUrl(resolvedAudioUrl, request)
    if (isLocalUrl(absoluteAudioUrl)) {
      // Don't immediately give up — push the audio file's bytes straight to
      // HeyGen's own asset storage instead of asking them to fetch a URL they
      // can't reach. This is what removes the PUBLIC_BASE_URL/ngrok tunnel
      // requirement for the common case (ElevenLabs TTS output sitting in
      // api/uploads). Only fall through to the tunnel-required error below if
      // that upload itself fails for some other reason (network down, file
      // missing, etc.) or the audio isn't a local upload we can read from disk.
      const localPath = localPathFromUploadUrl(resolvedAudioUrl)
      if (localPath) {
        try {
          absoluteAudioUrl = await uploadLocalAudioToHeyGen(localPath, apiKey)
          context.log(`Uploaded local audio to HeyGen asset storage for scene ${body.scene_id}`)
        } catch (uploadErr: any) {
          await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
          return {
            status: 400,
            jsonBody: {
              error: `Could not upload audio to HeyGen directly (${uploadErr?.message || 'unknown error'}). ` +
                     'Set PUBLIC_BASE_URL in api/.env to a publicly reachable tunnel URL (e.g. ngrok), or use "Generate without avatar" instead.',
            },
          }
        }
      } else {
        await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
        return {
          status: 400,
          jsonBody: {
            error: 'HeyGen cannot reach a localhost URL to fetch your audio. Set PUBLIC_BASE_URL in api/.env ' +
                   'to a publicly reachable tunnel URL (e.g. ngrok), or use "Generate without avatar" instead.',
          },
        }
      }
    }

    // Update scene status
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: { status: 'rendering' },
    })

    // Build video API request
    //
    // HeyGen only renders the avatar talking-head clip here — plain solid
    // background, full-frame, default framing. We deliberately do NOT send
    // the slide as the background and do NOT rely on HeyGen's offset/scale
    // params to shrink the avatar into a corner: those units aren't fully
    // documented and in practice produced an avatar that ended up entirely
    // off-frame (the rendered video looked "voice only", no avatar visible
    // anywhere). Instead, once this clip comes back, pollHeyGenVideo composites
    // it locally with ffmpeg — cropping it down and overlaying it into the
    // Visual Designer's reserved bottom-right presenter box on top of the
    // actual slide video. See compositeAvatarOverlay() in
    // api/src/lib/ffmpegVideo.ts. This gives pixel-exact, reliable placement
    // instead of guessing at an undocumented remote API's coordinate system.
    const heygenBody: Record<string, unknown> = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: avatarStyle,
          },
          voice: {
            type: 'audio',
            audio_url: absoluteAudioUrl,
          },
          background: avatarBackground,
        },
      ],
      dimension: { width: 1280, height: 720 },
      aspect_ratio: '16:9',
    }

    const heygenResponse = await fetch(`${HEYGEN_API}/v2/video/generate`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(heygenBody),
    })

    const heygenData = await heygenResponse.json() as any

    if (!heygenResponse.ok || heygenData.error) {
      context.error('Video API error:', heygenData)
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
      // heygenData.error can be a string OR an object like { code, message } — always
      // flatten to a plain string so it's safe to render directly in the UI.
      const rawError = heygenData.error
      const errorMessage =
        (typeof rawError === 'string' && rawError) ||
        rawError?.message ||
        heygenData.message ||
        'Video API error'
      return {
        status: heygenResponse.status,
        jsonBody: { error: errorMessage },
      }
    }

    const videoId = heygenData.data?.video_id
    if (!videoId) throw new Error('No video_id returned')

    // Store video ID in scene for polling
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        // Store the video job ID temporarily
        avatarVideoUrl: `heygen:${videoId}`,
        status: 'rendering',
      },
    })

    context.log(`Video job started for scene ${body.scene_id}: video_id=${videoId}`)

    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: body.scene_id,
        video_id: videoId,
        status: 'rendering',
        message: 'Video generation started. Use pollHeyGenVideo to check completion.',
      },
    }
  } catch (error: any) {
    context.error('generateHeyGenAvatar error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Video generation failed' } }
  }
}

app.http('generateHeyGenAvatar', {
  methods: ['POST'],
  route: 'generateHeyGenAvatar',
  authLevel: 'anonymous',
  handler: generateHeyGenAvatarHandler,
})
