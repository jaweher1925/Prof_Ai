/**
 * Slide Composition API — WYSIWYG canvas editing data persistence.
 *
 * SlideComposition is the single source of truth for the Visual Designer
 * canvas (template, flexible nested content blocks, avatar placeholder
 * position/size, responsive image placement) — one row PER SEGMENT (#40),
 * not per scene. A scene whose welcome/intro narrates across several
 * independent segments (hook, content, content, recap) gets one
 * independently editable slide PER PART, matching how Script Generation and
 * Voice already treat/display those parts. On every write, a composition is
 * also synced into its OWN SceneSegment.slideDesign JSON — the shape the
 * actual render pipeline (slideRenderer.ts's buildSlide() + ffmpegVideo.ts)
 * already reads — so what the user sees in the editor is exactly what
 * appears in the exported video. Without this sync, SlideComposition edits
 * would be invisible at render time (see syncCompositionToSegment below).
 *
 * Before #40, SlideComposition had `sceneId @unique` — only ONE composition
 * could ever exist per scene, so a 4-part welcome scene could only ever show
 * ONE editable slide (always the first segment's) no matter how many parts
 * it actually narrated.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const notFound = (msg: string) => ({ status: 404, jsonBody: { error: msg } } as HttpResponseInit)
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
  visible?: boolean   // Hidden-but-not-deleted points (default true) are excluded from the render sync below
  cadreStyle?: string // Per-block frame style (none/subtle/bold/rounded)
  showDetails?: boolean // Whether nested key points are shown under this point (default true)
}

function parseContentBlocks(json: string): ContentBlockEntry[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeComposition(composition: any, extra: Record<string, any> = {}) {
  // imageTimings (2026-08-17, "should appear also in the remotion and edit
  // timeline for it") — mirrors contentBlockTimings's own JSON-string-column
  // parsing below. `composition.imageTimings` reads as `undefined` (not an
  // error) on any row/client from before this field existed, so this is
  // safe even before the migration + `prisma generate` that add it have run.
  let imageTimings: any[] = []
  try { imageTimings = JSON.parse(composition.imageTimings || '[]') } catch { imageTimings = [] }
  return {
    ...composition,
    contentBlocks: typeof composition.contentBlocks === 'string'
      ? parseContentBlocks(composition.contentBlocks)
      : composition.contentBlocks,
    imageTimings,
    ...extra,
  }
}

/** Resolve a scene's PRIMARY segment (lowest orderIndex) — used for
 *  back-compat scene-level reads (GET /scenes/{id}/composition, still used
 *  by the Video Editing timeline) and to decide when a segment-level write
 *  should also mirror into the legacy Scene.slideDeckContent/visualAssetUrl
 *  fields that older/other panels still read directly. */
async function findPrimarySegmentId(sceneId: string): Promise<string | null> {
  const seg = await prisma.sceneSegment.findFirst({ where: { sceneId }, orderBy: { orderIndex: 'asc' } })
  return seg?.id ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Seed: pre-fill a brand-new composition from what earlier pipeline steps
// (scriptGeneratorAgent, storyboardAgent) already generated for THIS
// segment — so opening a slide in the Visual Designer for the first time
// shows the AI-written title/bullets instead of a blank "Untitled Slide",
// matching the previous (pre-WYSIWYG-canvas) behavior.
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
 * Default layout PER SEGMENT — not the same for every slide (per user
 * request). Only the FIRST segment (orderIndex 0) of a welcome/intro scene
 * gets 'title-hero' (title centered in the middle, like a real
 * presentation's title slide) — every other segment, including the other
 * parts of that same welcome scene (content/content/recap), gets 'bullets'
 * since each is its own real content slide with its own narration. Quiz and
 * ordinary content scenes always default to 'bullets'.
 * The user can still change any individual slide's layout via the layout
 * picker — this only decides what a slide starts as before they touch it.
 */
function defaultLayoutForSegment(
  scene: { sceneKind?: string | null } | null | undefined,
  segment: { orderIndex?: number | null } | null | undefined
): string {
  if (scene?.sceneKind === 'welcome' && (segment?.orderIndex ?? 0) === 0) return 'title-hero'
  return 'bullets'
}

async function buildDefaultCompositionSeed(segmentId: string): Promise<{
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
  const segment = await prisma.sceneSegment.findUnique({
    where: { id: segmentId },
    include: { scene: true },
  })
  const scene = segment?.scene

  let design: any = {}
  if (segment?.slideDesign) {
    try { design = JSON.parse(segment.slideDesign) } catch { design = {} }
  }
  // Legacy fallback — only meaningful for the primary segment of an
  // un-segmented (or not-yet-migrated) scene, whose content used to live on
  // Scene.slideDeckContent before per-segment slideDesign existed.
  if (!design?.blocks?.length && scene?.slideDeckContent && segment?.orderIndex === 0) {
    try {
      const sceneDesign = JSON.parse(scene.slideDeckContent)
      if (sceneDesign?.blocks?.length) design = sceneDesign
      else if (!design?.title) design = { ...sceneDesign, blocks: design?.blocks }
    } catch { /* keep whatever we already parsed */ }
  }

  // Only the welcome scene's FIRST part (the hook / title-hero slide) should
  // have no content blocks — every OTHER segment (including this same
  // welcome scene's content/content/recap parts) is a real content slide and
  // should get real bullet points derived from its own narration, exactly
  // like an ordinary content scene.
  const isHeroSegment = scene?.sceneKind === 'welcome' && (segment?.orderIndex ?? 0) === 0

  // 1st choice: a real "bullets" block already produced by the pipeline for
  // THIS segment specifically.
  let contentBlocks = isHeroSegment ? [] : bulletsToContentBlocks(
    design?.blocks?.find((b: any) => b.type === 'bullets')?.items || []
  )

  // 2nd choice: this segment's own generated `elements` array.
  if (!contentBlocks.length && !isHeroSegment && segment?.elements) {
    try {
      const elements: Array<{ type?: string; text?: string }> = JSON.parse(segment.elements || '[]')
      const bulletEls = elements.filter(el => el.type === 'bullet' && el.text?.trim())
      if (bulletEls.length) {
        contentBlocks = bulletEls.map(el => ({ text: el.text as string, keyPoints: [] }))
      }
    } catch { /* malformed elements JSON */ }
  }

  // Narration source for fallbacks below — THIS segment's own text only, not
  // the whole scene's — each part gets slide content that matches what it
  // alone narrates.
  const scriptSource = segment?.text || scene?.scriptContent || ''

  // Title: prefer this segment's own slideTitle column — it's written once
  // by scriptGeneratorAgent from the real generated title and never gets
  // touched by any placeholder-writing code path, unlike slideDesign.title
  // which can carry forward a stale "Untitled Slide" default.
  let title =
    (!isPlaceholderTitle(segment?.slideTitle) && segment?.slideTitle) ||
    (!isPlaceholderTitle(design?.title) && design?.title) ||
    ''

  // Subtitle (Key Insight) from a real upstream source, if one exists.
  let subtitle = design?.subtitle?.trim() || ''

  // 3rd choice for content, and fallback for title/subtitle: ask the LLM to
  // rewrite the narration into professional, concise slide copy — never a
  // verbatim/near-verbatim copy of the spoken script (#more professional).
  // The hero segment still gets title/subtitle but no content blocks.
  if (!contentBlocks.length || !title || !subtitle) {
    const rewrite = await rewriteScriptAsSlideContent(scriptSource)
    if (rewrite) {
      if (!contentBlocks.length && !isHeroSegment && rewrite.contentBlocks.length) contentBlocks = rewrite.contentBlocks
      if (!title && rewrite.title) title = rewrite.title
      if (!subtitle && rewrite.subtitle) subtitle = rewrite.subtitle
    }
  }

  // 4th choice: crude sentence-extraction if the LLM rewrite didn't produce
  // content (call failed, no API key, etc.) — a slide should never be left
  // with zero content points (except the hero segment).
  if (!contentBlocks.length && !isHeroSegment) {
    contentBlocks = extractBulletsFromScript(scriptSource)
  }

  // 5th choice (absolute last resort): the sentence filter above can come up
  // empty for very short narration (e.g. a 10-word segment) — fall back to a
  // short slice of the raw script text as a single point (except the hero segment).
  if (!contentBlocks.length && !isHeroSegment) {
    const raw = scriptSource.trim()
    if (raw) contentBlocks = [{ text: raw.slice(0, 80), keyPoints: [] }]
  }

  if (!title) title = splitSentences(scriptSource)[0]?.slice(0, 50) || 'Untitled Slide'
  if (!subtitle) subtitle = deriveSubtitleFromScript(scriptSource)

  // Layout: honor whatever's already saved in the design JSON (e.g. from a
  // previous edit); otherwise pick a sensible per-segment default.
  const layout = design?.layout || defaultLayoutForSegment(scene, segment)

  // Add position data to each content block for independent dragging in Visual
  // Designer. Spacing is DYNAMIC — spread evenly across the actual available
  // vertical room below the title/key-insight instead of a flat 8%-per-block
  // cascade, which used to cram points so tightly that one could sit right on
  // top of the next and block clicks to it. Mirrors the frontend's own
  // calculateBlockSpacing() (VisualDesignerPanel.jsx's LAYOUT_CONFIG) so a
  // freshly-seeded slide already looks the same as what the canvas would
  // compute for it.
  const seedHasSubtitle = !!subtitle?.trim()
  const seedIsHero = layout === 'title-hero'
  const seedContentStartY = seedIsHero
    ? (seedHasSubtitle ? 64 : 52)
    : (seedHasSubtitle ? 38 : 32)
  const SEED_CONTENT_END_Y = 98
  const SEED_MIN_BLOCK_SPACING = 3
  const SEED_MAX_BLOCK_SPACING = 8
  // Was dividing by Math.max(contentBlocks.length, 3) — always assumed at
  // least 3 slots even for 1-2 real points, spreading them far apart across
  // most of the content area. Now divides by the actual count and caps the
  // result, matching the frontend's tightened calculateBlockSpacing().
  const seedBlockSpacing = contentBlocks.length <= 1
    ? SEED_MIN_BLOCK_SPACING
    : Math.min(
        SEED_MAX_BLOCK_SPACING,
        Math.max(SEED_MIN_BLOCK_SPACING, (SEED_CONTENT_END_Y - seedContentStartY) / contentBlocks.length)
      )
  const contentBlocksWithPositions = contentBlocks.map((block, idx) => ({
    text: block.text,
    keyPoints: block.keyPoints || [],
    x: 0,                      // Default x offset
    y: seedContentStartY + idx * seedBlockSpacing,  // Evenly-spread cascade
    zIndex: idx,               // Stack order
  }))

  return {
    title,
    subtitle,
    contentBlocks: contentBlocksWithPositions,
    // Avatar + element placement: honor whatever the user already positioned in
    // the Visual Designer (saved on the segment's slideDesign) so a freshly
    // seeded composition — and the Video Editing timeline preview that reads it
    // — starts out MATCHING the real design instead of snapping the avatar back
    // to the default right-side spot. Falls back to the scene/default position
    // for a slide that's never been designed.
    avatarX: typeof design?.avatarX === 'number' ? design.avatarX : (scene?.avatarPositionX ?? 84),
    avatarY: typeof design?.avatarY === 'number' ? design.avatarY : (scene?.avatarPositionY ?? 50),
    avatarWidth: typeof design?.avatarWidth === 'number' ? design.avatarWidth : 32,
    titleX: design?.positions?.title?.x ?? 0,
    titleY: design?.positions?.title?.y ?? 0,
    subtitleX: design?.positions?.subtitle?.x ?? 0,
    subtitleY: design?.positions?.subtitle?.y ?? 0,
    contentX: design?.positions?.content?.x ?? 0,
    contentY: design?.positions?.content?.y ?? 0,
    layout,
  }
}

/**
 * A slide the user has actually designed in the Visual Designer carries a
 * WYSIWYG snapshot (renderedSlideUrl), per-point positions (positionedBlocks),
 * and/or an explicit avatar position on its slideDesign. Video Editing must
 * NEVER re-seed/overwrite such a design — doing so dropped the snapshot and
 * reset the avatar/title placement, which then leaked back into Visual Design
 * ("when i come back to visual design it changed").
 */
function isUserDesigned(design: any): boolean {
  return !!(design && (
    design.renderedSlideUrl ||
    (Array.isArray(design.positionedBlocks) && design.positionedBlocks.length) ||
    typeof design.avatarX === 'number'
  ))
}

/**
 * Build a SlideComposition patch FROM the user's saved slideDesign, so the
 * Video Editing timeline preview reflects the exact placement the user made in
 * Visual Design — WITHOUT ever writing anything back onto the segment.
 */
function compositionPatchFromDesign(design: any): Record<string, any> | null {
  if (!design) return null
  const patch: Record<string, any> = {}
  if (typeof design.avatarX === 'number') patch.avatarX = design.avatarX
  if (typeof design.avatarY === 'number') patch.avatarY = design.avatarY
  if (typeof design.avatarWidth === 'number') patch.avatarWidth = design.avatarWidth
  const p = design.positions || {}
  if (p.title) { patch.titleX = p.title.x ?? 0; patch.titleY = p.title.y ?? 0 }
  if (p.subtitle) { patch.subtitleX = p.subtitle.x ?? 0; patch.subtitleY = p.subtitle.y ?? 0 }
  if (p.content) { patch.contentX = p.content.x ?? 0; patch.contentY = p.content.y ?? 0 }
  if (design.title) patch.title = design.title
  if (design.subtitle !== undefined) patch.subtitle = design.subtitle || ''
  if (design.layout) patch.layout = design.layout
  if (design.theme) patch.templateId = design.theme
  // Primary image (2026-08-17) — these previously were NEVER patched here,
  // so SlideComposition.imageUrl/imageX/imageY/imageWidth silently diverged
  // from the real slideDesign.imageUrl the moment a user added/changed an
  // image in Visual Designer (that save path writes slideDesign directly,
  // bypassing the SlideComposition PATCH endpoint entirely — see
  // syncCompositionToSegment's docstring for the mirror-image gap this
  // closes). imageHeight is left alone: the new imageUrl system only tracks
  // a single width% (height follows the image's own aspect ratio), it has
  // no separate height value to patch in.
  if (design.imageUrl !== undefined) patch.imageUrl = design.imageUrl || null
  if (p.image) { patch.imageX = p.image.x ?? 10; patch.imageY = p.image.y ?? 70 }
  if (typeof design.imageWidth === 'number') patch.imageWidth = design.imageWidth
  // Per-point positions so the timeline preview places each point where the
  // user dragged it (not the evenly-spread seed cascade).
  const blockItems = design.blocks?.[0]?.items
  if (Array.isArray(blockItems) && blockItems.length) {
    // Plain bullets editor (2026-08-18) — Visual Designer's normal Content tab
    // saves points as design.blocks[0].items (see bulletsFromDesign in
    // VisualDesignerPanel.jsx, which prefers this shape too), NOT
    // positionedBlocks — nothing on the frontend ever writes positionedBlocks,
    // it's a backend-seed-only shape. Without this branch,
    // SlideComposition.contentBlocks froze at whatever the AI seed produced
    // the first time the row was created (isUserDesigned flips true on first
    // save via renderedSlideUrl, permanently blocking the !contentEdited
    // refresh branch below) and never reflected real edits again — silently
    // desyncing the Edit Timeline's "Point N" rows/count from the actual
    // bullets, and making captureRevealFrames() build reveal breakpoints
    // that didn't line up 1:1 with SlidePlaybackPreview's revealCount slicing
    // of the REAL bullets array (allBullets.slice(0, revealCount)) — the
    // root cause of the exported video showing all content at once instead
    // of the timed reveal the user configured. Order/count MUST mirror
    // design.blocks[0].items exactly (index-for-index) since that's the same
    // array SlidePlaybackPreview slices by revealCount.
    patch.contentBlocks = JSON.stringify(blockItems.map((b: any, i: number) => ({
      text: b?.text || '',
      keyPoints: [],
      x: 0,
      y: 0,
      zIndex: i,
      visible: true,
    })))
  } else if (Array.isArray(design.positionedBlocks) && design.positionedBlocks.length) {
    patch.contentBlocks = JSON.stringify(design.positionedBlocks.map((b: any, i: number) => ({
      text: b.text || '',
      keyPoints: b.keyPoints || [],
      x: b.x ?? 0,
      y: b.y ?? 0,
      cadreStyle: b.cadreStyle,
      showDetails: b.showDetails,
      zIndex: i,
      visible: true,
    })))
  }
  return Object.keys(patch).length ? patch : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Sync: SlideComposition → SceneSegment.slideDesign
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts a SlideComposition row into the SlideContent shape buildSlide()
 * and ffmpegVideo.ts already understand, and writes it onto ITS OWN segment
 * — no more "always the scene's first segment" (#40).
 *
 * contentBlocks (individual course points, no nesting) map onto the existing
 * "bullets" block shape: each content block becomes a single level-1 item.
 * slideRenderer.ts's renderBullets() already auto-scales to fit any number
 * of bullet points — no forced/fixed bullet count (#6, #7).
 */
async function syncCompositionToSegment(segmentId: string, composition: {
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
    // Hidden points (visible: false — toggled off in the sidebar's Content
    // Blocks list without deleting them) are excluded here so hiding one
    // actually keeps it out of the exported video, not just out of the
    // editor's own canvas render.
    if (block.visible === false) continue
    if (block.text?.trim()) bulletItems.push({ text: block.text, level: 1 })
    for (const kp of block.keyPoints || []) {
      if (kp?.trim()) bulletItems.push({ text: kp, level: 2 })
    }
  }

  // Each point's OWN x/y/cadreStyle/showDetails, straight from the canvas —
  // this is what buildSlide()'s renderPositionedBlocks actually draws from.
  // The `blocks`/bulletItems above are kept as a legacy fallback only (for
  // any composition somehow missing per-point positions), since flattening
  // every point into one generic auto-flowing list is exactly what silently
  // dropped each point's real position/frame and caused the exported
  // slide/video to not match what was actually designed on the canvas.
  const positionedBlocks = blocks
    .filter(b => b.visible !== false)
    .map(b => ({
      text: b.text || '',
      keyPoints: b.keyPoints || [],
      x: b.x ?? 0,
      y: b.y ?? 0,
      cadreStyle: b.cadreStyle,
      showDetails: b.showDetails,
    }))

  const slideDesign = {
    title: composition.title,
    subtitle: composition.subtitle || undefined,
    layout: composition.layout || 'bullets',
    theme: composition.templateId,
    blocks: bulletItems.length ? [{ type: 'bullets', items: bulletItems }] : [],
    positionedBlocks: positionedBlocks.length ? positionedBlocks : undefined,
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

  const segment = await prisma.sceneSegment.update({
    where: { id: segmentId },
    data: { slideDesign: JSON.stringify(slideDesign) },
  }).catch(() => null)

  if (!segment) return

  // Keep the legacy scene-level field in sync too, ONLY for the scene's
  // primary (first) segment — that's the field non-migrated panels
  // (Video Editing's element-timing view, the HeyGen/avatar-video pipeline)
  // still read directly off Scene itself.
  if (segment.orderIndex === 0) {
    await prisma.scene.update({
      where: { id: segment.sceneId },
      data: { slideDeckContent: JSON.stringify(slideDesign) },
    }).catch(() => { /* scene may not exist in edge cases — composition write already succeeded */ })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared GET/PATCH logic — keyed by segmentId
// ═══════════════════════════════════════════════════════════════════════════

async function doGetComposition(segmentId: string): Promise<any> {
  const segment = await prisma.sceneSegment.findUnique({ where: { id: segmentId } })
  if (!segment) return null

  // What the user actually designed in Visual Design lives here — never clobber it.
  let design: any = null
  try { design = segment.slideDesign ? JSON.parse(segment.slideDesign) : null } catch { design = null }
  const userDesigned = isUserDesigned(design)

  let composition = await prisma.slideComposition.findUnique({ where: { segmentId } })

  const baseFields = {
    segmentId,
    sceneId: segment.sceneId,
    templateId: 'modern',
    avatarWidth: 32,
    titleFontScale: 1,
    subtitleFontScale: 1,
    contentFontScale: 1,
    imageUrl: null,
    imageX: 10,
    imageY: 70,
    imageWidth: 25,
    imageHeight: 25,
    status: 'draft',
    contentEdited: false,
  }

  if (!composition) {
    // First time this segment is opened in the Visual Designer — seed the
    // composition from what the earlier pipeline steps already wrote
    // (script/storyboard-generated title + bullets) instead of starting
    // blank, matching how the editor behaved before the WYSIWYG canvas.
    const seed = await buildDefaultCompositionSeed(segmentId)
    composition = await prisma.slideComposition.create({
      data: {
        ...baseFields,
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
      },
    })
    // Only push the freshly-seeded composition back onto the segment when the
    // user hasn't designed this slide yet. If they HAVE (renderedSlideUrl /
    // positioned points / placed avatar), realign the composition TO their
    // design instead — the timeline preview then matches, and the user's
    // slideDesign + snapshot are left exactly as they saved them.
    if (userDesigned) {
      const patch = compositionPatchFromDesign(design)
      if (patch) composition = await prisma.slideComposition.update({ where: { segmentId }, data: patch })
    } else {
      await syncCompositionToSegment(segmentId, composition as any)
    }
  } else if (userDesigned) {
    // Keep the composition (Video Editing's timeline preview) in step with the
    // user's LATEST Visual Design placement on every fetch — but NEVER write
    // back to the segment, so opening/playing Video Editing can't alter the
    // design the user made.
    const patch = compositionPatchFromDesign(design)
    if (patch) composition = await prisma.slideComposition.update({ where: { segmentId }, data: patch })
  } else if (!composition.contentEdited) {
    // The user hasn't personally written/edited this slide's content yet
    // (#everything comes from the script/storyboard until they do) — keep
    // re-deriving title + subtitle + contentBlocks fresh from the pipeline
    // on every fetch, so this always reflects the latest generated script
    // instead of freezing a stale/blank snapshot from whenever the row was
    // first created. Avatar/image placement is left untouched since those
    // are canvas layout choices, not generated content.
    const seed = await buildDefaultCompositionSeed(segmentId)
    composition = await prisma.slideComposition.update({
      where: { segmentId },
      data: {
        title: seed.title,
        subtitle: seed.subtitle,
        contentBlocks: JSON.stringify(seed.contentBlocks),
      },
    })
    await syncCompositionToSegment(segmentId, composition as any)
  }

  // extraImages (2026-08-17) — additional images beyond the primary one,
  // added via VisualDesignerPanel.jsx's extraImages array. There's no
  // SlideComposition column for these (they're purely a slideDesign-level
  // concept, like annotations), so unlike title/contentBlocks/imageUrl
  // above this is never patched INTO the composition row — just read
  // straight off slideDesign on every response so the timeline always sees
  // the current list without needing its own sync/staleness handling.
  const extraImages = Array.isArray(design?.extraImages)
    ? design.extraImages.map((img: any) => ({ id: img.id, url: img.url, shape: img.shape || 'rounded' }))
    : []

  return serializeComposition(composition, { extraImages })
}

async function doPatchComposition(segmentId: string, updates: any): Promise<any> {
  const segment = await prisma.sceneSegment.findUnique({ where: { id: segmentId } })
  if (!segment) return null

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
    where: { segmentId },
    create: {
      segmentId,
      sceneId: segment.sceneId,
      templateId: updates.templateId || 'modern',
      title: updates.title || 'Untitled Slide',
      subtitle: updates.subtitle || '',
      contentBlocks: contentBlocksJson ?? JSON.stringify([]),
      avatarX: updates.avatarX ?? 84,
      avatarY: updates.avatarY ?? 50,
      avatarWidth: updates.avatarWidth ?? 32,
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

  // Keep the render pipeline's data (SceneSegment.slideDesign) in sync with
  // every composition edit — this is what makes canvas edits actually show
  // up in the exported video (see doc comment above).
  await syncCompositionToSegment(segmentId, composition as any)

  // Text Motion / animation (#38) — stored on the Scene itself (drives
  // ffmpegVideo.ts's caption reveal), not on SlideComposition, since it's a
  // per-scene narration setting rather than per-slide layout data.
  if (updates.textAnimationType !== undefined) {
    await prisma.scene.update({
      where: { id: segment.sceneId },
      data: { textAnimationType: updates.textAnimationType },
    }).catch(() => { /* best-effort — composition write already succeeded */ })
  }

  return serializeComposition(composition)
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/sceneSegments/{id}/composition — per-part slide (#40)
// ═══════════════════════════════════════════════════════════════════════════

app.http('getSegmentComposition', {
  methods: ['GET'], route: 'sceneSegments/{id}/composition', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const result = await doGetComposition(req.params.id)
      if (!result) return notFound('Segment not found')
      return { status: 200, jsonBody: result }
    } catch (e) {
      ctx.error('Error fetching segment composition:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/sceneSegments/{id}/composition — per-part slide (#40)
// ═══════════════════════════════════════════════════════════════════════════

app.http('patchSegmentComposition', {
  methods: ['PATCH'], route: 'sceneSegments/{id}/composition', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const updates = (await req.json()) as any
      const result = await doPatchComposition(req.params.id, updates)
      if (!result) return notFound('Segment not found')
      return { status: 200, jsonBody: result }
    } catch (e) {
      ctx.error('Error updating segment composition:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/scenes/{id}/composition — back-compat alias, primary segment only.
// Still used by SceneTimelineEditor.jsx (Video Editing's element-timing
// view), which only ever deals with a scene's single primary slide. NOT
// used by Visual Designer any more — see sceneSegments/{id}/composition
// above for the real per-part editing surface.
// ═══════════════════════════════════════════════════════════════════════════

app.http('getComposition', {
  methods: ['GET'], route: 'scenes/{id}/composition', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segmentId = await findPrimarySegmentId(req.params.id)
      if (!segmentId) return notFound('Scene has no segments')
      const result = await doGetComposition(segmentId)
      if (!result) return notFound('Segment not found')
      return { status: 200, jsonBody: result }
    } catch (e) {
      ctx.error('Error fetching composition:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// Re-seed EVERY segment of one scene from its own script — the shared core of
// both the per-scene reset (below) and the module reset. Clears each segment's
// slide design + snapshot and rebuilds it fresh, applies one theme, and drops
// the scene's rendered image/video so nothing stale lingers.
// ═══════════════════════════════════════════════════════════════════════════
async function reseedSceneDesigns(sceneId: string, theme: string): Promise<number> {
  const segments = await prisma.sceneSegment.findMany({
    where: { sceneId },
    orderBy: { orderIndex: 'asc' },
  })
  let count = 0
  for (const segment of segments) {
    const seed = await buildDefaultCompositionSeed(segment.id)
    const composition = await prisma.slideComposition.upsert({
      where: { segmentId: segment.id },
      create: {
        segmentId: segment.id, sceneId, templateId: theme,
        title: seed.title, subtitle: seed.subtitle,
        contentBlocks: JSON.stringify(seed.contentBlocks),
        avatarX: seed.avatarX, avatarY: seed.avatarY, avatarWidth: seed.avatarWidth,
        titleX: seed.titleX, titleY: seed.titleY, subtitleX: seed.subtitleX, subtitleY: seed.subtitleY,
        contentX: seed.contentX, contentY: seed.contentY, layout: seed.layout,
        status: 'draft', contentEdited: false,
      },
      update: {
        templateId: theme, title: seed.title, subtitle: seed.subtitle,
        contentBlocks: JSON.stringify(seed.contentBlocks),
        avatarX: seed.avatarX, avatarY: seed.avatarY, avatarWidth: seed.avatarWidth,
        titleX: seed.titleX, titleY: seed.titleY, subtitleX: seed.subtitleX, subtitleY: seed.subtitleY,
        contentX: seed.contentX, contentY: seed.contentY, layout: seed.layout,
        contentEdited: false, updatedAt: new Date(),
      },
    })
    await syncCompositionToSegment(segment.id, composition as any)
    await prisma.sceneSegment.update({ where: { id: segment.id }, data: { visualAssetUrl: null } }).catch(() => {})
    count++
  }
  await prisma.scene.update({
    where: { id: sceneId },
    data: { visualAssetUrl: null, avatarVideoUrl: null, status: 'assets_ready' },
  }).catch(() => {})
  return count
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/scenes/{id}/reset-design — start ONE scene's design over from
// scratch (each of its parts re-seeded independently from its own script).
// ═══════════════════════════════════════════════════════════════════════════
app.http('resetSceneDesign', {
  methods: ['POST'], route: 'scenes/{id}/reset-design', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      const body = (await req.json().catch(() => ({}))) as { theme?: string }
      const scene = await prisma.scene.findUnique({ where: { id: sceneId } })
      if (!scene) return notFound('Scene not found')
      // Reuse the scene's current theme if none passed.
      let theme = body.theme
      if (!theme) {
        try { theme = JSON.parse(scene.slideDeckContent || '{}')?.theme } catch { /* ignore */ }
      }
      const count = await reseedSceneDesigns(sceneId, theme || 'light')
      return { status: 200, jsonBody: { message: `Reset ${count} slide(s)`, count } }
    } catch (e) {
      ctx.error('Error resetting scene design:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/modules/{id}/reset-designs — start the whole module's Visual
// Design over from scratch. For EVERY segment (each welcome part — hook,
// introduction, overview, recap — included) this throws away whatever design
// exists and RE-SEEDS a fresh one from that segment's OWN script, so every
// part is independent: editing one never touches another. One theme is applied
// across the module so the deck stays consistent. Scripts and voices are left
// untouched — only the slide designs and their cached snapshots are rebuilt.
// ═══════════════════════════════════════════════════════════════════════════

app.http('resetModuleDesigns', {
  methods: ['POST'], route: 'modules/{id}/reset-designs', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id
      const body = (await req.json().catch(() => ({}))) as { theme?: string }
      const theme = body.theme || 'light'

      const segments = await prisma.sceneSegment.findMany({
        where: { scene: { moduleId } },
        orderBy: [{ scene: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      })
      if (!segments.length) {
        return { status: 404, jsonBody: { error: 'No scenes found for module' } }
      }

      // Rebuild each segment independently. buildDefaultCompositionSeed reads
      // THIS segment's own script/elements, so the hook, introduction and
      // overview each get their own distinct content instead of a shared one.
      let count = 0
      for (const segment of segments) {
        const seed = await buildDefaultCompositionSeed(segment.id)
        const composition = await prisma.slideComposition.upsert({
          where: { segmentId: segment.id },
          create: {
            segmentId: segment.id,
            sceneId: segment.sceneId,
            templateId: theme,
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
            templateId: theme,
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
            // Force a clean slate — treat as un-edited so future script edits
            // keep flowing through until the user personally changes it again.
            contentEdited: false,
            updatedAt: new Date(),
          },
        })
        // Writes the fresh design onto SceneSegment.slideDesign (independent
        // per part) AND drops renderedSlideUrl so no stale snapshot survives.
        await syncCompositionToSegment(segment.id, composition as any)
        // Clear the generated slide image so nothing shows the old design.
        await prisma.sceneSegment.update({
          where: { id: segment.id },
          data: { visualAssetUrl: null },
        }).catch(() => { /* best-effort */ })
        count++
      }

      // Clear scene-level mirrors + any rendered avatar video, and stamp the
      // theme, so Video Editing and the scene list also reflect the reset.
      const sceneIds = [...new Set(segments.map(s => s.sceneId))]
      await Promise.all(sceneIds.map(id =>
        prisma.scene.update({
          where: { id },
          data: { visualAssetUrl: null, avatarVideoUrl: null, status: 'assets_ready' },
        }).catch(() => { /* best-effort */ })
      ))

      return {
        status: 200,
        jsonBody: { message: `Reset ${count} slide designs`, count, theme },
      }
    } catch (e) {
      ctx.error('Error resetting module designs:', e)
      return err500(e)
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/modules/{id}/apply-template (apply template to every slide —
// one PER SEGMENT — in a module) (#40)
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

      const segments = await prisma.sceneSegment.findMany({
        where: { scene: { moduleId } },
        orderBy: [{ scene: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      })
      if (!segments.length) {
        return { status: 404, jsonBody: { error: 'No scenes found for module' } }
      }

      const updated = await Promise.all(
        segments.map(async segment => {
          const existing = await prisma.slideComposition.findUnique({ where: { segmentId: segment.id } })

          if (existing && existing.contentEdited) {
            // User already wrote their own content for this slide — only
            // change the template/styling, leave their text alone.
            return prisma.slideComposition.update({
              where: { segmentId: segment.id },
              data: { templateId, updatedAt: new Date() },
            })
          }

          // No composition yet, or one that's still pipeline-generated
          // content — (re)seed from the latest script/storyboard data so the
          // slide always reflects the generated title/key points (#everything
          // comes from previous steps until the user edits it themselves).
          const seed = await buildDefaultCompositionSeed(segment.id)
          return prisma.slideComposition.upsert({
            where: { segmentId: segment.id },
            create: {
              segmentId: segment.id,
              sceneId: segment.sceneId,
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

      // Sync every updated composition into its own segment's render-pipeline data
      await Promise.all(
        updated.map(composition => syncCompositionToSegment(composition.segmentId, composition as any))
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
// GET /api/modules/{id}/compositions (get all compositions for module — one
// per segment/slide, not per scene) (#40)
// ═══════════════════════════════════════════════════════════════════════════

app.http('getModuleCompositions', {
  methods: ['GET'], route: 'modules/{id}/compositions', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id

      const segments = await prisma.sceneSegment.findMany({
        where: { scene: { moduleId } },
        orderBy: [{ scene: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
      })

      const compositions = await Promise.all(
        segments.map(segment => prisma.slideComposition.findUnique({ where: { segmentId: segment.id } }))
      )

      const result = compositions.filter(Boolean).map(comp => serializeComposition(comp))

      return {
        status: 200,
        jsonBody: {
          moduleId,
          totalSlides: segments.length,
          compositions: result,
        },
      }
    } catch (e) {
      ctx.error('Error fetching module compositions:', e)
      return err500(e)
    }
  },
})
