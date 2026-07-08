/**
 * POST /api/generateHeyGenAvatar
 *
 * Step 5 of the pipeline — Voice to Video (expensive, last).
 * Renders visual slides + TTS audio into video.
 * 
 * For now: Voice-only (no HeyGen avatar overlay yet)
 * Simply: Convert slideDesign + audio → video
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { parse, join } from 'path'
import { writeFileSync } from 'fs'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import {
  renderSegmentsToVideo,
  overlayAvatarOnVideo,
  localPathFromUploadUrl,
  extractAudioTrack,
} from '../../lib/ffmpegVideo'
import { startAvatarClipJob } from '../../lib/heygenAvatar'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

/**
 * Talking-avatar overlay (#40), now NON-BLOCKING:
 * - avatar cached (narration unchanged) → composite immediately, done.
 * - cache miss → submit the HeyGen job and return its video_id; a sidecar
 *   JSON next to the uploads remembers the slide video + cache path so
 *   pollHeyGenVideo.ts can finish (download → cache → composite) when HeyGen
 *   completes. The HTTP request no longer sits open for the 2–15 min render.
 * Any failure falls back to the slide-only video so rendering never breaks.
 */
async function addAvatarOrQueue(
  context: InvocationContext,
  slideVideoUrl: string,
  audioUrls: string[],
  moduleId: string,
  useAvatar: boolean
): Promise<{ pending: false; videoUrl: string } | { pending: true; heygenVideoId: string }> {
  try {
    if (!useAvatar) {
      context.log('[generateHeyGenAvatar] Voice-only mode requested — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl }
    }
    if (!process.env.HEYGEN_API_KEY) {
      context.log('[generateHeyGenAvatar] No HEYGEN_API_KEY — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl }
    }
    const module_ = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { project: true },
    })
    const project = module_?.project
    if (!project?.defaultAvatarId) {
      context.log('[generateHeyGenAvatar] No avatar selected on project — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl }
    }

    const basePath = localPathFromUploadUrl(slideVideoUrl)
    if (!basePath) {
      context.warn('[generateHeyGenAvatar] Slide video not found locally — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl }
    }

    // Drive the avatar from the FINAL video's own audio track (not the raw
    // TTS files) so lip-sync stays exact even though crossfade transitions
    // shorten the timeline. Falls back to the raw TTS audio if extraction
    // fails for any reason.
    let audioPaths: string[]
    try {
      audioPaths = [await extractAudioTrack(basePath)]
    } catch {
      audioPaths = audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p)
    }
    if (!audioPaths.length) {
      context.warn('[generateHeyGenAvatar] No audio available — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl }
    }

    const job = await startAvatarClipJob({
      audioPaths,
      avatarId: project.defaultAvatarId,
      avatarStyle: project.avatarStyle,
      avatarBackground: project.avatarBackground,
      // Cache key = the raw TTS files: stable across re-renders, changes
      // exactly when the narration audio actually changes
      cacheKeyFiles: audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p),
    })

    if (job.cached) {
      const finalPath = await overlayAvatarOnVideo(basePath, job.avatarPath)
      const finalUrl = `/api/uploads/${parse(finalPath).base}`
      context.log(`[generateHeyGenAvatar] ✅ Avatar composited from cache: ${finalUrl}`)
      return { pending: false, videoUrl: finalUrl }
    }

    // Sidecar so pollHeyGenVideo can finish the job later
    writeFileSync(
      join(UPLOAD_DIR, `heygen_pending_${job.videoId}.json`),
      JSON.stringify({ slideVideoUrl, cachePath: job.cachePath, createdAt: Date.now() })
    )
    context.log(`[generateHeyGenAvatar] HeyGen job ${job.videoId} submitted — completing asynchronously via poll`)
    return { pending: true, heygenVideoId: job.videoId }
  } catch (err: any) {
    context.warn(`[generateHeyGenAvatar] Avatar overlay failed — using slide-only video: ${err?.message}`)
    return { pending: false, videoUrl: slideVideoUrl }
  }
}

/** Shared tail for both scene shapes: either finish now (voice-only / cached
 *  avatar) or persist the pending HeyGen job and return the video_id the
 *  frontend polls. */
async function finishOrQueue(
  context: InvocationContext,
  sceneId: string,
  moduleId: string,
  slideVideoUrl: string,
  audioUrls: string[],
  useAvatar: boolean
): Promise<HttpResponseInit> {
  const avatar = await addAvatarOrQueue(context, slideVideoUrl, audioUrls, moduleId, useAvatar)

  if (avatar.pending) {
    await prisma.scene.update({
      where: { id: sceneId },
      data: { avatarVideoUrl: `heygen:${avatar.heygenVideoId}`, status: 'rendering' },
    })
    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: sceneId,
        video_id: avatar.heygenVideoId,
        status: 'rendering',
      },
    }
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { avatarVideoUrl: avatar.videoUrl, status: 'completed' },
  })
  context.log(`[generateHeyGenAvatar] ✅ Completed: ${avatar.videoUrl}`)
  return {
    status: 200,
    jsonBody: { success: true, scene_id: sceneId, video_url: avatar.videoUrl },
  }
}

async function generateHeyGenAvatarHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { scene_id?: string; use_avatar?: boolean }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }
    // Honour the frontend's voice-only toggle (was previously ignored)
    const useAvatar = body.use_avatar !== false

    // Get scene with module and segments (explicitly select all segment fields)
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: {
        module: true,
        segments: { 
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            text: true,
            slideDesign: true,
            ttsAudioUrl: true,
            textAnimationTimings: true,
            segmentType: true,
          }
        },
      },
    })

    if (!scene) {
      return { status: 404, jsonBody: { error: 'Scene not found' } }
    }

    const hasSegments = scene.segments.length > 0

    if (hasSegments) {
      // Validate all segments have audio
      const missingAudio = scene.segments.find(s => !s.ttsAudioUrl)
      if (missingAudio) {
        return { status: 400, jsonBody: { error: `Segment ${missingAudio.id}: No TTS audio. Run TTS generation first.` } }
      }
      
      // Cast segments to RenderableSegment format
      const segments = scene.segments.map(s => ({
        id: s.id,
        text: s.text,
        slideDesign: s.slideDesign || '{}',
        ttsAudioUrl: s.ttsAudioUrl || '',
        textAnimationTimings: s.textAnimationTimings || null,
        motionId: scene.textAnimationType || 'word-by-word',
      }))

      context.log(`[generateHeyGenAvatar] Rendering ${segments.length} segments for scene ${body.scene_id}`)

      try {
        const videoUrl = await renderSegmentsToVideo({
          segments,
          moduleTitle: scene.module?.title,
        })

        // Talking-avatar overlay (#40) — async when not cached
        return await finishOrQueue(
          context,
          body.scene_id,
          scene.moduleId,
          videoUrl,
          segments.map(s => s.ttsAudioUrl),
          useAvatar
        )
      } catch (renderErr: any) {
        context.error(`[generateHeyGenAvatar] Render failed:`, renderErr)
        await prisma.scene.update({
          where: { id: body.scene_id },
          data: { status: 'assets_ready' },
        })
        return {
          status: 500,
          jsonBody: { error: `Video render failed: ${renderErr?.message}` },
        }
      }
    } else {
      // Non-segmented scene: use legacy slideDeckContent
      if (!scene.slideDeckContent) {
        return { status: 400, jsonBody: { error: 'Scene has no slide design. Use Visual Designer first.' } }
      }

      if (!scene.ttsAudioUrl) {
        return { status: 400, jsonBody: { error: 'Scene has no TTS audio. Run TTS generation first.' } }
      }

      context.log(`[generateHeyGenAvatar] Rendering single-slide scene ${body.scene_id}`)

      try {
        // Convert single slide to segment format
        const segment: any = {
          id: 'single-slide',
          text: scene.scriptContent || '',  // narration → caption animation source
          slideDesign: scene.slideDeckContent,
          ttsAudioUrl: scene.ttsAudioUrl,
          motionId: scene.textAnimationType || 'word-by-word',
        }
        
        const videoUrl = await renderSegmentsToVideo({
          segments: [segment],
          moduleTitle: scene.module?.title,
        })

        // Talking-avatar overlay (#40) — async when not cached
        return await finishOrQueue(
          context,
          body.scene_id,
          scene.moduleId,
          videoUrl,
          [scene.ttsAudioUrl || ''],
          useAvatar
        )
      } catch (renderErr: any) {
        context.error(`[generateHeyGenAvatar] Render failed:`, renderErr)
        await prisma.scene.update({
          where: { id: body.scene_id },
          data: { status: 'assets_ready' },
        })
        return {
          status: 500,
          jsonBody: { error: `Video render failed: ${renderErr?.message}` },
        }
      }
    }
  } catch (error: any) {
    context.error(`[generateHeyGenAvatar] Error:`, error)
    return { status: 500, jsonBody: { error: error?.message || 'Video generation failed' } }
  }
}

app.http('generateHeyGenAvatar', {
  methods: ['POST'],
  route: 'generateHeyGenAvatar',
  authLevel: 'anonymous',
  handler: generateHeyGenAvatarHandler,
})
