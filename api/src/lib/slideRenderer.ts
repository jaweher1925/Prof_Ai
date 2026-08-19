/**
 * Shared themed-slide SVG builder — the single source of truth for what a
 * "designed" slide looks like, used by BOTH:
 *   - generateSceneAsset.ts (still-image preview / Visual Designer "Generate
 *     Slide Image" button)
 *   - ffmpegVideo.ts's buildSegmentSlideSvg (actual video render for
 *     segmented scenes, via each segment's own slideDesign — see #38)
 *
 * Previously these lived as two separate, drifting implementations: the rich
 * 5-layout/5-theme renderer here, and a hardcoded simplified one in
 * ffmpegVideo.ts. That drift was the root cause of "the generated video
 * doesn't match what I designed in the Visual Designer" — this file removes
 * the duplication so both paths render pixel-identical output from the same
 * design data.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Mirrors ffmpegVideo.ts's UPLOAD_DIR — this file has no access to that
// module's private constant, and importing it would create a layering
// inversion (ffmpegVideo.ts imports FROM slideRenderer.ts already).
const UPLOAD_DIR = join(process.cwd(), 'uploads')

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}

/**
 * This SVG is rasterized by sharp/libvips (rasterizeSvg in ffmpegVideo.ts),
 * NOT rendered in a browser — so an `<image href="/api/uploads/xxx.png">`
 * pointing at a root-relative URL path does not resolve the way it does in
 * the Visual Designer's live DOM (where the browser resolves it against its
 * own origin). librsvg treats that as a literal filesystem path from disk
 * root, which doesn't exist, so the image silently fails to draw — the rest
 * of the slide renders fine, so this was invisible unless you knew to look
 * for the missing image specifically. This is exactly the "generate img in
 * the slide but did not appear in the vd but i can see it in scene form"
 * report (2026-08-15): the Visual Designer's own WYSIWYG snapshot path
 * (renderedSlideUrl) sidesteps this entirely since it's a real browser
 * screenshot, but any segment that falls back to server-side SVG rebuild —
 * or the "Generate Slide Image" still-preview button, which always uses this
 * path — hit this.
 *
 * Fix: inline local /api/uploads/ images as base64 data URIs, which any SVG
 * rasterizer can decode with no filesystem/network resolution at all. Falls
 * back to the raw URL unchanged for data: URIs (already inline) and for
 * external http(s) URLs (out of scope here — same network-fetch restriction
 * librsvg has by default; pasted external image URLs predate this fix and
 * aren't the reported case).
 */
function resolveImageForSvg(url: string): string {
  if (!url || url.startsWith('data:')) return url
  const match = url.match(/\/api\/uploads\/([^/?]+)/)
  if (!match) return url // external URL — best-effort, not embeddable here
  try {
    const localPath = join(UPLOAD_DIR, match[1])
    if (!existsSync(localPath)) return url
    const ext = (match[1].match(/\.[a-zA-Z0-9]+$/)?.[0] || '').toLowerCase()
    const mime = IMAGE_MIME_BY_EXT[ext] || 'image/png'
    const b64 = readFileSync(localPath).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch {
    return url // best-effort — a broken image is better than a crashed render
  }
}

export interface SlideBullet { text: string; level?: number; color?: string; bold?: boolean; italic?: boolean }
export interface SlideBlock {
  type: 'bullets' | 'definition' | 'quote' | 'two-column' | 'key-concept' | 'summary'
  items?: SlideBullet[]
  term?: string; definition?: string; examples?: string[]
  quote?: string; attribution?: string
  concept?: string
  left?: SlideBullet[]; right?: SlideBullet[]
}
export interface SlideContent {
  title?: string
  subtitle?: string
  layout?: string
  theme?: string
  blocks?: SlideBlock[]
  imagePrompt?: string
  // FEATURE: Store uploaded image + styling in design
  imageUrl?: string
  imageWidth?: number  // % of available space (0-100)
  imageShape?: 'rounded' | 'circle' | 'sharp'  // Rounded, Circle, or Sharp corners
  positions?: Record<string, any>  // Layer positioning from Visual Designer
  showLogo?: boolean
  // FEATURE: Transparent background option
  bgTransparent?: boolean  // Use transparent background instead of gradient
  bgColor?: string  // Override background color (hex)
  // FEATURE: Roadmap layout - for welcome scenes with segments
  segments?: Array<{ segment_type: string; slide_title?: string; text?: string }>
  // WYSIWYG snapshot (#39): PNG of the EXACT slide as shown in the Visual
  // Designer, captured in the browser on save. When present, the video
  // pipeline uses this image directly instead of rebuilding the slide with
  // buildSlide() — guaranteeing the video matches the editor pixel-for-pixel.
  renderedSlideUrl?: string
  // Timed reveal frames (2026-08-17, "if i generate or add img should
  // appear also in the remotion and edit timeline" / "in the final vd ...
  // it is static and everything appear in first time") — a sequence of
  // WYSIWYG snapshots, one per Edit Timeline reveal breakpoint, captured
  // client-side by VisualDesignerPanel.jsx's captureRevealFrames. When
  // present with 2+ entries, ffmpegVideo.ts composites them as TIMED
  // background layers instead of using renderedSlideUrl as one flat static
  // image for the whole clip — each frame fully replaces the previous one
  // once its own `time` (seconds into the segment) arrives. Absent, or
  // fewer than 2 entries, means the segment behaves exactly as before
  // (falls straight back to renderedSlideUrl / the SVG fallback).
  revealFrames?: Array<{ time: number; url: string }>
  // Avatar placeholder position/size synced from SlideComposition (#3, #4) —
  // % of slide, center-anchored, 9:16 box. Read by ffmpegVideo.ts's
  // overlayAvatarOnVideo() so the final composited avatar lands exactly
  // where the user placed it on the Visual Designer canvas instead of the
  // old hardcoded bottom-right position.
  avatarX?: number
  avatarY?: number
  avatarWidth?: number
  // Responsive image placement synced from SlideComposition (#5) — absolute
  // top-left % position + independent width/height %, so an image can be
  // freely stretched (not just uniformly scaled) and can be sized relative
  // to either the content area or the avatar placeholder boundary. Takes
  // priority over the legacy `positions.image` offset scheme below when set.
  imageX?: number
  imageY?: number
  imageHeight?: number
  // Free-position content points, straight from the Visual Designer's own
  // contentBlocks (#see EditorContentBlock below) — each point keeps its
  // OWN x/y/cadreStyle/showDetails instead of being flattened into one
  // auto-flowing bullet list. THIS is what the WYSIWYG canvas actually
  // renders (every layout, not just 'bullets' — layout only changes text
  // alignment there), so when present it takes priority over the legacy
  // `blocks`-based renderers below, which drop each point's individual
  // position/frame and is why generated slides/video used to not match
  // what was actually designed on the canvas.
  positionedBlocks?: Array<{
    text?: string
    keyPoints?: string[]
    x?: number
    y?: number
    cadreStyle?: string
    showDetails?: boolean
    visible?: boolean
  }>
}

// Visual Designer content blocks — the WYSIWYG editor's per-point shape —
// look like { text, keyPoints, x, y, zIndex, cadreStyle, showDetails }.
// That is NOT the { type, items } shape the render* functions above search
// for (blocks.find(b => b.type === 'bullets')). Passing editor content
// blocks straight through as `blocks` therefore matched nothing and the
// generated slide silently dropped every point/detail, rendering title and
// subtitle only — this is the single conversion point that keeps the
// generated PNG showing the same content the user actually wrote.
export interface EditorContentBlock {
  text?: string
  keyPoints?: string[]
  [key: string]: any
}

export function toSlideBlocks(contentBlocks: EditorContentBlock[], layout?: string): SlideBlock[] {
  if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) return []

  // Flatten every point + its nested key points into one bullets list
  // (level 1 = main idea, level 2 = supporting detail) — the SAME
  // convention scriptGeneratorAgent.ts and the Visual Designer editor
  // itself use (the editor's bullet-level toggle only ever produces 1 or
  // 2, never 0 — see VisualDesignerPanel.jsx's bullets state). renderBullets()
  // below matches this convention now too.
  const items: SlideBullet[] = []
  for (const block of contentBlocks) {
    if (block?.text) items.push({ text: block.text, level: 1 })
    if (Array.isArray(block?.keyPoints)) {
      for (const kp of block.keyPoints) {
        if (kp) items.push({ text: kp, level: 2 })
      }
    }
  }

  const blocks: SlideBlock[] = []
  if (items.length > 0) blocks.push({ type: 'bullets', items })

  // Best-effort mapping for layouts whose data the editor doesn't collect
  // as dedicated fields (definition/quote only have generic text +
  // keyPoints to work with) — reuse the first point so these layouts show
  // something meaningful instead of coming up empty.
  const first = contentBlocks[0]
  if (layout === 'definition' && first?.text) {
    blocks.push({
      type: 'definition',
      term: first.text,
      definition: (first.keyPoints || [])[0] || '',
      examples: (first.keyPoints || []).slice(1),
    })
  }
  if (layout === 'quote' && first?.text) {
    blocks.push({
      type: 'quote',
      quote: first.text,
      attribution: (first.keyPoints || [])[0] || '',
    })
  }

  return blocks
}

export const THEMES: Record<string, {
  bg1: string; bg2: string; bg3: string
  accent: string; accentLight: string
  title: string; body: string; muted: string
  glow: string
}> = {
  // GVSU palette (https://www.gvsu.edu/identity/color-2). GVSU Blue leads;
  // Link Blue / Archway / Midnight / Arboretum / Carillon accent it. Big Lake
  // is deliberately unused — it reads green. Keep in step with the frontend
  // THEMES in VisualDesignerPanel.jsx and the preview tables in
  // SceneTimelineEditor.jsx / VideoCanvasEditor.jsx.
  'light': {
    bg1: '#FFFFFF', bg2: '#F7FAFE', bg3: '#F1F5FD',
    accent: '#0032A0', accentLight: '#0032A020',
    title: '#0B1220', body: '#334155', muted: '#7A8BA8',
    glow: '#0032A0',
  },
  'dark-navy': {
    bg1: '#050A24', bg2: '#0C1140', bg3: '#13155C',
    accent: '#0ECBF0', accentLight: '#0ECBF020',
    title: '#FFFFFF', body: '#AFC2E4', muted: '#7E93BC',
    glow: '#0ECBF0',
  },
  'academic': {
    bg1: '#FBF8F1', bg2: '#F7F1E4', bg3: '#F2E9D8',
    accent: '#0032A0', accentLight: '#0032A020',
    title: '#1A1206', body: '#5A4A32', muted: '#9A876A',
    glow: '#BA6F4C',
  },
  'ocean': {
    bg1: '#04182E', bg2: '#072843', bg3: '#0A3358',
    accent: '#0ECBF0', accentLight: '#0ECBF020',
    title: '#FFFFFF', body: '#A9CBEC', muted: '#7BA3CC',
    glow: '#0ECBF0',
  },
  'corporate': {
    bg1: '#0B0B0D', bg2: '#151310', bg3: '#1C1A17',
    accent: '#DEC197', accentLight: '#DEC19720',
    title: '#FFFFFF', body: '#C4B49A', muted: '#8E8069',
    glow: '#BA6F4C',
  },
  'modern': {
    bg1: '#001A5C', bg2: '#002678', bg3: '#0032A0',
    accent: '#0ECBF0', accentLight: '#0ECBF020',
    title: '#FFFFFF', body: '#C6D6F5', muted: '#93AEE0',
    glow: '#0ECBF0',
  },
  'minimal': {
    bg1: '#FFFFFF', bg2: '#FAFBFD', bg3: '#F1F3F6',
    accent: '#13155C', accentLight: '#13155C20',
    title: '#0B1220', body: '#3F4A5C', muted: '#8B95A6',
    glow: '#13155C',
  },
  'vibrant': {
    bg1: '#1E052C', bg2: '#340851', bg3: '#4A0C6E',
    accent: '#0ECBF0', accentLight: '#0ECBF020',
    title: '#FFFFFF', body: '#DCC3EA', muted: '#B08FC4',
    glow: '#0ECBF0',
  },
  'forest': {
    bg1: '#080F26', bg2: '#0E1240', bg3: '#13155C',
    accent: '#DEC197', accentLight: '#DEC19720',
    title: '#FFFFFF', body: '#CBD6EC', muted: '#8FA0C2',
    glow: '#DEC197',
  },
  'sunset': {
    bg1: '#2F1C13', bg2: '#472A1C', bg3: '#6C402C',
    accent: '#DEC197', accentLight: '#DEC19720',
    title: '#FFFFFF', body: '#E8D3B8', muted: '#B39877',
    glow: '#BA6F4C',
  },
  'elegant': {
    bg1: '#000000', bg2: '#0A0A0A', bg3: '#161616',
    accent: '#DEC197', accentLight: '#DEC19720',
    title: '#FFFFFF', body: '#D5C4A8', muted: '#8F8069',
    glow: '#DEC197',
  },
  'startup': {
    bg1: '#050A24', bg2: '#0B2177', bg3: '#0032A0',
    accent: '#0ECBF0', accentLight: '#0ECBF020',
    title: '#FFFFFF', body: '#BDCAE6', muted: '#8FA5D5',
    glow: '#0ECBF0',
  },
}

function esc(str: string): string {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= max) { cur = (cur + ' ' + w).trim() }
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 2)
}

const TITLE_BASE_Y   = 200
const TITLE_LINE_H    = 78
const SUBTITLE_Y      = 330
const DIVIDER_Y        = 380
const CONTENT_Y        = 460

// Per-layout default layer positions — MUST mirror VisualDesignerPanel.jsx's
// own DEFAULT_POSITIONS table exactly. The editor's canvas positions
// title/subtitle/content/image layers with `left: x%, top: y%` — an ABSOLUTE
// position on the 1920x1080 slide, not an offset from anywhere. Whatever's
// saved in slide.positions[key] (a user's drag) REPLACES that layout's
// default for that key entirely; it never gets added on top of anything.
// This file used to instead read positions[key].x/y as a DELTA added to a
// flat, layout-independent pixel base (TITLE_BASE_Y=200, CONTENT_Y=460) —
// a completely different coordinate system from what the editor actually
// draws. A title dragged to the WYSIWYG canvas's (48%, 40%) rendered around
// (100px, 628px) ≈ (5%, 58%) in the exported slide/video instead — content
// dragged into the two-column composition next to the avatar landed almost
// entirely below the bottom edge and effectively vanished. Reported
// 2026-08-13 ("the generated video doesn't match Visual Design" — title in
// the wrong place, the content bullet missing entirely). resolvePos() below
// reproduces the editor's own default-merged-with-saved, then converts
// straight to absolute pixels — no added base.
const DEFAULT_POSITIONS: Record<string, Record<string, { x: number; y: number }>> = {
  'bullets':    { title: { x: 7,  y: 15 }, subtitle: { x: 7,  y: 32 }, content: { x: 7,  y: 44 } },
  'title-hero': { title: { x: 10, y: 24 }, subtitle: { x: 10, y: 48 }, content: { x: 10, y: 66 } },
  'two-column': { title: { x: 7,  y: 11 }, subtitle: { x: 7,  y: 28 }, content: { x: 7,  y: 40 } },
  'icon-grid':  { title: { x: 7,  y: 10 }, subtitle: { x: 7,  y: 27 }, content: { x: 7,  y: 39 } },
  'key-stats':  { title: { x: 7,  y: 11 }, subtitle: { x: 7,  y: 28 }, content: { x: 7,  y: 40 } },
  'chart':      { title: { x: 7,  y: 10 }, subtitle: { x: 7,  y: 27 }, content: { x: 7,  y: 39 } },
  'definition': { title: { x: 7,  y: 12 }, subtitle: { x: 7,  y: 30 }, content: { x: 7,  y: 48 } },
  'quote':      { title: { x: 12, y: 12 }, subtitle: { x: 12, y: 82 }, content: { x: 12, y: 26 } },
  'summary':    { title: { x: 7,  y: 11 }, subtitle: { x: 7,  y: 28 }, content: { x: 7,  y: 40 } },
}

function resolvePos(
  layout: string,
  key: 'title' | 'subtitle' | 'content',
  saved?: { x?: number; y?: number; scale?: number } | null
): { x: number; y: number; scale: number } {
  const def = (DEFAULT_POSITIONS[layout] || DEFAULT_POSITIONS['bullets'])[key]
  return {
    x: typeof saved?.x === 'number' ? saved.x : def.x,
    y: typeof saved?.y === 'number' ? saved.y : def.y,
    scale: typeof saved?.scale === 'number' ? saved.scale : 1,
  }
}

// Roadmap layout constants (for visual flow diagrams)
const ROADMAP_CIRCLE_RADIUS = 70
const ROADMAP_START_Y = 450
const ROADMAP_CIRCLE_SPACING = 360

/**
 * IMPROVED TYPOGRAPHY: No default/forced bullet points. Content is grouped
 * into focused main ideas with nested supporting points underneath, to keep
 * dense text from turning into a chaotic flat bullet list.
 *
 * Structure:
 * - Main focus idea (level 0): Large, bold, accent color
 * - Nested supporting points (level 1-2): Smaller, muted, indented
 * - Auto-scaling: however many main ideas the content needs are shown; if
 *   they'd overflow the slide, font size and spacing scale down instead of
 *   silently truncating content (#6, #7 — no fixed slide caps).
 */
function renderBullets(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number, offsetX: number = 0, wrapChars: number = 60): string {
  const items = blocks.find(b => b.type === 'bullets')?.items || []
  if (!items || items.length === 0) return ''
  // Marker column sits at the content block's own left edge; text starts
  // clear of it. These used to be baseX=108 / boxX=96 — i.e. the marker
  // began just 12px left of the text while being up to 16px WIDE, so it
  // always overlapped the first character ("▪kubectl installed", reported
  // 2026-08-15 as "the placement of text and icon not good"). Text x is now
  // derived from the marker's actual width below instead of a fixed 12px
  // guess, matching the editor's own bullet row (marker, then a real gap,
  // then text — see VisualDesignerPanel.jsx's BulletsContent).
  const markerX = 96 + offsetX
  const dotX1 = 128 + offsetX
  const dotX2 = 160 + offsetX
  // Sub-point wrap widths scale proportionally with the main wrapChars so
  // the whole block narrows consistently as the avatar placeholder grows.
  const subWrapChars1 = Math.max(18, Math.round(wrapChars * (70 / 60)))
  const subWrapChars2 = Math.max(16, Math.round(wrapChars * (75 / 60)))

  // Group items: level 0/1 (undefined counts as 1, the default everywhere
  // else in the app) are main ideas, level 2+ are supporting details. This
  // MUST match how bullets are actually produced — scriptGeneratorAgent.ts
  // and the Visual Designer editor both use level 1 for a main bullet and
  // level 2 for an indented sub-point, never level 0. The old `level === 0`
  // check here meant EVERY main bullet (all saved as level 1) matched
  // nothing, so this whole block silently rendered empty for any slide
  // that was never manually opened in the editor (which is most freshly
  // generated content) — reported as "some scenes are just a title with no
  // content points".
  const mainIdeas = items.filter(i => !i.level || i.level <= 1)
  if (!mainIdeas.length) return ''

  // Each main idea's OWN supporting points are whatever level-2+ items sit
  // between it and the NEXT main idea (or the end of the list) — not every
  // level-2+ item in the rest of the array. Slicing to "the rest of items"
  // (as this used to) meant a single trailing sub-point got reattached
  // under EVERY main idea instead of just the one it actually follows,
  // duplicating it down the whole slide once real main ideas started
  // rendering again (see the level-1/level-0 fix above). Precomputed once
  // and reused by both the size estimate and the actual draw loop below so
  // they can never disagree.
  const mainIdeaIndex = new Map(mainIdeas.map((mi, idx) => [mi, idx]))
  const supportingPointsFor = (mainIdea: SlideBullet): SlideBullet[] => {
    const idx = mainIdeaIndex.get(mainIdea)!
    const startIdx = items.indexOf(mainIdea) + 1
    const endIdx = idx + 1 < mainIdeas.length ? items.indexOf(mainIdeas[idx + 1]) : items.length
    return items.slice(startIdx, endIdx).filter(i => (i.level ?? 1) >= 2)
  }

  const AVAILABLE_H = 980 - startY

  // Estimate how much vertical space this content would need at full size,
  // then scale down font/line-height proportionally if it doesn't fit —
  // rather than cutting ideas off after a hardcoded count.
  const estimateLines = (text: string, maxChars: number) => wrap(esc(text), maxChars).length
  let estimatedH = 0
  for (const mainIdea of mainIdeas) {
    estimatedH += estimateLines(mainIdea.text, wrapChars) > 1 ? 110 : 80
    for (const sp of supportingPointsFor(mainIdea)) {
      estimatedH += estimateLines(sp.text, sp.level === 2 ? subWrapChars2 : subWrapChars1) > 1 ? 95 : 60
    }
    estimatedH += 20
  }

  const scale = estimatedH > AVAILABLE_H ? Math.max(0.55, AVAILABLE_H / estimatedH) : 1
  const mainFontSize = Math.round(40 * scale)
  const mainLineH = Math.round(48 * scale)
  const subFontSize1 = Math.round(32 * scale)
  const subFontSize2 = Math.round(28 * scale)
  const subLineH = Math.round(40 * scale)
  const gapMain = Math.max(8, Math.round(20 * scale))
  const gapAfterMain = Math.max(50, Math.round(80 * scale))
  const gapAfterMainMulti = Math.max(70, Math.round(110 * scale))
  const gapAfterSub = Math.max(35, Math.round(60 * scale))
  const gapAfterSubMulti = Math.max(55, Math.round(95 * scale))

  let svg = ''
  let y = startY

  for (const mainIdea of mainIdeas) {
    // MAIN IDEA - larger, bolder, accent color. A small square accent marker
    // (matching the editor's BulletsContent dot) sits to the left of the text
    // instead of the translucent full-width highlight box this used to draw.
    // That box never existed in the actual Visual Designer canvas — it only
    // ever showed up on scenes that fell back to this renderer because they
    // were never opened/saved in Visual Design — so it read as an unwanted
    // "frame" ("cadre") behind every bullet that didn't match the editor.
    const mainLines = wrap(esc(mainIdea.text), wrapChars)
    const markerSize = Math.max(10, Math.round(16 * scale))
    const textX = markerX + markerSize + 14
    svg += `<rect x="${markerX}" y="${y - markerSize + 4}" width="${markerSize}" height="${markerSize}" rx="3" fill="${mainIdea.color || t.accent}"/>`

    for (let i = 0; i < mainLines.length; i++) {
      svg += `<text x="${textX}" y="${y + i * mainLineH}" font-family="Arial,sans-serif" font-size="${mainFontSize}"
        fill="${mainIdea.color || t.title}" font-weight="700" letter-spacing="-0.5">${mainLines[i]}</text>`
    }

    y += mainLines.length > 1 ? gapAfterMainMulti : gapAfterMain

    // Nested supporting points (level 2+) directly following this main idea
    // — and only this one, see supportingPointsFor above.
    for (const supportPoint of supportingPointsFor(mainIdea)) {
      const isLevel2 = supportPoint.level === 2
      const indentX = isLevel2 ? dotX2 : dotX1
      const indentDot = isLevel2 ? 3 : 5
      const supportLines = wrap(esc(supportPoint.text), isLevel2 ? subWrapChars2 : subWrapChars1)

      svg += `<circle cx="${indentX}" cy="${y - 8}" r="${indentDot}" fill="${supportPoint.color || t.muted}" opacity="0.6"/>`

      // Text clears the dot's RIGHT edge (cx + r), not its center — same
      // overlap bug the main marker had just above.
      const subTextX = indentX + indentDot + 14
      for (let i = 0; i < supportLines.length; i++) {
        svg += `<text x="${subTextX}" y="${y + i * subLineH}" font-family="Arial,sans-serif" font-size="${isLevel2 ? subFontSize2 : subFontSize1}"
          fill="${supportPoint.color || (isLevel2 ? t.muted : t.body)}" font-weight="${supportPoint.bold ? '600' : '400'}"
          font-style="${supportPoint.italic ? 'italic' : 'normal'}">${supportLines[i]}</text>`
      }

      y += supportLines.length > 1 ? gapAfterSubMulti : gapAfterSub
    }

    y += gapMain // spacing between main ideas
    if (y > 980) break // safety net only — scaling above should prevent this
  }

  return svg
}

/**
 * Renders each content point at its OWN x/y position (matching the Visual
 * Designer canvas's getContentBlockStyle/getBlockPosition math exactly —
 * same contentBaseLeftPct/contentMaxWidthPct/hero-centering rules), instead
 * of auto-flowing everything into one generic top-to-bottom bullet list.
 * This is the actual shape of what the editor lets you build (any number of
 * independently-placed points, each with its own frame + nested key
 * points), so it's used for every layout when the composition has it —
 * 'layout' only ever changed text alignment/centering in the editor, never
 * the underlying per-point positioning.
 */
function renderPositionedBlocks(
  blocks: NonNullable<SlideContent['positionedBlocks']>,
  t: typeof THEMES['dark-navy'],
  isHeroLayout: boolean,
  contentBaseLeftPct: number,
  contentMaxWidthPct: number,
): string {
  const W = 1920, H = 1080
  const MAIN_FONT = 32, MAIN_LINE_H = 40
  const SUB_FONT = 24, SUB_LINE_H = 32
  const wrapChars = Math.max(18, Math.round(contentMaxWidthPct * 0.85))
  const subWrapChars = Math.max(16, Math.round(wrapChars * 1.05))

  let svg = ''
  for (const block of blocks) {
    if (!block || block.visible === false) continue
    const text = (block.text || '').trim()
    const keyPoints = (block.keyPoints || []).filter((kp) => !!kp?.trim())
    if (!text && !keyPoints.length) continue

    const xPct = isHeroLayout ? 50 + (block.x || 0) : contentBaseLeftPct + (block.x || 0)
    const yPct = block.y ?? 0
    const centerXPx = (W * xPct) / 100
    const boxWPx = (W * contentMaxWidthPct) / 100
    const boxYPx = (H * yPct) / 100
    // Hero blocks are center-anchored (mirrors the canvas's translate(-50%,0)),
    // everything else is left-anchored at its own box edge.
    const textAnchor = isHeroLayout ? 'middle' : 'start'
    const textX = isHeroLayout ? centerXPx : centerXPx + 24
    const kpX = isHeroLayout ? centerXPx : centerXPx + 40

    const mainLines = text ? wrap(esc(text), wrapChars) : []
    const showDetails = block.showDetails !== false
    const kpLineGroups = showDetails ? keyPoints.map((kp) => wrap(esc(kp), subWrapChars)) : []

    // Frame background (cadreStyle) — estimate the box height up front so
    // the tint/border rect fully covers the wrapped text instead of a
    // fixed guess that clips multi-line points.
    const applyFrame = !!block.cadreStyle && block.cadreStyle !== 'none'
    if (applyFrame) {
      const totalLines = mainLines.length + kpLineGroups.reduce((n, g) => n + g.length, 0)
      const frameH = Math.max(60, mainLines.length * MAIN_LINE_H + kpLineGroups.reduce((n, g) => n + g.length * SUB_LINE_H, 0) + 24)
      const frameX = isHeroLayout ? centerXPx - boxWPx / 2 : centerXPx
      const rounded = block.cadreStyle === 'rounded' ? 24 : 8
      svg += `<rect x="${frameX}" y="${boxYPx - 14}" width="${boxWPx}" height="${frameH}" rx="${rounded}"
        fill="${t.title}" opacity="0.05"/>`
      if (block.cadreStyle === 'bold') {
        svg += `<rect x="${frameX}" y="${boxYPx - 14}" width="${boxWPx}" height="${frameH}" rx="${rounded}"
          fill="none" stroke="${t.accent}" stroke-width="2.5"/>`
      } else if (!isHeroLayout) {
        svg += `<rect x="${frameX}" y="${boxYPx - 14}" width="4" height="${frameH}" fill="${t.accent}"/>`
      }
      void totalLines // (kept for future finer-grained sizing if needed)
    }

    let y = boxYPx + 22
    for (const line of mainLines) {
      svg += `<text x="${textX}" y="${y}" font-family="Arial,sans-serif" font-size="${MAIN_FONT}"
        text-anchor="${textAnchor}" fill="${t.title}" font-weight="700">${line}</text>`
      y += MAIN_LINE_H
    }
    for (const lines of kpLineGroups) {
      for (let i = 0; i < lines.length; i++) {
        const prefix = i === 0 ? '– ' : ''
        svg += `<text x="${kpX}" y="${y}" font-family="Arial,sans-serif" font-size="${SUB_FONT}"
          text-anchor="${textAnchor}" fill="${t.body}" opacity="0.85">${prefix}${lines[i]}</text>`
        y += SUB_LINE_H
      }
    }
  }
  return svg
}

function renderDefinition(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number = CONTENT_Y): string {
  const b = blocks.find(b => b.type === 'definition')
  if (!b) return ''
  let svg = ''
  svg += `<rect x="96" y="${startY}" width="900" height="70" rx="12" fill="${t.accentLight}"/>
  <rect x="96" y="${startY}" width="900" height="70" rx="12" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
  <text x="146" y="${startY + 45}" font-family="Arial,sans-serif" font-size="38" fill="${t.accent}" font-weight="700">${esc(b.term || '')}</text>`
  const defLines = wrap(esc(b.definition || ''), 72)
  const defStartY = startY + 108
  for (let i = 0; i < defLines.length; i++) {
    svg += `<text x="108" y="${defStartY + i * 48}" font-family="Arial,sans-serif" font-size="34" fill="${t.body}">${defLines[i]}</text>`
  }
  let ey = defStartY + defLines.length * 48 + 40
  if (b.examples?.length) {
    svg += `<text x="108" y="${ey}" font-family="Arial,sans-serif" font-size="26" fill="${t.accent}" font-weight="600" letter-spacing="2">EXAMPLES</text>`
    ey += 40
    for (const ex of b.examples.slice(0, 3)) {
      svg += `<circle cx="124" cy="${ey - 8}" r="4" fill="${t.accent}"/>
      <text x="148" y="${ey}" font-family="Arial,sans-serif" font-size="30" fill="${t.muted}">${esc(ex)}</text>`
      ey += 48
    }
  }
  return svg
}

function renderQuote(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number = CONTENT_Y): string {
  const b = blocks.find(b => b.type === 'quote')
  if (!b) return ''
  const lines = wrap(esc(b.quote || ''), 58)
  const quoteStartY = startY + 70
  let svg = `<text x="96" y="${startY}" font-family="Georgia,serif" font-size="90" fill="${t.accent}" opacity="0.3">"</text>`
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    svg += `<text x="120" y="${quoteStartY + i * 80}" font-family="Georgia,serif" font-size="56" fill="${t.title}" font-style="italic">${lines[i]}</text>`
  }
  if (b.attribution) {
    svg += `<text x="120" y="${quoteStartY + Math.min(lines.length, 3) * 80 + 50}" font-family="Arial,sans-serif" font-size="28" fill="${t.accent}">— ${esc(b.attribution)}</text>`
  }
  return svg
}

function renderSplit(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number = CONTENT_Y): string {
  const b = blocks.find(b => b.type === 'two-column' || (b.type as any) === 'split')
  const left = b?.left || blocks.find(x => x.type === 'bullets')?.items?.slice(0, 3) || []
  const right = b?.right || blocks.find(x => x.type === 'bullets')?.items?.slice(3, 6) || []
  const boxH = 980 - startY
  const labelY = startY + 50
  let svg = `<rect x="96" y="${startY}" width="730" height="${boxH}" rx="16" fill="${t.accentLight}" opacity="0.5"/>
  <rect x="870" y="${startY}" width="730" height="${boxH}" rx="16" fill="${t.accentLight}" opacity="0.3"/>
  <text x="200" y="${labelY}" font-family="Arial,sans-serif" font-size="24" fill="${t.accent}" font-weight="600" letter-spacing="3">CONCEPT</text>
  <text x="974" y="${labelY}" font-family="Arial,sans-serif" font-size="24" fill="${t.accent}" font-weight="600" letter-spacing="3">EXAMPLES</text>`

  let ly = startY + 90
  for (const item of left.slice(0, 4)) {
    const lines = wrap(esc(item.text), 32)
    svg += `<circle cx="124" cy="${ly - 8}" r="5" fill="${t.accent}"/>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="148" y="${ly + i * 38}" font-family="Arial,sans-serif" font-size="28" fill="${t.body}">${lines[i]}</text>`
    }
    ly += lines.length > 1 ? 100 : 68
  }

  let ry = startY + 90
  for (const item of right.slice(0, 4)) {
    const lines = wrap(esc(item.text), 32)
    svg += `<circle cx="898" cy="${ry - 8}" r="5" fill="${t.accent}" opacity="0.6"/>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="922" y="${ry + i * 38}" font-family="Arial,sans-serif" font-size="28" fill="${t.muted}">${lines[i]}</text>`
    }
    ry += lines.length > 1 ? 100 : 68
  }
  return svg
}

function renderSummary(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number = CONTENT_Y): string {
  const items = blocks.find(b => b.type === 'summary' || b.type === 'bullets')?.items || []
  let svg = ''; let y = startY
  for (const item of items.slice(0, 5)) {
    const lines = wrap(esc(item.text), 60)
    svg += `<rect x="96" y="${y - 28}" width="40" height="40" rx="8" fill="${t.accent}"/>
    <text x="108" y="${y - 2}" font-family="Arial,sans-serif" font-size="26" fill="white" font-weight="700">✓</text>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="156" y="${y + i * 42}" font-family="Arial,sans-serif" font-size="34" fill="${t.body}" font-weight="${item.level === 1 ? '500' : '400'}">${lines[i]}</text>`
    }
    y += lines.length > 1 ? 115 : 80
    if (y > 990) break
  }
  return svg
}

/** Render a welcome scene roadmap with 5 circles showing the learning flow */
function renderRoadmap(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], segments?: any[]): string {
  if (!segments || segments.length === 0) return ''
  
  // Map segment types to colors and icons
  const segmentConfig: Record<string, { color: string; icon: string; label: string }> = {
    hook:        { color: '#06B6D4', icon: '📌', label: 'Hook' },
    content:     { color: '#10B981', icon: '📚', label: 'Content' },
    interaction: { color: '#F59E0B', icon: '💡', label: 'Think' },
    recap:       { color: '#EC4899', icon: '✓', label: 'Recap' },
  }
  
  const circleRadius = 70
  const startX = 150
  const centerY = 550
  const spacing = 340
  
  let svg = ''
  
  // Draw connecting lines first (behind circles)
  for (let i = 0; i < segments.length - 1; i++) {
    const x1 = startX + i * spacing + circleRadius
    const x2 = startX + (i + 1) * spacing - circleRadius
    svg += `<line x1="${x1}" y1="${centerY}" x2="${x2}" y2="${centerY}" stroke="${t.accent}" stroke-width="3" opacity="0.3"/>`
    svg += `<polygon points="${x2},${centerY} ${x2-15},${centerY-8} ${x2-15},${centerY+8}" fill="${t.accent}" opacity="0.3"/>`
  }
  
  // Draw circles with segment info
  for (let i = 0; i < Math.min(segments.length, 5); i++) {
    const seg = segments[i]
    const x = startX + i * spacing
    const config = segmentConfig[seg.segment_type] || { color: t.accent, icon: '●', label: 'Step' }
    
    // Circle background gradient
    svg += `<defs><radialGradient id="grad${i}" cx="40%" cy="40%"><stop offset="0%" style="stop-color:${config.color};stop-opacity:0.3" /><stop offset="100%" style="stop-color:${config.color};stop-opacity:0.1" /></radialGradient></defs>`
    svg += `<circle cx="${x}" cy="${centerY}" r="${circleRadius}" fill="url(#grad${i})" stroke="${config.color}" stroke-width="4" opacity="0.8"/>`
    
    // Icon
    svg += `<text x="${x}" y="${centerY + 18}" font-family="Arial,sans-serif" font-size="56" text-anchor="middle" fill="${config.color}">${config.icon}</text>`
    
    // Label
    svg += `<text x="${x}" y="${centerY + 130}" font-family="Arial,sans-serif" font-size="26" text-anchor="middle" fill="${t.title}" font-weight="700">${config.label}</text>`
    
    // Description
    const description = seg.slide_title || config.label
    const wrapped = wrap(description, 18)
    wrapped.slice(0, 2).forEach((line, idx) => {
      svg += `<text x="${x}" y="${centerY + 170 + idx * 28}" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" fill="${t.body}" opacity="0.7">${esc(line)}</text>`
    })
  }
  
  return svg
}

/** Render a full themed 1920x1080 slide SVG from design data. Used for both
 *  the Visual Designer's still-image preview AND the video render pipeline. */
export function buildSlide(slide: SlideContent, moduleTitle: string, sceneIndex: number, totalScenes: number = 1): string {
  const W = 1920, H = 1080
  const t = THEMES[slide.theme || 'dark-navy'] || THEMES['dark-navy']
  const layout = slide.layout || 'bullets'
  const isLight = slide.theme === 'light'

  console.log(`[buildSlide] Creating slide`, {
    layout,
    theme: slide.theme,
    title: slide.title?.substring(0, 50),
    subtitle: slide.subtitle?.substring(0, 50),
    blocksCount: slide.blocks?.length,
    imageUrl: !!slide.imageUrl,
    imageUrlPreview: slide.imageUrl?.substring(0, 50),
    showLogo: slide.showLogo,
    motionId: (slide as any).motionId,
  })

  // Extract position offsets from Visual Designer (percentage-based)
  const positions = slide.positions || {}
  const imagePos = positions.image || { x: 0, y: 0, scale: 1 }

  // Image placement is the one remaining offset-based (not absolute) spot —
  // left as-is, see the legacy image-placement branch further down.
  const imageOffsetX = (W * imagePos.x) / 100 || 0
  const imageOffsetY = (H * imagePos.y) / 100 || 0

  // The other 8 layouts: resolvePos() merges each saved position over that
  // layout's own default (same shallow merge the editor's canvas does), then
  // this converts straight to ABSOLUTE pixels on the 1920x1080 slide — no
  // added base — matching `left: x%, top: y%` on the editor's DraggableLayer.
  const resolvedTitle    = resolvePos(layout, 'title', positions.title)
  const resolvedContent  = resolvePos(layout, 'content', positions.content)

  // A scene that's never been opened/dragged in Visual Design (no saved
  // positions at all) with genuinely SHORT content — one bullet line, no
  // sub-points — renders title/subtitle/content all cramped into the
  // default top-left anchors (15%/32%/44%), leaving roughly the bottom half
  // of the slide completely empty. Reads as sparse/unfinished rather than a
  // deliberate design choice — reported 2026-08-15 ("text is mal placed and
  // not good, remember this for a student"). Nudging the whole group down
  // toward vertical center fixes that WITHOUT touching anything the user
  // actually customized (this only fires when positions/positionedBlocks
  // are both entirely absent) and without risking longer content — a scene
  // with real substance keeps its normal top anchor so wrapped lines still
  // have room to run before hitting the avatar or the bottom edge.
  const hasCustomTextPositions = !!(positions.title || positions.subtitle || positions.content)
  const contentItemCount = slide.blocks?.[0]?.items?.length || 0
  const isSparseDefaultSlide = !hasCustomTextPositions
    && !(slide.positionedBlocks && slide.positionedBlocks.length)
    && contentItemCount <= 1
    && layout !== 'title-hero'
  // Not capped against the avatar's own box the way hero's text is above —
  // the existing horizontal wrap budget (availableWidthPct/titleWrapChars,
  // computed below from the avatar's LEFT edge) already keeps a bullet line
  // from running into the avatar's column regardless of which Y it starts
  // at, and sparse content is by definition short enough to comfortably fit
  // inside that budget.
  const sparseShiftPct = isSparseDefaultSlide ? 12 : 0

  const titleXPx    = (W * resolvedTitle.x) / 100
  const titleYPx    = (H * (resolvedTitle.y + sparseShiftPct)) / 100
  const contentXPx  = (W * resolvedContent.x) / 100
  const contentYPx  = (H * (resolvedContent.y + sparseShiftPct)) / 100

  // Absolute for every layout, hero included — see resolvePos()'s comment.
  // Hero was originally left on the OLD "960 + a small offset nudge" model
  // on the theory that its centered composition needed different math, but
  // VisualDesignerPanel.jsx's TitleLayer positions hero's title through the
  // exact same absolute-position DraggableLayer every other layout uses
  // (only the CSS text-align changes to centered) — so hero needs the same
  // absolute-position fix, just centered within its own box instead of
  // left-aligned. Reported 2026-08-14: with a saved `positions.title` that
  // happened to equal the layout's own default ({x:10,y:24}), the old
  // formula still added it as an offset on top of the hero-only base of
  // 440px, landing the title around y=699px (~65% down) — deep inside the
  // avatar's own vertical footprint instead of safely above it.
  const titleY = titleYPx
  const titleFontSize = (layout === 'title-hero' ? 84 : 64) * resolvedTitle.scale
  const titleText = esc((slide.title || '').slice(0, 90))
  // Subtitle ("Key Insight") — restored (2026-08-11): it was forced empty
  // here to match the Visual Designer canvas, which used to suppress it too.
  // That meant the Timeline Editor still showed a "Key Insight" element
  // queued up to appear, but it could never actually show on the rendered
  // slide — reported as "in remotion i can see the point under the title
  // but i can't see it in the scene when i play". The canvas now draws it
  // again (VisualDesignerPanel.jsx's TitleHeroContent) for title-hero
  // slides, so this fallback (only used for scenes never opened/saved in
  // the editor yet) needs to match.
  const subtitleText = esc((slide.subtitle || '').slice(0, 90))

  // Text position synced with the avatar placeholder (#layout fluidity):
  // wherever the avatar sits, the title/content wrap width narrows so text
  // never runs underneath it — same rule the Visual Designer canvas already
  // applies live, now mirrored here so the exported/generated slide matches.
  const avatarLeftEdgePct = typeof slide.avatarX === 'number' && typeof slide.avatarWidth === 'number'
    ? slide.avatarX - slide.avatarWidth / 2
    : 100
  // 42 chars/line is tuned for the full-width (~72%) text column; scale
  // proportionally down to as few as ~26 chars/line when the avatar
  // placeholder eats further into the slide.
  const availableWidthPct = Math.max(35, Math.min(72, avatarLeftEdgePct - 4))
  const titleWrapChars = Math.max(22, Math.round(42 * (availableWidthPct / 72)))
  const titleLines = layout === 'title-hero' ? [titleText] : wrap(titleText, titleWrapChars)

  // Same contentBaseLeftPct/contentMaxWidthPct math as the Visual Designer
  // canvas (VisualDesignerPanel.jsx's own avatarOnLeft/contentBaseLeftPct/
  // contentMaxWidthPct) — needed so renderPositionedBlocks places each point
  // exactly where the canvas does, including which side of the avatar the
  // text column starts on.
  const avatarXForContent = typeof slide.avatarX === 'number' ? slide.avatarX : 84
  const avatarWidthForContent = typeof slide.avatarWidth === 'number' ? slide.avatarWidth : 32
  const avatarRightEdgePctFull = avatarXForContent + avatarWidthForContent / 2
  const avatarOnLeft = avatarXForContent < 50
  const contentBaseLeftPct = avatarOnLeft ? Math.min(60, avatarRightEdgePctFull + 3) : 0
  const contentMaxWidthPct = avatarOnLeft
    ? Math.max(30, Math.min(90, 96 - contentBaseLeftPct))
    : Math.max(40, Math.min(90, avatarLeftEdgePct - 2))
  
  // NOTE: non-hero layouts deliberately draw NO subtitle and no divider
  // rule. VisualDesignerPanel.jsx removed the subtitle layer from its canvas
  // ("Subtitle (Key Insight) no longer shown on the slide — removed per
  // request"): `positions.subtitle` still exists in saved data, but nothing
  // renders into it, and BulletsContent et al ignore the subtitle prop
  // entirely. This renderer kept drawing it anyway, at whatever
  // positions.subtitle happened to hold — usually the layout DEFAULT, which
  // sits ABOVE where a dragged-down title ends up, so it printed the
  // subtitle straight through the title ("Kubernetes Command-Line" over
  // "Local Environment Prerequisites", reported 2026-08-15). Only hero
  // still shows a subtitle, drawn inside heroTitleSvg from the content
  // box's position, exactly like the editor's TitleHeroContent does.

  let contentSvg = ''
  const blocks = slide.blocks || []

  // Hero centers its title WITHIN its own draggable box rather than at a
  // fixed screen x=960 — VisualDesignerPanel.jsx's LAYER_WIDTHS makes that
  // box 65% wide, CSS text-align:center then centers the text inside it, so
  // the true visual center is `positions.title.x + 65/2`, not just
  // `positions.title.x` (that's the box's LEFT edge) and not screen-center
  // either unless the box also happens to be screen-centered. Hero's
  // subtitle + key-point line (TitleHeroContent) render inside the CONTENT
  // box instead — a separate draggable layer with its own position
  // (positions.content) and its own scale, not tied to the title at all.
  const HERO_BOX_WIDTH_PCT = 65 // VisualDesignerPanel.jsx's LAYER_WIDTHS.title / .content
  const heroTitleCenterXPct = resolvedTitle.x + HERO_BOX_WIDTH_PCT / 2
  const heroContentCenterXPct = resolvedContent.x + HERO_BOX_WIDTH_PCT / 2
  const heroTitleCenterXPx = (W * heroTitleCenterXPct) / 100
  const heroContentCenterXPx = (W * heroContentCenterXPct) / 100

  // Shrinks a hero text block's font so its estimated rendered half-width
  // clears the avatar box, but only when that block's own vertical band
  // actually overlaps the avatar's — the avatar composites ON TOP of the
  // finished slide, so text underneath it is simply hidden rather than
  // safely running behind it. This grew into a real problem across several
  // earlier crop/headroom fixes that each made the avatar box bigger
  // (aspect 16:9 -> 4:3 -> 1:1, default width 19% -> 22%) without hero's
  // text ever being told to make room for it — reported 2026-08-14
  // ("hair... on top of the title") for the plain DEFAULT bottom-right box.
  const heroAvoidScale = (centerXPct: number, yPct: number, fontPx: number, textLen: number): number => {
    if (typeof slide.avatarX !== 'number' || typeof slide.avatarWidth !== 'number' || typeof slide.avatarY !== 'number') return 1
    if (!textLen) return 1
    const avHalfWPct = slide.avatarWidth / 2
    const avLeftPct = slide.avatarX - avHalfWPct
    const avRightPct = slide.avatarX + avHalfWPct
    // Box height in % follows the SAME width->height rule as the actual
    // composited box (ffmpegVideo.ts: boxHPx = boxWPx * AVATAR_BOX_ASPECT(1)
    // in PIXELS on the 1920x1080 canvas — folding in the 16:9 aspect to
    // convert that to a HEIGHT PERCENTAGE gives width% * 16/9).
    const avHalfHPct = (slide.avatarWidth * (16 / 9)) / 2
    const avTopPct = slide.avatarY - avHalfHPct
    const avBottomPct = slide.avatarY + avHalfHPct
    const lineHalfHPct = ((fontPx * 0.9) / H) * 100
    const bandTopPct = yPct - lineHalfHPct
    const bandBottomPct = yPct + lineHalfHPct
    if (!(avTopPct < bandBottomPct && avBottomPct > bandTopPct)) return 1
    const safeHalfPct = centerXPct <= slide.avatarX
      ? Math.max(10, avLeftPct - centerXPct - 2)
      : Math.max(10, centerXPct - avRightPct - 2)
    // Rough estimate of the text's natural rendered half-width at full
    // size — bold Arial averages close to 0.56x font-size per character,
    // good enough to pick a font SCALE with, not a pixel-exact layout.
    const naturalHalfWidthPct = ((textLen * fontPx * 0.56) / 2 / W) * 100
    if (naturalHalfWidthPct <= safeHalfPct) return 1
    return Math.max(0.55, safeHalfPct / naturalHalfWidthPct)
  }

  const heroTitleScale = layout === 'title-hero' ? heroAvoidScale(heroTitleCenterXPct, resolvedTitle.y, titleFontSize, titleText.length) : 1
  const heroTitleFontSize = titleFontSize * heroTitleScale
  const heroSubtitleFontSizeBase = 40 * (resolvedContent.scale || 1)
  const heroSubtitleScale = layout === 'title-hero' ? heroAvoidScale(heroContentCenterXPct, resolvedContent.y, heroSubtitleFontSizeBase, subtitleText.length) : 1
  const heroSubtitleFontSize = heroSubtitleFontSizeBase * heroSubtitleScale
  const heroKeyPointFontSizeBase = 34 * (resolvedContent.scale || 1)
  const heroKeyPointText = esc((blocks[0]?.items?.[0]?.text || '').slice(0, 140))
  const heroKeyPointScale = layout === 'title-hero' ? heroAvoidScale(heroContentCenterXPct, resolvedContent.y + 3, heroKeyPointFontSizeBase, heroKeyPointText.length) : 1
  const heroKeyPointFontSize = heroKeyPointFontSizeBase * heroKeyPointScale

  // Title text itself is always drawn from the shared title/subtitle SVG
  // below for non-hero layouts; title-hero draws its own centered title
  // right here since it's visually a different composition entirely. The
  // subtitle + key-point line both live in the CONTENT box's position
  // (resolvedContent), stacked with a small fixed gap between them —
  // matching TitleHeroContent's own `flex flex-col gap-[3%]` stack.
  const heroTitleSvg = layout === 'title-hero' ? `
      <text x="${heroTitleCenterXPx}" y="${titleY}" font-family="Arial,sans-serif" font-size="${heroTitleFontSize}"
        fill="${t.title}" font-weight="800" text-anchor="middle">${titleText}</text>
      ${subtitleText ? `<text x="${heroContentCenterXPx}" y="${contentYPx}" font-family="Arial,sans-serif" font-size="${heroSubtitleFontSize}"
        fill="${t.accent}" text-anchor="middle" font-weight="500">${subtitleText}</text>` : ''}
      ${heroKeyPointText ? `<text x="${heroContentCenterXPx}" y="${contentYPx + (subtitleText ? 46 : 0)}" font-family="Arial,sans-serif" font-size="${heroKeyPointFontSize}"
        fill="${t.body}" text-anchor="middle" font-weight="500">${heroKeyPointText}</text>` : ''}
  ` : ''

  if (slide.positionedBlocks && slide.positionedBlocks.length > 0) {
    // Modern path: every point keeps the EXACT position it has on the
    // Visual Designer canvas, regardless of which "layout" preset is
    // selected — the editor itself only ever varied title alignment
    // between layouts, never the underlying per-point placement, so this
    // is what actually matches what was designed (#the original bug: the
    // old per-layout switch below flattened all points into one generic
    // list/definition/quote/etc, silently discarding where each one was
    // actually dragged to).
    contentSvg = heroTitleSvg + renderPositionedBlocks(slide.positionedBlocks, t, layout === 'title-hero', contentBaseLeftPct, contentMaxWidthPct)
  } else {
    // Legacy fallback — pre-WYSIWYG content that never had per-point x/y
    // saved (or content from very old scenes). Keeps working exactly as
    // before instead of rendering blank.
    switch (layout) {
      case 'title-hero':
        // Key-point line is already drawn inside heroTitleSvg above (it
        // reads the same blocks[0].items[0].text), positioned with the rest
        // of the content box instead of a title-relative offset — nothing
        // left to add here.
        contentSvg = heroTitleSvg
        break
      case 'definition':
        contentSvg = renderDefinition(blocks, t)
        break
      case 'quote':
        contentSvg = renderQuote(blocks, t)
        break
      case 'split':
        contentSvg = renderSplit(blocks, t)
        break
      case 'summary':
        contentSvg = renderSummary(blocks, t)
        break
      case 'roadmap':
        contentSvg = renderRoadmap(blocks, t, (slide as any).segments)
        break
      default:
        // Content block position is the user's own absolute drag position
        // (positions.content, resolved against this layout's default — see
        // resolvePos() above), not CONTENT_Y-plus-an-offset. renderBullets'
        // own baseX already starts at 108px, so subtract that back out here
        // rather than change its signature. wrapChars narrows the same way
        // titleWrapChars does, so bullets never run under the avatar
        // placeholder either.
        contentSvg = renderBullets(blocks, t, contentYPx, contentXPx - 108, titleWrapChars)
    }
  }

  const total = Math.max(totalScenes, 1)
  const pct = Math.min(1, (sceneIndex + 1) / total)
  const barW = 300, barH = 6, barX = W - 100 - barW, barY = 58

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${t.bg1}"/>
    <stop offset="60%" stop-color="${t.bg2}"/>
    <stop offset="100%" stop-color="${t.bg3}"/>
  </linearGradient>
  <radialGradient id="glow" cx="5%" cy="5%" r="55%">
    <stop offset="0%" stop-color="${t.glow}" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="${t.glow}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="fade" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${t.bg1}" stop-opacity="${isLight ? '0.92' : '0.96'}"/>
    <stop offset="62%" stop-color="${t.bg1}" stop-opacity="${isLight ? '0.85' : '0.90'}"/>
    <stop offset="100%" stop-color="${t.bg1}" stop-opacity="0"/>
  </linearGradient>
</defs>

<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
  <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${isLight ? '#0001' : '#1E3A5F'}" stroke-width="0.5" opacity="${isLight ? '0.3' : '0.4'}"/>
</pattern>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
<rect width="${W}" height="${H}" fill="url(#fade)"/>

<!-- Top accent bar -->
<rect x="0" y="0" width="${W}" height="6" fill="${t.accent}"/>

${layout !== 'title-hero' ? (() => {
  const pillLabel = esc(moduleTitle.toUpperCase().slice(0, 40))
  const pillW = Math.min(700, Math.max(220, pillLabel.length * 15 + 80))
  const titleLinesSvg = titleLines.map((line, i) =>
    `<text x="${titleXPx}" y="${titleYPx + i * TITLE_LINE_H}" font-family="Arial,sans-serif" font-size="${titleFontSize}"
      fill="${t.title}" font-weight="700" letter-spacing="-1">${line}</text>`
  ).join('\n')
  // Module tag pill starts clear of the logo circle (centered at 80,80,
  // r=58 → right edge at x≈138) instead of x=100, which used to sit right
  // under the logo and get visually clipped by it — "separate the logo
  // from the module name" fix.
  const pillX = 170
  return `
<!-- Module tag pill -->
<rect x="${pillX}" y="40" width="${pillW}" height="46" rx="23" fill="${t.accentLight}"/>
<rect x="${pillX}" y="40" width="${pillW}" height="46" rx="23" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<text x="${pillX + pillW / 2}" y="70" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="${t.accent}"
  font-weight="700" letter-spacing="2">${pillLabel}</text>

<!-- Progress bar (replaces literal scene numbering) -->
<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="${t.muted}" opacity="0.25"/>
<rect x="${barX}" y="${barY}" width="${barW * pct}" height="${barH}" rx="3" fill="${t.accent}"/>

<!-- Main title — fixed-height band, never overlaps content below -->
${titleLinesSvg}
`
})() : `
<!-- Hero: module label centered at top -->
<text x="960" y="100" font-family="Arial,sans-serif" font-size="22" fill="${t.accent}"
  font-weight="600" letter-spacing="4" text-anchor="middle">${esc(moduleTitle.toUpperCase().slice(0, 40))}</text>
<rect x="360" y="120" width="1200" height="1" fill="${t.accent}" opacity="0.3" rx="1"/>
<rect x="${barX}" y="58" width="${barW}" height="${barH}" rx="3" fill="${t.muted}" opacity="0.25"/>
<rect x="${barX}" y="58" width="${barW * pct}" height="${barH}" rx="3" fill="${t.accent}"/>
`}

<!-- Content -->
${contentSvg}

<!-- FEATURE: Uploaded image with styling from Visual Designer -->
${slide.imageUrl ? (() => {
  // Responsive image placement (#5): SlideComposition's absolute imageX/Y +
  // independent imageWidth/imageHeight take priority — this lets a user
  // freely stretch an image (non-uniform scale), not just resize it
  // proportionally. Falls back to the legacy centered/offset scheme for
  // slides that predate the WYSIWYG canvas.
  const hasAbsolutePlacement = typeof slide.imageX === 'number' && typeof slide.imageY === 'number'
  const imgW = Math.min(95, slide.imageWidth || 36)  // % of width, capped at 95%
  const imgH = hasAbsolutePlacement && typeof slide.imageHeight === 'number'
    ? Math.min(95, slide.imageHeight)                // independent height % — allows stretching
    : Math.round(imgW * 0.67)                         // legacy: fixed 3:2 aspect ratio
  const imgX = hasAbsolutePlacement ? (slide.imageX as number) : ((100 - imgW) / 2) + imagePos.x
  const imgYPct = hasAbsolutePlacement ? (slide.imageY as number) : undefined

  // SVG clip path requires inline radius specification (no % in rx/ry for clip paths)
  // Convert percentages to absolute pixels for clip path
  const imgXPx = (W * imgX) / 100
  const imgYPx = hasAbsolutePlacement ? (H * (imgYPct as number)) / 100 : (CONTENT_Y + 200) + imageOffsetY
  const imgWPx = (W * imgW) / 100
  const imgHPx = hasAbsolutePlacement ? (H * imgH) / 100 : imgH
  
  const cornerRadius = slide.imageShape === 'circle' 
    ? Math.min(imgWPx, imgHPx) / 2 
    : slide.imageShape === 'rounded' 
    ? 30
    : 8
  
  // Safe image URL handling - resolve local uploads to inline base64 (see
  // resolveImageForSvg) so sharp/librsvg can actually decode them, then
  // escape special chars for SVG attribute embedding.
  const safeImageUrl = resolveImageForSvg(slide.imageUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
  
  return `<!-- Image layer -->
<defs>
  <clipPath id="imgClip">
    <rect x="${imgXPx}" y="${imgYPx}" width="${imgWPx * (imagePos.scale || 1)}" height="${imgHPx * (imagePos.scale || 1)}" 
      rx="${cornerRadius}" ry="${cornerRadius}"/>
  </clipPath>
</defs>
<image x="${imgXPx}" y="${imgYPx}" width="${imgWPx * (imagePos.scale || 1)}" height="${imgHPx * (imagePos.scale || 1)}" 
  href="${safeImageUrl}" preserveAspectRatio="xMidYMid slice" 
  clip-path="url(#imgClip)" opacity="0.95"/>
<!-- Image border for definition -->
<rect x="${imgXPx}" y="${imgYPx}" width="${imgWPx * (imagePos.scale || 1)}" height="${imgHPx * (imagePos.scale || 1)}" 
  fill="none" stroke="${t.accent}" stroke-width="3" rx="${cornerRadius}" ry="${cornerRadius}" opacity="0.5"/>`
})() : ''}

<!-- Branding -->
<text x="100" y="${H - 40}" font-family="Arial,sans-serif" font-size="16" fill="${t.muted}"
  letter-spacing="2" font-weight="600" opacity="0.6">PROFAI STUDIO</text>


<!-- Decorative circles -->
<circle cx="1780" cy="180" r="280" fill="${t.accent}" opacity="0.04"/>
<circle cx="1820" cy="920" r="180" fill="${t.accent}" opacity="0.05"/>
</svg>`
}
