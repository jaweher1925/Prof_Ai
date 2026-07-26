/**
 * POST /api/pollHeyGenVideo
 *
 * Checks the status of a video generation job.
 * When complete, saves the final video URL to the scene.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { join, parse } from 'path'
import { existsSync, readFileSync, copyFileSync, unlinkSync } from 'fs'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { compositeAvatarOverlay, overlayAvatarOnVideo, localPathFromUploadUrl, extractAvatarPosition } from '../../lib/ffmpegVideo'
import { downloadToUploads } from '../../lib/heygenAvatar'

const HEYGEN_API = 'https://api.heygen.com'
const UPLOAD_DIR = join(process.cwd(), 'uploads')

// Guards against two pollers (VideoPanel loop + workspace render watcher)
// finalizing the same completed video concurrently.
const finalizing = new Set<string>()

async function pollHeyGenVideoHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      video_id?: string
      scene_id?: string
    }

    if (!body.video_id) {
      return { status: 400, jsonBody: { error: 'video_id is required' } }
    }

    const apiKey = process.env.HEYGEN_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
    }

    // Poll for video status
    const res = await fetch(`${HEYGEN_API}/v1/video_status.get?video_id=${body.video_id}`, {
      headers: { 'x-api-key': apiKey },
    })

    const data = await res.json() as any

    if (!res.ok) {
      return { status: res.status, jsonBody: { error: data.message || 'Video poll error' } }
    }

    const status = data.data?.status
    const videoUrl = data.data?.video_url
    const thumbnailUrl = data.data?.thumbnail_url

    context.log(`Video ${body.video_id} status: ${status}`)

    // Tracks what we actually save/return — the raw HeyGen clip unless/until
    // it gets composited onto the slide below.
    let finalVideoUrl = videoUrl
    // Surfaced to the frontend when compositing silently degrades to a
    // voice-only (or raw-clip) result — previously only logged via
    // context.warn, so the user had zero indication anything was off with
    // the avatar (reported as "no avatar in the vd").
    let avatarWarning: string | undefined

    // If completed and we have a scene_id: HeyGen's clip is just the raw
    // talking-head avatar on a solid background. Composite it locally with
    // ffmpeg into the corner of the actual slide video (slide + TTS audio
    // is the real content; avatar is the small picture-in-picture overlay).
    // This is what actually makes the avatar show up — previously the raw
    // HeyGen clip (or a mis-positioned one) was saved directly, which is why
    // generated videos looked "voice only."
    if (status === 'completed' && videoUrl && body.scene_id) {
      const scene = await prisma.scene.findUnique({
        where: { id: body.scene_id },
        include: { module: { include: { project: true } } },
      })

      // Already finalized (e.g. by a concurrent poll) — don't redo the work
      // or overwrite the composited video with a re-derived one.
      if (scene?.avatarVideoUrl && !scene.avatarVideoUrl.startsWith('heygen:')) {
        return {
          status: 200,
          jsonBody: {
            video_id: body.video_id,
            status: 'completed',
            video_url: scene.avatarVideoUrl,
            thumbnail_url: thumbnailUrl || null,
            completed: true,
          },
        }
      }

      // ── Async job path (generateHeyGenAvatar submitted the job and left a
      // sidecar with the slide video + cache path) — finish it here:
      // download the clip, populate the avatar cache, composite the overlay.
      const sidecarPath = join(UPLOAD_DIR, `heygen_pending_${body.video_id}.json`)
      if (existsSync(sidecarPath)) {
        if (finalizing.has(body.video_id)) {
          // Another request is already compositing — report still-processing
          return {
            status: 200,
            jsonBody: { video_id: body.video_id, status: 'processing', video_url: null, completed: false },
          }
        }
        finalizing.add(body.video_id)
        try {
          const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
            slideVideoUrl: string; cachePath?: string; createdAt?: number
            avatarPosition?: { x: number; y: number; width: number } | null
            preview?: boolean
          }
          
          // Check if this job has been pending for too long (>30 min indicates a problem)
          const createdAt = meta.createdAt || Date.now()
          const elapsedMin = Math.round((Date.now() - createdAt) / 60_000)
          if (elapsedMin > 30) {
            context.warn(`Scene ${body.scene_id}: HeyGen job ${body.video_id} pending for ${elapsedMin}min, possible stuck job`)
          }
          
          const avatarPath = await downloadToUploads(videoUrl)
          if (meta.cachePath) {
            try { copyFileSync(avatarPath, meta.cachePath) } catch { /* cache is best-effort */ }
          }

          let finalUrl = meta.slideVideoUrl // fallback: slide-only video
          // Surfaced to the frontend when compositing fails so the user
          // actually finds out the video came back voice-only instead of
          // silently getting a video with no avatar and no explanation
          // (previously only logged server-side via context.warn).
          let avatarWarning: string | undefined
          const basePath = localPathFromUploadUrl(meta.slideVideoUrl)
          if (basePath) {
            try {
              const finalPath = await overlayAvatarOnVideo(basePath, avatarPath, meta.avatarPosition)
              finalUrl = `/api/uploads/${parse(finalPath).base}`
              context.log(`Scene ${body.scene_id}: async avatar composited onto slide video after ${elapsedMin}min`)
            } catch (e: any) {
              context.warn(`Scene ${body.scene_id}: overlay failed, keeping slide-only video — ${e?.message}`)
              avatarWarning = `Speaking avatar rendering failed (${e?.message || 'unknown error'}) — rendered voice-only.`
            }
          } else {
            avatarWarning = 'Could not locate the rendered slide video to overlay the avatar onto — rendered voice-only.'
          }

          // A single-part Visual Design PREVIEW must NOT be written to
          // Scene.avatarVideoUrl — that field is the full-scene video Video
          // Editing assembles from, and one part isn't the whole scene. Just
          // return the composited preview clip; the scene's own video is
          // produced by the normal (non-preview) full-scene render.
          if (!meta.preview) {
            await prisma.scene.update({
              where: { id: body.scene_id },
              data: { avatarVideoUrl: finalUrl, status: 'completed' },
            })
          }
          try { unlinkSync(sidecarPath) } catch { /* best-effort cleanup */ }

          return {
            status: 200,
            jsonBody: {
              video_id: body.video_id,
              status: 'completed',
              video_url: finalUrl,
              thumbnail_url: thumbnailUrl || null,
              completed: true,
              ...(meta.preview ? { single_part: true } : {}),
              ...(avatarWarning ? { avatar_warning: avatarWarning } : {}),
            },
          }
        } finally {
          finalizing.delete(body.video_id)
        }
      }

      // ── Legacy path: composite from the slide image + TTS audio
      if (scene?.ttsAudioUrl) {
        try {
          let parsedCues: { text: string; duration_seconds?: number }[] | null = null
          try { parsedCues = scene.textCues ? JSON.parse(scene.textCues) : null } catch { /* no cues, ignore */ }

          // Avatar Studio's Layout (Original/Circle) + Radius + Background controls (#37)
          // are saved as extra keys on Project.avatarBackground's JSON blob —
          // pull them out here so the locally-composited PiP actually reflects
          // what was chosen in Avatar Studio instead of always being a plain box.
          let avatarLayout: 'original' | 'circle' | null = null
          let avatarRadius: number | null = null
          let avatarBgType: 'color' | 'transparent' | null = null
          let avatarBgColor: string | null = null
          try {
            const bg = scene.module?.project?.avatarBackground ? JSON.parse(scene.module.project.avatarBackground) : null
            if (bg?.layout === 'circle') avatarLayout = 'circle'
            if (typeof bg?.radius === 'number') avatarRadius = bg.radius
            if (bg?.type === 'transparent') avatarBgType = 'transparent'
            else if (bg?.type === 'color' && bg?.value) { avatarBgType = 'color'; avatarBgColor = bg.value }
          } catch { /* malformed JSON — keep defaults */ }

          finalVideoUrl = await compositeAvatarOverlay({
            audioUrl: scene.ttsAudioUrl,
            avatarVideoUrl: videoUrl,
            slideImageUrl: scene.visualAssetUrl,
            textAnimationType: scene.textAnimationType,
            textCues: parsedCues,
            avatarLayout,
            avatarRadius,
            avatarBgType: avatarBgType || 'color',
            avatarBgColor: avatarBgColor || '#1E293B',
          })
          context.log(`Scene ${body.scene_id}: composited avatar onto slide locally`)
        } catch (compositeErr: any) {
          // Fall back to the raw HeyGen clip rather than failing the whole
          // job — the user still gets a video, just without the slide
          // merged in. Logged so it's visible this path was hit.
          context.warn(`Scene ${body.scene_id}: local avatar composite failed, falling back to raw HeyGen clip — ${compositeErr?.message}`)
          finalVideoUrl = videoUrl
          avatarWarning = `Speaking avatar rendering failed (${compositeErr?.message || 'unknown error'}) — kept the raw avatar clip without the slide merged in.`
        }
      } else {
        context.warn(`Scene ${body.scene_id}: no ttsAudioUrl found, cannot composite — saving raw HeyGen clip`)
        avatarWarning = 'No narration audio was found for this scene, so the avatar could not be composited onto the slide — saved the raw avatar clip instead.'
      }

      await prisma.scene.update({
        where: { id: body.scene_id },
        data: {
          avatarVideoUrl: finalVideoUrl,
          status: 'approved',
        },
      })
      context.log(`Scene ${body.scene_id} updated with video URL`)
    } else if (status === 'failed' && body.scene_id) {
      context.warn(`Scene ${body.scene_id}: HeyGen job ${body.video_id} failed`)
      await prisma.scene.update({
        where: { id: body.scene_id },
        data: { status: 'assets_ready' }, // Reset so user can retry
      })
    } else if (status === 'processing' && body.scene_id) {
      // Check sidecar for how long this has been pending
      const sidecarPath = join(UPLOAD_DIR, `heygen_pending_${body.video_id}.json`)
      if (existsSync(sidecarPath)) {
        try {
          const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as { createdAt?: number }
          const createdAt = meta.createdAt || Date.now()
          const elapsedMin = Math.round((Date.now() - createdAt) / 60_000)
          if (elapsedMin > 25) {
            context.warn(`Scene ${body.scene_id}: HeyGen job still processing after ${elapsedMin}min (approaching timeout)`)
          }
        } catch { /* ignore sidecar read errors */ }
      }
    }

    return {
      status: 200,
      jsonBody: {
        video_id: body.video_id,
        status,
        video_url: finalVideoUrl || null,
        thumbnail_url: thumbnailUrl || null,
        completed: status === 'completed',
        ...(avatarWarning ? { avatar_warning: avatarWarning } : {}),
      },
    }
  } catch (error: any) {
    context.error('pollHeyGenVideo error:', error)
    return { status: 500, jsonBody: { error: error.message } }
  }
}

app.http('pollHeyGenVideo', {
  methods: ['POST'],
  route: 'pollHeyGenVideo',
  authLevel: 'anonymous',
  handler: pollHeyGenVideoHandler,
})
