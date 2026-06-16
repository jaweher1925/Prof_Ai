/**
 * POST /api/pollHeyGenVideo
 *
 * Checks the status of a video generation job.
 * When complete, saves the final video URL to the scene.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'

const HEYGEN_API = 'https://api.heygen.com'

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

    // If completed and we have a scene_id, update the scene
    if (status === 'completed' && videoUrl && body.scene_id) {
      await prisma.scene.update({
        where: { id: body.scene_id },
        data: {
          avatarVideoUrl: videoUrl,
          status: 'approved',
        },
      })
      context.log(`Scene ${body.scene_id} updated with video URL`)
    } else if (status === 'failed' && body.scene_id) {
      await prisma.scene.update({
        where: { id: body.scene_id },
        data: { status: 'assets_ready' }, // Reset so user can retry
      })
    }

    return {
      status: 200,
      jsonBody: {
        video_id: body.video_id,
        status,
        video_url: videoUrl || null,
        thumbnail_url: thumbnailUrl || null,
        completed: status === 'completed',
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
