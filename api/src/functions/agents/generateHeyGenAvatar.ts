/**
 * POST /api/generateHeyGenAvatar
 *
 * Step 5 of the pipeline — Voice to Video (expensive, last).
 * Takes a scene's TTS audio + visual background + avatar selection
 * and submits a HeyGen video generation job.
 *
 * Written from scratch — no Base44 dependency.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'

const HEYGEN_API = 'https://api.heygen.com'
const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818' // free default HeyGen avatar

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
    }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    const apiKey = process.env.HEYGEN_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
    }

    // Get scene with module and project info
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { module: { include: { project: true } } },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    if (!scene.ttsAudioUrl) {
      return { status: 400, jsonBody: { error: 'Scene has no TTS audio yet. Generate voice first.' } }
    }

    // Resolve avatar ID: body > project default > system default
    const avatarId = body.avatar_id
      || scene.module?.project?.defaultAvatarId
      || DEFAULT_AVATAR_ID

    context.log(`Generating HeyGen video for scene ${body.scene_id} with avatar ${avatarId}`)

    // Update scene status
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: { status: 'rendering' },
    })

    // Build HeyGen API request
    // HeyGen v2 video generation
    const heygenBody: Record<string, unknown> = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'audio',
            audio_url: scene.ttsAudioUrl,
          },
          background: scene.visualAssetUrl
            ? {
                type: 'image',
                url: scene.visualAssetUrl,
              }
            : {
                type: 'color',
                value: '#1E293B',
              },
        },
      ],
      dimension: { width: 1280, height: 720 },
      aspect_ratio: '16:9',
    }

    // Set avatar position if defined in scene
    if (scene.avatarPositionX !== null && scene.avatarPositionY !== null) {
      (heygenBody.video_inputs as any[])[0].character.offset = {
        x: scene.avatarPositionX,
        y: scene.avatarPositionY,
      }
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
      context.error('HeyGen API error:', heygenData)
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
      return {
        status: heygenResponse.status,
        jsonBody: { error: heygenData.message || heygenData.error || 'HeyGen API error' },
      }
    }

    const videoId = heygenData.data?.video_id
    if (!videoId) throw new Error('No video_id returned from HeyGen')

    // Store video ID in scene for polling
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        // We store the HeyGen video ID in avatarVideoUrl temporarily (prefixed)
        avatarVideoUrl: `heygen:${videoId}`,
        status: 'rendering',
      },
    })

    context.log(`HeyGen job started for scene ${body.scene_id}: video_id=${videoId}`)

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
