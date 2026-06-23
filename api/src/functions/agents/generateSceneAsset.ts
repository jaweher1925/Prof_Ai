/**
 * POST /api/generateSceneAsset
 * Step 4 — Slide generation.
 * Gamma-style: structured content → layout template → themed SVG → PNG
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import { buildSlide, SlideContent } from '../../lib/slideRenderer'

// ─── Handler ─────────────────────────────────────────────────────────────────

async function generateSceneAssetHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { scene_id?: string }
    if (!body.scene_id) return { status: 400, jsonBody: { error: 'scene_id is required' } }

    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { module: true },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const moduleTitle = scene.module?.title || 'Module'
    const sceneIndex = scene.orderIndex ?? 0
    const totalScenes = scene.moduleId
      ? await prisma.scene.count({ where: { moduleId: scene.moduleId } })
      : 1

    context.log(`Generating slide for scene ${body.scene_id}`)

    // Parse slide content
    let slideContent: SlideContent = {}
    try {
      slideContent = JSON.parse(scene.slideDeckContent || '{}')
    } catch {}

    // Fallback if no structured content yet
    if (!slideContent.title) {
      slideContent.title = scene.visualPrompt?.split(/[.,]/)[0].trim() || 'Slide'
    }
    if (!slideContent.blocks?.length) {
      // Generate basic bullets from script
      const sentences = (scene.scriptContent || '')
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.length > 20 && s.length < 200)
        .slice(0, 4)
      slideContent.blocks = [{ type: 'bullets', items: sentences.map(t => ({ text: t, level: 1 })) }]
    }

    // Build SVG
    const svg = buildSlide(slideContent, moduleTitle, sceneIndex, totalScenes)
    const svgBuffer = Buffer.from(svg, 'utf-8')

    let finalBuffer: Buffer
    let ext = 'svg'

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sharp = require('sharp')
      finalBuffer = await sharp(svgBuffer).png().toBuffer()
      ext = 'png'
    } catch {
      finalBuffer = svgBuffer
      ext = 'svg'
      context.warn('sharp not installed — serving SVG (run: cd api && npm install sharp)')
    }

    const savedUrl = await uploadBuffer(finalBuffer, ext, ext === 'png' ? 'image/png' : 'image/svg+xml')
    await prisma.scene.update({ where: { id: body.scene_id }, data: { visualAssetUrl: savedUrl } })

    return { status: 200, jsonBody: { success: true, scene_id: body.scene_id, visual_asset_url: savedUrl } }
  } catch (error: any) {
    context.error('generateSceneAsset error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Slide generation failed' } }
  }
}

app.http('generateSceneAsset', {
  methods: ['POST'],
  route: 'generateSceneAsset',
  authLevel: 'anonymous',
  handler: generateSceneAssetHandler,
})
