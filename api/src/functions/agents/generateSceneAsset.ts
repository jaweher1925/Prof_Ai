/**
 * POST /api/generateSceneAsset
 *
 * Step 4 of the pipeline — Visual generation.
 * Uses a scene's visual_prompt to generate a background image
 * via OpenAI DALL-E 3.
 *
 * Written from scratch — no Base44 dependency.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function generateSceneAssetHandler(
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

    const scene = await prisma.scene.findUnique({ where: { id: body.scene_id } })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }
    if (!scene.visualPrompt) {
      return { status: 400, jsonBody: { error: 'Scene has no visual prompt' } }
    }

    context.log(`Generating visual for scene ${body.scene_id}`)

    // Enhance the prompt for better educational visuals
    const enhancedPrompt = `Professional educational video background image. ${scene.visualPrompt}.
Clean, modern design. High quality, photorealistic or elegant illustration.
16:9 widescreen format. No text overlays. Suitable as a presenter video background.`

    // Call DALL-E 3
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: enhancedPrompt,
      size: '1792x1024',
      quality: 'standard',
      n: 1,
    })

    const imageUrl = (imageResponse.data as Array<{ url?: string }>)[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from DALL-E')

    // Download the image (DALL-E URLs expire after 1 hour)
    context.log(`Downloading image from DALL-E...`)
    const imgResponse = await fetch(imageUrl)
    if (!imgResponse.ok) throw new Error('Failed to download generated image')

    const imageBuffer = Buffer.from(await imgResponse.arrayBuffer())

    // Save to storage
    const savedUrl = await uploadBuffer(imageBuffer, 'png', 'image/png')

    // Update scene with visual asset URL
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: { visualAssetUrl: savedUrl },
    })

    context.log(`Visual generated for scene ${body.scene_id}: ${savedUrl}`)

    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: body.scene_id,
        visual_asset_url: savedUrl,
      },
    }
  } catch (error: any) {
    context.error('generateSceneAsset error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Visual generation failed' } }
  }
}

app.http('generateSceneAsset', {
  methods: ['POST'],
  route: 'generateSceneAsset',
  authLevel: 'anonymous',
  handler: generateSceneAssetHandler,
})
