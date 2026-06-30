/**
 * POST /api/generateHyperFramesSlide
 *
 * Alternative to generateSceneAsset — renders the scene's slide design as a
 * fully-animated MP4 using HeyGen's HyperFrames cloud renderer instead of a
 * static SVG→PNG.
 *
 * Flow:
 *  1. Load scene + slideDeckContent from DB
 *  2. Build a HyperFrames HTML composition from the slide data
 *  3. Submit to HeyGen HyperFrames API → poll until MP4 is ready
 *  4. Download the MP4, save to local uploads/, update scene.visualAssetUrl
 *     with an "/api/uploads/{uuid}.mp4" URL
 *  5. Also set scene.slideBackgroundType = 'hyperframes' so ffmpegVideo.ts
 *     knows to use the video background path instead of the still-image path
 *
 * The video URL drops into the exact same scene.visualAssetUrl field used by
 * renderVoiceOnlyVideo / compositeAvatarOverlay — no changes to the Video
 * generation stage needed. ffmpegVideo.ts detects the .mp4 extension and uses
 * a video background input instead of a looped still image.
 *
 * Falls back gracefully: if HYPERFRAMES_API_KEY is not set, or if the render
 * fails, returns an error (the frontend shows a fallback message and the user
 * can still use the standard static slide path).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { buildHyperFramesHtml, renderHyperFrames } from '../../lib/hyperframes'
import { SlideContent } from '../../lib/slideRenderer'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

async function generateHyperFramesSlideHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  const apiKey = process.env.HYPERFRAMES_API_KEY
  if (!apiKey) {
    return {
      status: 503,
      jsonBody: {
        error: 'HYPERFRAMES_API_KEY is not configured. Add it to api/.env to enable animated slides.',
      },
    }
  }

  try {
    const body = (await request.json()) as {
      scene_id?: string
      duration_seconds?: number
    }
    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { module: true },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const moduleTitle = scene.module?.title || 'Module'

    // Parse slide design — fall back sensibly if empty
    let slideContent: SlideContent = {}
    try {
      slideContent = JSON.parse(scene.slideDeckContent || '{}')
    } catch {}

    if (!slideContent.title) {
      slideContent.title = scene.visualPrompt?.split(/[.,]/)[0].trim() || 'Slide'
    }
    if (!slideContent.blocks?.length) {
      const sentences = (scene.scriptContent || '')
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.length > 20 && s.length < 200)
        .slice(0, 4)
      slideContent.blocks = [{ type: 'bullets', items: sentences.map(t => ({ text: t, level: 1 })) }]
    }

    // Estimate slide duration from TTS audio length or provided value
    const durationSeconds = body.duration_seconds || scene.durationSeconds || 8

    context.log(`Generating HyperFrames animated slide for scene ${body.scene_id}`)

    // Build HTML composition
    const html = buildHyperFramesHtml(slideContent, moduleTitle, durationSeconds)

    // Submit to HyperFrames cloud renderer — blocks until MP4 is ready (max 5 min)
    const { renderId, videoUrl } = await renderHyperFrames(html, apiKey)
    context.log(`HyperFrames render complete: render_id=${renderId} url=${videoUrl}`)

    // Download the rendered MP4 and save to local uploads/
    const dlRes = await fetch(videoUrl)
    if (!dlRes.ok) throw new Error(`Failed to download HyperFrames video (${dlRes.status})`)
    const videoBuffer = Buffer.from(await dlRes.arrayBuffer())

    const fileName = `${randomUUID()}.mp4`
    const filePath = join(UPLOAD_DIR, fileName)
    await writeFile(filePath, videoBuffer)

    const savedUrl = `/api/uploads/${fileName}`

    // Update scene — visualAssetUrl now points to the animated MP4.
    // slideBackgroundType = 'hyperframes' tells ffmpegVideo.ts to use the
    // video-background render path instead of the looped still-image path.
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        visualAssetUrl: savedUrl,
        // Store render metadata for UI display
        visualPrompt: scene.visualPrompt || `HyperFrames animated — ${slideContent.title}`,
      },
    })

    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: body.scene_id,
        visual_asset_url: savedUrl,
        hyperframes_render_id: renderId,
        type: 'hyperframes',
      },
    }
  } catch (error: any) {
    context.error('generateHyperFramesSlide error:', error)
    return {
      status: 500,
      jsonBody: { error: error.message || 'HyperFrames slide generation failed' },
    }
  }
}

app.http('generateHyperFramesSlide', {
  methods: ['POST'],
  route: 'generateHyperFramesSlide',
  authLevel: 'anonymous',
  handler: generateHyperFramesSlideHandler,
})
