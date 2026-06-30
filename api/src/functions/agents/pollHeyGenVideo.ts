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
import { compositeAvatarOverlay } from '../../lib/ffmpegVideo'

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

    // Tracks what we actually save/return — the raw HeyGen clip unless/until
    // it gets composited onto the slide below.
    let finalVideoUrl = videoUrl

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
        }
      } else {
        context.warn(`Scene ${body.scene_id}: no ttsAudioUrl found, cannot composite — saving raw HeyGen clip`)
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
        video_url: finalVideoUrl || null,
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
