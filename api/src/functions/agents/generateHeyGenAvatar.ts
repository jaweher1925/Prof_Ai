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
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { renderSegmentsToVideo } from '../../lib/ffmpegVideo'

async function generateHeyGenAvatarHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { scene_id?: string }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    // Get scene with module and segments
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: {
        module: true,
        segments: { orderBy: { orderIndex: 'asc' } },
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
      }))

      context.log(`[generateHeyGenAvatar] Rendering ${segments.length} segments for scene ${body.scene_id}`)

      try {
        const videoUrl = await renderSegmentsToVideo({
          segments,
          moduleTitle: scene.module?.title,
        })

        await prisma.scene.update({
          where: { id: body.scene_id },
          data: {
            avatarVideoUrl: videoUrl,
            status: 'completed',
          },
        })

        context.log(`[generateHeyGenAvatar] ✅ Completed: ${videoUrl}`)

        return {
          status: 200,
          jsonBody: {
            success: true,
            scene_id: body.scene_id,
            video_url: videoUrl,
          },
        }
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
          text: '',
          slideDesign: scene.slideDeckContent,
          ttsAudioUrl: scene.ttsAudioUrl,
        }
        
        const videoUrl = await renderSegmentsToVideo({
          segments: [segment],
          moduleTitle: scene.module?.title,
        })

        await prisma.scene.update({
          where: { id: body.scene_id },
          data: {
            avatarVideoUrl: videoUrl,
            status: 'completed',
          },
        })

        context.log(`[generateHeyGenAvatar] ✅ Completed: ${videoUrl}`)

        return {
          status: 200,
          jsonBody: {
            success: true,
            scene_id: body.scene_id,
            video_url: videoUrl,
          },
        }
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
