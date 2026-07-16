/**
 * Slide Composition API — WYSIWYG canvas editing data persistence.
 *
 * SlideComposition is the single source of truth for the Visual Designer
 * canvas (template, flexible nested content blocks, avatar placeholder
 * position/size, responsive image placement). On every write, it's also
 * synced into the scene's PRIMARY SceneSegment.slideDesign JSON — the shape
 * the actual render pipeline (slideRenderer.ts's buildSlide() +
 * ffmpegVideo.ts) already reads — so what the user sees in the editor is
 * exactly what appears in the exported video. Without this sync,
 * SlideComposition edits would be invisible at render time (see
 * syncCompositionToSegment below).
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** One focused main idea + its nested supporting points (#7 — no forced bullet format).
 *  Now includes position data for independent dragging in the Visual Designer canvas. */
interface ContentBlockEntry {
  text: string
  keyPoints: string[]
  x?: number          // Horizontal offset for independent positioning
  y?: number          // Vertical offset for independent positioning
  zIndex?: number     // Stack order for layering
}

function parseContentBlocks(json: string): ContentBlockEntry[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeComposition(composition: any) {
  return {
    ...composition,
    contentBlocks: typeof composition.contentBlocks === 'string'
      ? parseContentBlocks(composition.contentBlocks)
      : composition.contentBlocks,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Seed: pre-fill a brand-new composition from what earlier pipeline steps
// (scriptGeneratorAgent, storyboardAgent) already generated for this scene —
// so opening a slide in the Visual Designer for the first time shows the
// AI-written title/bullets instead of a blank "Untitled Slide", matching the
// previous (pre-WYSIWYG-canvas) behavior.
// ═══════════════════════════════════════════════════════════════════════════

/** Turn a flat list of level-1/level-2 bullet items into separate content blocks
 *  instead of nesting level-2 items under level-1. Each item (level 1 or 2)
 *  becomes its own separate point — no nested key points. This ensures the
 *  Visual Designer shows each point independently without scrollers or nesting. */
function bulletsToContentBlocks(items: Array<{ text?: string; level?: number }>): ContentBlockEntry[] {
  const contentBlocks: ContentBlockEntry[] = []
  for (const item of items) {
    if (!item?.text?.trim()) continue
    // Each item (whether level 1 or 2) becomes its own separate block
    // No nesting — flatten the hierarchy into individual course points
    contentBlocks.push({ text: item.text, keyPoints: [] })
  }
  return contentBlocks
}

/** Crude, non-AI fallback: pull short sentences straight out of the
 *  narration script. Only used if the professional LLM rewrite (below)
 *  fails or is unavailable — a slide should never be left with zero
 *  content, but plain sentence-copying is a last resort, not the norm. */
function extractBulletsFromScript(scriptText: string): ContentBlockEntry[] {
  const sentences = (scriptText || '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200)
    .slice(0, 4)
  return sentences.map(text => ({ text, keyPoints: [] }))
}

/**
 * Professional slide rewrite (#not the same as the spoken script). The
 * presenter's narration is written to be SPOKEN — conversational, run-on,
 * first person. A slide is READ — it should be a polished, concise summary:
 * a short title (not a sentence), a punchy one-line key insight, and
 * 2-4 focused ideas each with brief nested key points, all written like a
 * real presentation deck rather than transcribed speech.
 *
 * Used to build slide content from raw narration when nothing better exists
 * (no slideDesign/elements were produced upstream) — e.g. for scenes whose
 * pipeline data is sparse. Falls back to the crude sentence-extraction
 * helpers above if the LLM call fails, so a slide is never left empty.
 */
async function rewriteScriptAsSlideContent(scriptText: string): Promise<{
  title: string
  subtitle: string
  contentBlocks: ContentBlockEntry[]
} | null> {
  const trimmed = (scriptText || '').trim()
  if (!trimmed) return null
  try {
    const { generateJson } = await import('../lib/llm')
    const result = await generateJson<{
      title: string
      subtitle: string
      blocks: Array<{ text: string; keyPoints: string[] }>
    }>(
      `You are a professional presentation designer creating quiz/test slides. From a presenter's ` +
      `SPOKEN narration, generate EXACTLY ONE multiple-choice question to assess learning. Rules: ` +
      `title is the topic/concept being tested (3-8 words); subtitle is the QUESTION itself ` +
      `(12-25 words, conversational but professional); provide 3-4 answer choices as focused ideas ` +
      `(4-8 words each) — make ONE obviously correct, ONE plausible wrong answer, rest clearly wrong. ` +
      `Each answer choice is one focused idea with NO nested key points. Keep all text concise and ` +
      `scannable. Always respond with valid JSON only.`,
      `Presenter's narration to convert into a single multiple-choice question:
"""
${trimmed.slice(0, 3000)}
"""

Return JSON exactly in this shape (ONE question, 3-4 answer choices as separate blocks):
{ "title": "Concept name", "subtitle": "Full question text here?", "blocks": [{ "text": "Answer choice A", "keyPoints": [] }, { "text": "Answer choice B", "keyPoints": [] }] }`,
      3000
    )
    if (!result?.subtitle && !result?.blocks?.length) return null
    return {
      title: result.title?.trim() || 'Question',
      subtitle: result.subtitle?.trim() || '',  // This is the actual question
      contentBlocks: (result.blocks || [])
        .filter(b => b?.text?.trim())
        .map(b => ({ text: b.text.trim(), keyPoints: [] })),  // Answer choices, no nested points
    }
  } catch (err) {
    console.warn('[compositions] Quiz question generation failed, falling back to sentence extraction:', err)
    return null
  }
}

/**
 * Placeholder titles/subtitles written by earlier (buggy) code paths — e.g.
 * a composition row created before seeding existed, whose literal DB default
 * "Untitled Slide" then got synced into SceneSegment.slideDesign.title and
 * looked like a "real" value to a plain `||` fallback chain on every
 * subsequent self-heal, permanently masking the actual generated title.
 * Treating these as equivalent to empty lets the fallback chain correctly
 * skip past corrupted data and reach the real pipeline-generated content.
 */
const TITLE_PLACEHOLDERS = new Set(['', 'untitled slide', 'untitled', 'slide'])
function isPlaceholderTitle(t?: string | null): boolean {
  return TITLE_PLACEHOLDERS.has((t || '').trim().toLowerCase())
}

/** Split narration text into trimmed sentences (shared by title/subtitle fallbacks). */
function splitSentences(text: string): string[] {
  return (text || '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Auto-derive a "key insight" line straight from the narration when the AI
 * didn't produce a subtitle — the user should never have to type this in
 * themselves. Picks the sentence right after the one used for the title
 * (so they don't repeat each other); falls back to the first sentence if
 * there's only one.
 */
function deriveSubtitleFromScript(scriptText: string): string {
  const sentences = splitSentences(scriptText).filter(s => s.length > 10 && s.length < 180)
  if (!sentences.length) return ''
  const pick = sentences.length > 1 ? sentences[1] : sentences[0]
  return pick.slice(0, 160)
}

/**
 * Default layout PER SCENE — not the same for every slide (per user request).
 * Picks a sensible default based on the scene's role in the module:
 *   - welcome/intro scenes (first scene, sceneKind "welcome"): 'title-hero',
 *     which centers the title in the middle of the slide, matching a real
 *     presentation's title/intro slide.
 *   - quiz scenes: 'bullets' (options read naturally as a list).
 *   - everything else (ordinary content scenes): 'bullets'.
 * The user can still change any individual slide's layout via the layout
 * picker — this only decides what a slide starts as before they touch it.
 */
function defaultLayoutForScene(scene: { sceneKind?: string | null; orderIndex?: number | null } | null | undefined): string {
  if (scene?.sceneKind === 'welcome') return 'title-hero'
  return 'bullets'
}

async function buildDefaultCompositionSeed(sceneId: string): Promise<{
  title: string
  subtitle: string
  contentBlocks: ContentBlockEntry[]
  avatarX: number
  avatarY: number
  avatarWidth: number
  titleX: number
  titleY: number
  subtitleX: number
  subtitleY: number
  contentX: number
  contentY: number
  layout: string
}> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: { segments: { orderBy: { orderIndex: 'asc' } } },
  })

  const primarySegment = scene?.segments?.[0]

  let design: any = {}
  if (primarySegment?.slideDesign) {
    try { design = JSON.parse(primarySegment.slideDesign) } catch { design = {} }
  }
  if (!design?.blocks?.length && scene?.slideDeckContent) {
    try {
      const sceneDesign = JSON.parse(scene.slideDeckContent)
      if (sceneDesign?.blocks?.length) design = sceneDesign
      else if (!design?.title) design = { ...sceneDesign, blocks: design?.blocks }
    } catch { /* keep whatever we already parsed */ }
  }

  // Welcome scenes should NOT have content blocks - only title and subtitle
  // This is because welcome/intro scenes use 'title-hero' layout which is centered
  const isWelcomeScene = scene?.sceneKind === 'welcome'

  // 1st choice: a real "bullets" block already produced by the pipeline
  // (only for non-welcome scenes)
  let contentBlocks = isWelcomeScene ? [] : bulletsToContentBlocks(
    design?.blocks?.find((b: any) => b.type === 'bullets')?.items || []
  )

  // 2nd choice: the segment's own generated `elements` array (only for non-welcome scenes)
  if (!contentBlocks.length && !isWelcomeScene && scene?.segments?.length) {
    for (const seg of scene.segments) {
      if (contentBlocks.length) break
      try {
        const elements: Array<{ type?: string; text?: string }> = JSON.parse(seg.elements || '[]')
        const bulletEls = elements.filter(el => el.type === 'bullet' && el.text?.trim())
        if (bulletEls.length) {
          contentBlocks = bulletEls.map(el => ({ text: el.text as string, keyPoints: [] }))
        }
      } catch { /* malformed elements JSON — try next segment */ }
    }
  }

  // Narration source for fallbacks below — prefer this scene's own script
  // text, otherwise stitch together its segments' text.
  const scriptSource = scene?.scriptContent || scene?.segments?.map(s => s.text).join(' ') || ''

  // Title: prefer the segment's own slideTitle column — it's written once by
  // scriptGeneratorAgent from the real generated title and never gets
  // touched by any placeholder-writing code path, unlike slideDesign.title
  // which can carry forward a stale "Untitled Slide" default.
  let title =
    (!isPlaceholderTitle(primarySegment?.slideTitle) && primarySegment?.slideTitle) ||
    (!isPlaceholderTitle(design?.title) && design?.title) ||
    ''

  // Subtitle (Key Insight) from a real upstream source, if one exists.
  let subtitle = design?.subtitle?.trim() || ''

  // 3rd choice for content, and fallback for title/subtitle: ask the LLM to
  // rewrite the narration into professional, concise slide copy — never a
  // verbatim/near-verbatim copy of the spoken script (#more professional).
  // For welcome scenes, still get title/subtitle but no content blocks.
  if (!contentBlocks.length || !title || !subtitle) {
    const rewrite = await rewriteScriptAsSlideContent(scriptSource)
    if (rewrite) {
      if (!contentBlocks.length && !isWelcomeScene && rewrite.contentBlocks.length) contentBlocks = rewrite.contentBlocks
      if (!title && rewrite.title) title = rewrite.title
      if (!subtitle && rewrite.subtitle) subtitle = rewrite.subtitle
    }
  }

  // 4th choice: crude sentence-extraction if the LLM rewrite didn't produce
  // content (call failed, no API key, etc.) — a slide should never be left
  // with zero content points (except welcome scenes).
  if (!contentBlocks.length && !isWelcomeScene) {
    contentBlocks = extractBulletsFromScript(scriptSource)
  }

  // 5th choice (absolute last resort): the sentence filter above can come up
  // empty for very short narration (e.g. a 10-word segment) — fall back to a
  // short slice of the raw script text as a single point (except welcome scenes).
  if (!contentBlocks.length && !isWelcomeScene) {
    const raw = scriptSource.trim()
    if (raw) contentBlocks = [{ text: raw.slice(0, 80), keyPoints: [] }]
  }

  if (!title) title = splitSentences(scriptSource)[0]?.slice(0, 50) || 'Untitled Slide'
  if (!subtitle) subtitle = deriveSubtitleFromScript(scriptSource)

  // Layout: honor whatever's already saved in the design JSON (e.g. from a
  // previous edit or a designed welcome-scene layout); otherwise pick a
  // sensible per-scene default (#not all slides identical).
  const layout = design?.layout || defaultLayoutForScene(scene)

  // Add position data to each content block for independent dragging in Visual Designer
  const contentBlocksWithPositions = contentBlocks.map((block, idx) => ({
    text: block.text,
    keyPoints: block.keyPoints || [],
    x: 0,                      // Default x offset
    y: 18 + idx * 8,           // Cascade y position for each block
    zIndex: idx,               // Stack order
  }))

  return {
    title,
    subtitle,
    contentBlocks: contentBlocksWithPositions,
    avatarX: scene?.avatarPositionX ?? 97,    // Far right corner
    avatarY: scene?.avatarPositionY ?? 8,     // Near top
    avatarWidth: 5,                            // Very small
    titleX: 0,
    titleY: 0,
    subtitleX: 0,
    subtitleY: 0,
    contentX: 0,
    contentY: 0,
    layout,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sync: SlideComposition → SceneSegment.slideDesign
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts a SlideComposition row into the SlideContent shape buildSlide()
 * and ffmpegVideo.ts already understand, and writes it onto the scene's
 * FIRST segment (orderIndex 0) — the one used for single-segment content
 * scenes, which is what the Visual Designer edits.
 *
 * contentBlocks (individual course points, no nesting) map onto the existing
 * "bullets" block shape: each content block becomes a single level-1 item.
 * slideRenderer.ts's renderBullets() already auto-scales to fit any number
 * of bullet points — no forced/fixed bullet count (#6, #7).
 */
async function syncCompositionToSegment(sceneId: string, composition: {
  templateId: string
  title: string
  subtitle: string
  contentBlocks: string
  avatarX: number
  avatarY: number
  avatarWidth: number
  imageUrl: string | null
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
  titleX: number
  titleY: number
  subtitleX: number
  subtitleY: number
  contentX: number
  contentY: number
  titleFontScale: number
  subtitleFontScale: number
  contentFontScale: number
  layout: string
}) {
  const blocks = parseContentBlocks(composition.contentBlocks)

  const bulletItems: Array<{ text: string; level: 1 | 2 }> = []
  for (const block of blocks) {
    if (block.text?.trim()) bulletItems.push({ text: block.text, level: 1 })
    for (const kp of block.keyPoints || []) {
      if (kp?.trim()) bulletItems.push({ text: kp, level: 2 })
    }
  }

  const slideDesign = {
    title: composition.title,
    subtitle: composition.subtitle || undefined,
    layout: composition.layout || 'bullets',
    theme: composition.templateId,
    blocks: bulletItems.length ? [{ type: 'bullets', items: bulletItems }] : [],
    imageUrl: composition.imageUrl || undefined,
    imageX: composition.imageUrl ? composition.imageX : undefined,
    imageY: composition.imageUrl ? composition.imageY : undefined,
    imageWidth: composition.imageUrl ? composition.imageWidth : undefined,
    imageHeight: composition.imageUrl ? composition.imageHeight : undefined,
    avatarX: composition.avatarX,
    avatarY: composition.avatarY,
    avatarWidth: composition.avatarWidth,
    // Title, key insight, and content/bullets each drag INDEPENDENTLY, not
    // as one glued block — matches buildSlide()'s existing positions.title /
    // positions.subtitle / positions.content offsets.
    positions: {
      title: { x: composition.titleX, y: composition.titleY, scale: 1 },
      subtitle: { x: composition.subtitleX, y: composition.subtitleY, scale: 1 },
      content: { x: composition.contentX, y: composition.contentY, scale: 1 },
    },
    // Composition changed — any cached WYSIWYG snapshot from before this
    // edit no longer matches, so drop it and force a fresh render.
    renderedSlideUrl: undefined,
  }

  const primarySegment = await prisma.sceneSegment.findFirst({
    where: { sceneId },
    orderBy: { orderIndex: 'asc' },
  })

  if (primarySegment) {
    await prisma.sceneSegment.update({
      where: { id: primarySegment.id },
      data: { slideDesign: JSON.stringify(slideDesign) },
    })
  }

  // Keep the legacy scene-level field in sync too, for panels that still
  // read Scene.slideDeckContent directly (e.g. non-segmented scenes).
  await prisma.scene.update({
    where: { id: sceneId },
    data: { slideDeckContent: JSON.stringify(slideDesign) },
  }).catch(() => { /* scene may not exist in edge cases — composition write already succeeded */ })
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/scenes/{id}/composition (fetch slide composition data)
// ═══════════════════════════════════════════════════════════════════════════

app.http('getComposition', {
  methods: ['GET'], route: 'scenes/{id}/composition', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id

      let composition = await prisma.slideComposition.findUnique({ where: { sceneId } })

      if (!composition) {
        // First time this scene is opened in the Visual Designer — seed the
        // composition from what the earlier pipeline steps already wrote
        // (script/storyboard-generated title + bullets) instead of starting
        // blank, matching how the editor behaved before the WYSIWYG canvas.
        const seed = await buildDefaultCompositionSeed(sceneId)
        composition = await prisma.slideComposition.create({
          data: {
            sceneId,
            templateId: 'modern',
            title: seed.title,
            subtitle: seed.subtitle,
            contentBlocks: JSON.stringify(seed.contentBlocks),
            avatarX: seed.avatarX,
            avatarY: seed.avatarY,
            avatarWidth: seed.avatarWidth,
            titleX: seed.titleX,
            titleY: seed.titleY,
            subtitleX: seed.subtitleX,
            subtitleY: seed.subtitleY,
            contentX: seed.contentX,
            contentY: seed.contentY,
            titleFontScale: 1,
            subtitleFontScale: 1,
            contentFontScale: 1,
            layout: seed.layout,
            imageUrl: null,
            imageX: 10,
            imageY: 70,
            imageWidth: 25,
            imageHeight: 25,
            status: 'draft',
            contentEdited: false,
          },
        })
        await syncCompositionToSegment(sceneId, {
          templateId: composition.templateId,
          title: composition.title,
          subtitle: composition.subtitle,
          contentBlocks: composition.contentBlocks,
          avatarX: composition.avatarX,
          avatarY: composition.avatarY,
          avatarWidth: composition.avatarWidth,
          imageUrl: composition.imageUrl,
          imageX: composition.imageX,
          imageY: composition.imageY,
          imageWidth: composition.imageWidth,
          imageHeight: composition.imageHeight,
          titleX: composition.titleX,
          titleY: composition.titleY,
          subtitleX: composition.subtitleX,
          subtitleY: composition.subtitleY,
          contentX: composition.contentX,
          contentY: composition.contentY,
          titleFontScale: composition.titleFontScale ?? 1,
          subtitleFontScale: composition.subtitleFontScale ?? 1,
          contentFontScale: composition.contentFontScale ?? 1,
          layout: composition.layout,
        })
      } else if (!composition.contentEdited) {
        // The user hasn't personally written/edited this slide's content yet
        // (#everything comes from the script/storyboard until they do) — keep
        // re-deriving title + subtitle + contentBlocks fresh from the
        // pipeline on every fetch, so this always reflects the latest
        // generated script instead of freezing a stale/blank snapshot from
        // whenever the row was first created. Avatar/image placement is left
        // untouched since those are canvas layout choices, not generated
        // content.
        const seed = await buildDefaultCompositionSeed(sceneId)
        composition = await prisma.slideComposition.update({
          where: { sceneId },
          data: {
            title: seed.title,
            subtitle: seed.subtitle,
            contentBlocks: JSON.stringify(seed.contentBlocks),
          },
        })
        await syncCompositionToSegment(sceneId, {
          templateId: composition.templateId,
          title: composition.title,
          subtitle: composition.subtitle,
          contentBlocks: composition.contentBlocks,
          avatarX: composition.avatarX,
          avatarY: composition.avatarY,
          avatarWidth: composition.avatarWidth,
          imageUrl: composition.imageUrl,
          imageX: composition.imageX,
          imageY: composition.imageY,
          imageWidth: composition.imageWidth,
          imageHeight: composition.imageHeight,
          titleX: composition.titleX,
          titleY: composition.titleY,
          subtitleX: composition.subtitleX,
          subtitleY: composition.subtitleY,
          contentX: composition.contentX,
          contentY: composition.contentY,
          titleFontScale: composition.titleFontScale ?? 1,
          subtitleFontScale: composition.subtitleFontScale ?? 1,
          contentFontScale: composition.contentFontScale ?? 1,
          // Layout is a design/layout choice, not generated content — never
          // overwritten by the auto-regenerate path, only by an explicit
          // user pick (PATCH) or the very first seed.
          layout: composition.layout,
        })
      }

      return { status: 200, jsonBody: serializeComposition(composition) }
    } catch (e) {
      ctx.error('Error fetching composition:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/scenes/{id}/composition (update slide composition)
// ═══════════════════════════════════════════════════════════════════════════

app.http('patchComposition', {
  methods: ['PATCH'], route: 'scenes/{id}/composition', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      const updates = (await req.json()) as any

      const contentBlocksJson = updates.contentBlocks !== undefined
        ? JSON.stringify(updates.contentBlocks)
        : undefined

      // Any direct edit to the generated text content (title, key insight, or
      // the focused ideas/key points) means the user has taken over that
      // slide's copy — stop auto-regenerating it from the script on future
      // GETs. Avatar/image/template changes are layout choices, not content
      // edits, so they don't trigger this.
      const editsContent = updates.title !== undefined || updates.subtitle !== undefined || contentBlocksJson !== undefined

      const composition = await prisma.slideComposition.upsert({
        where: { sceneId },
        create: {
          sceneId,
          templateId: updates.templateId || 'modern',
          title: updates.title || 'Untitled Slide',
          subtitle: updates.subtitle || '',
          contentBlocks: contentBlocksJson ?? JSON.stringify([]),
          avatarX: updates.avatarX ?? 75,
          avatarY: updates.avatarY ?? 50,
          avatarWidth: updates.avatarWidth ?? 20,
          titleX: updates.titleX ?? 0,
          titleY: updates.titleY ?? 0,
          subtitleX: updates.subtitleX ?? 0,
          subtitleY: updates.subtitleY ?? 0,
          contentX: updates.contentX ?? 0,
          contentY: updates.contentY ?? 0,
          layout: updates.layout || 'bullets',
          cadreStyle: updates.cadreStyle || 'none',
          imageUrl: updates.imageUrl || null,
          imageX: updates.imageX ?? 10,
          imageY: updates.imageY ?? 70,
          imageWidth: updates.imageWidth ?? 25,
          imageHeight: updates.imageHeight ?? 25,
          status: 'draft',
          contentEdited: editsContent,
        },
        update: {
          ...(updates.templateId !== undefined && { templateId: updates.templateId }),
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.subtitle !== undefined && { subtitle: updates.subtitle }),
          ...(contentBlocksJson !== undefined && { contentBlocks: contentBlocksJson }),
          ...(updates.avatarX !== undefined && { avatarX: updates.avatarX }),
          ...(updates.avatarY !== undefined && { avatarY: updates.avatarY }),
          ...(updates.avatarWidth !== undefined && { avatarWidth: updates.avatarWidth }),
          ...(updates.titleX !== undefined && { titleX: updates.titleX }),
          ...(updates.titleY !== undefined && { titleY: updates.titleY }),
          ...(updates.subtitleX !== undefined && { subtitleX: updates.subtitleX }),
          ...(updates.subtitleY !== undefined && { subtitleY: updates.subtitleY }),
          ...(updates.contentX !== undefined && { contentX: updates.contentX }),
          ...(updates.contentY !== undefined && { contentY: updates.contentY }),
          ...(updates.layout !== undefined && { layout: updates.layout }),
          ...(updates.cadreStyle !== undefined && { cadreStyle: updates.cadreStyle }),
          ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl }),
          ...(updates.imageX !== undefined && { imageX: updates.imageX }),
          ...(updates.imageY !== undefined && { imageY: updates.imageY }),
          ...(updates.imageWidth !== undefined && { imageWidth: updates.imageWidth }),
          ...(updates.imageHeight !== undefined && { imageHeight: updates.imageHeight }),
          ...(editsContent && { contentEdited: true }),
          updatedAt: new Date(),
        },
      })

      // Keep the render pipeline's data (SceneSegment.slideDesign) in sync
      // with every composition edit — this is what makes canvas edits
      // actually show up in the exported video (see doc comment above).
      await syncCompositionToSegment(sceneId, {
        templateId: composition.templateId,
        title: composition.title,
        subtitle: composition.subtitle,
        contentBlocks: composition.contentBlocks,
        avatarX: composition.avatarX,
        avatarY: composition.avatarY,
        avatarWidth: composition.avatarWidth,
        imageUrl: composition.imageUrl,
        imageX: composition.imageX,
        imageY: composition.imageY,
        imageWidth: composition.imageWidth,
        imageHeight: composition.imageHeight,
        titleX: composition.titleX,
        titleY: composition.titleY,
        subtitleX: composition.subtitleX,
        subtitleY: composition.subtitleY,
        contentX: composition.contentX,
        contentY: composition.contentY,
        titleFontScale: composition.titleFontScale ?? 1,
        subtitleFontScale: composition.subtitleFontScale ?? 1,
        contentFontScale: composition.contentFontScale ?? 1,
        layout: composition.layout,
      })

      // Text Motion / animation (#38) — stored on the Scene itself (drives
      // ffmpegVideo.ts's caption reveal), not on SlideComposition, since it's
      // a per-scene narration setting rather than per-slide layout data.
      if (updates.textAnimationType !== undefined) {
        await prisma.scene.update({
          where: { id: sceneId },
          data: { textAnimationType: updates.textAnimationType },
        }).catch(() => { /* best-effort — composition write already succeeded */ })
      }

      return { status: 200, jsonBody: serializeComposition(composition) }
    } catch (e) {
      ctx.error('Error updating composition:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/modules/{id}/apply-template (apply template to all scenes in a module)
// ═══════════════════════════════════════════════════════════════════════════

app.http('applyTemplateToModule', {
  methods: ['POST'], route: 'modules/{id}/apply-template', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id
      const body = (await req.json()) as any
      const templateId = body.templateId

      if (!templateId) {
        return { status: 400, jsonBody: { error: 'templateId is required' } }
      }

      const scenes = await prisma.scene.findMany({ where: { moduleId } })
      if (!scenes.length) {
        return { status: 404, jsonBody: { error: 'No scenes found for module' } }
      }

      const updated = await Promise.all(
        scenes.map(async scene => {
          const existing = await prisma.slideComposition.findUnique({ where: { sceneId: scene.id } })

          if (existing && existing.contentEdited) {
            // User already wrote their own content for this slide — only
            // change the template/styling, leave their text alone.
            return prisma.slideComposition.update({
              where: { sceneId: scene.id },
              data: { templateId, updatedAt: new Date() },
            })
          }

          // No composition yet, or one that's still pipeline-generated
          // content — (re)seed from the latest script/storyboard data so the
          // slide always reflects the generated title/key points (#everything
          // comes from previous steps until the user edits it themselves).
          const seed = await buildDefaultCompositionSeed(scene.id)
          return prisma.slideComposition.upsert({
            where: { sceneId: scene.id },
            create: {
              sceneId: scene.id,
              templateId,
              title: seed.title,
              subtitle: seed.subtitle,
              contentBlocks: JSON.stringify(seed.contentBlocks),
              avatarX: seed.avatarX,
              avatarY: seed.avatarY,
              avatarWidth: seed.avatarWidth,
              titleX: seed.titleX,
              titleY: seed.titleY,
              subtitleX: seed.subtitleX,
              subtitleY: seed.subtitleY,
              contentX: seed.contentX,
              contentY: seed.contentY,
              layout: seed.layout,
              status: 'draft',
              contentEdited: false,
            },
            update: {
              templateId,
              title: seed.title,
              subtitle: seed.subtitle,
              contentBlocks: JSON.stringify(seed.contentBlocks),
              updatedAt: new Date(),
            },
          })
        })
      )

      // Sync every updated composition into its scene's render-pipeline data
      await Promise.all(
        updated.map(composition =>
          syncCompositionToSegment(composition.sceneId, {
            templateId: composition.templateId,
            title: composition.title,
            subtitle: composition.subtitle,
            contentBlocks: composition.contentBlocks,
            avatarX: composition.avatarX,
            avatarY: composition.avatarY,
            avatarWidth: composition.avatarWidth,
            imageUrl: composition.imageUrl,
            imageX: composition.imageX,
            imageY: composition.imageY,
            imageWidth: composition.imageWidth,
            imageHeight: composition.imageHeight,
            titleX: composition.titleX,
            titleY: composition.titleY,
            subtitleX: composition.subtitleX,
            subtitleY: composition.subtitleY,
            contentX: composition.contentX,
            contentY: composition.contentY,
            titleFontScale: composition.titleFontScale ?? 1,
            subtitleFontScale: composition.subtitleFontScale ?? 1,
            contentFontScale: composition.contentFontScale ?? 1,
            layout: composition.layout,
          })
        )
      )

      return {
        status: 200,
        jsonBody: {
          message: `Template applied to ${updated.length} slides`,
          count: updated.length,
        },
      }
    } catch (e) {
      ctx.error('Error applying template:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/modules/{id}/compositions (get all compositions for module)
// ═══════════════════════════════════════════════════════════════════════════

app.http('getModuleCompositions', {
  methods: ['GET'], route: 'modules/{id}/compositions', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id

      const scenes = await prisma.scene.findMany({
        where: { moduleId },
        orderBy: { orderIndex: 'asc' },
      })

      const compositions = await Promise.all(
        scenes.map(scene => prisma.slideComposition.findUnique({ where: { sceneId: scene.id } }))
      )

      const result = compositions.filter(Boolean).map(comp => serializeComposition(comp))

      return {
        status: 200,
        jsonBody: {
          moduleId,
          totalSlides: scenes.length,
          compositions: result,
        },
      }
    } catch (e) {
      ctx.error('Error fetching module compositions:', e)
      return err500(e)
    }
  },
})
