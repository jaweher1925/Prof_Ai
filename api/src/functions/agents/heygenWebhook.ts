/**
 * POST /api/heygenWebhook
 *
 * Receives video completion callbacks.
 * Called when a video finishes rendering.
 * This is the recommended approach instead of polling.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'

async function heygenWebhookHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const body = await request.json() as any

    context.log('Video webhook received:', JSON.stringify(body))

    const eventType = body.event_type
    const videoId = body.event_data?.video_id
    const videoUrl = body.event_data?.url
    const status = body.event_data?.status

    if (!videoId) {
      return { status: 200, jsonBody: { received: true } } // Always return 200
    }

    if (eventType === 'avatar_video.success' || status === 'completed') {
      // Find the scene with this video ID (stored as "heygen:{videoId}")
      const scene = await prisma.scene.findFirst({
        where: { avatarVideoUrl: `heygen:${videoId}` },
      })

      if (scene && videoUrl) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            avatarVideoUrl: videoUrl,
            status: 'approved',
          },
        })
        context.log(`Scene ${scene.id} updated via webhook with video: ${videoUrl}`)
      }
    } else if (eventType === 'avatar_video.fail' || status === 'failed') {
      const scene = await prisma.scene.findFirst({
        where: { avatarVideoUrl: `heygen:${videoId}` },
      })
      if (scene) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { status: 'assets_ready' }, // Reset for retry
        })
        context.log(`Scene ${scene.id} video generation failed`)
      }
    }

    // Always return 200 — service retries on other status codes
    return { status: 200, jsonBody: { received: true } }
  } catch (error: any) {
    context.error('heygenWebhook error:', error)
    return { status: 200, jsonBody: { received: true } } // Still 200 to stop retries
  }
}

app.http('heygenWebhook', {
  methods: ['POST'],
  route: 'heygenWebhook',
  authLevel: 'anonymous',
  handler: heygenWebhookHandler,
})
