/**
 * POST /api/generateSceneAsset
 * Step 4 — Slide generation.
 * Gamma-style: structured content → layout template → themed SVG → PNG
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import { buildSlide, SlideContent, toSlideBlocks } from '../../lib/slideRenderer'

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
      include: {
        module: true,
        segments: { orderBy: { orderIndex: 'asc' } },
      },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    const moduleTitle = scene.module?.title || 'Module'
    const sceneIndex = scene.orderIndex ?? 0
    const totalScenes = scene.moduleId
      ? await prisma.scene.count({ where: { moduleId: scene.moduleId } })
      : 1

    context.log(`Generating slide for scene ${body.scene_id}`)

    // Get the slide composition (built by Visual Designer or compositions.ts seeding)
    const composition = await prisma.slideComposition.findUnique({
      where: { sceneId: body.scene_id },
    }).catch(() => null)

    // For segmented scenes, use composition if available, else first segment's design
    let slideContent: SlideContent = {}
    if (composition) {
      // Build slideContent from composition fields
      try {
        const contentBlocks = JSON.parse(composition.contentBlocks || '[]')
        const layout = composition.layout || 'bullets'
        slideContent = {
          title: composition.title || 'Slide',
          subtitle: composition.subtitle || '',
          layout,
          theme: composition.templateId || 'modern',
          // Visual Designer's contentBlocks are {text, keyPoints, x, y, ...}
          // — a different shape than the {type, items} blocks buildSlide()'s
          // renderers look up. toSlideBlocks() converts so the points/details
          // the user actually wrote make it into the generated image instead
          // of silently disappearing.
          blocks: contentBlocks.length > 0 ? toSlideBlocks(contentBlocks, layout) : undefined,
        }
      } catch (e) {
        context.warn(`Failed to parse composition contentBlocks: ${e}`)
        slideContent = {
          title: composition.title || 'Slide',
          subtitle: composition.subtitle || '',
          layout: composition.layout || 'bullets',
          theme: composition.templateId || 'modern',
        }
      }
    } else if (scene.segments && scene.segments.length > 0) {
      // Fallback: try first segment's design
      try {
        slideContent = JSON.parse(scene.segments[0].slideDesign || '{}')
      } catch {}
    } else {
      // Last resort: use scene-level design
      try {
        slideContent = JSON.parse(scene.slideDeckContent || '{}')
      } catch {}
    }

    // WYSIWYG snapshot (#39): the Visual Designer already captured the exact
    // slide as a PNG on save — reuse it so the preview matches the editor
    // (and the video) pixel-for-pixel instead of rebuilding a drifting SVG.
    if (slideContent.renderedSlideUrl) {
      await prisma.scene.update({
        where: { id: body.scene_id },
        data: { visualAssetUrl: slideContent.renderedSlideUrl },
      })
      return {
        status: 200,
        jsonBody: { success: true, scene_id: body.scene_id, visual_asset_url: slideContent.renderedSlideUrl },
      }
    }

    // Fallback if no structured content yet
    if (!slideContent.title) {
      slideContent.title = scene.visualPrompt?.split(/[.,]/)[0].trim() || 'Slide'
    }
    // Only fall back to auto-splitting the VOICE SCRIPT into bullets when
    // this scene has never been through Visual Designer at all (no
    // composition row exists). If a composition exists but the user simply
    // hasn't added any content points yet (e.g. a title-only intro slide),
    // that's an intentional, valid state — respect it instead of silently
    // substituting the spoken narration, which is written to be longer and
    // more conversational than on-screen text is meant to be (see
    // VisualDesignerPanel's own title-hero/bullets copy: script and slide
    // text are deliberately different).
    if (!composition && !slideContent.blocks?.length) {
      // Generate basic bullets from script
      // No fixed cap — however many well-formed sentences the script has
      // become the fallback bullets (renderBullets() auto-scales font size
      // to fit however many there are; see slideRenderer.ts).
      const sentences = (scene.scriptContent || '')
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.length > 20 && s.length < 200)
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
