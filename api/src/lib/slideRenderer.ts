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
  // (level 0 = main idea, level 1 = supporting detail) — the shape
  // renderBullets() expects, and what renderSplit()/renderSummary() fall
  // back to as well.
  const items: SlideBullet[] = []
  for (const block of contentBlocks) {
    if (block?.text) items.push({ text: block.text, level: 0 })
    if (Array.isArray(block?.keyPoints)) {
      for (const kp of block.keyPoints) {
        if (kp) items.push({ text: kp, level: 1 })
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
  'dark-navy': {
    bg1: '#020C1B', bg2: '#0A1628', bg3: '#0F1F3D',
    accent: '#3B82F6', accentLight: '#3B82F620',
    title: '#F8FAFC', body: '#CBD5E1', muted: '#64748B',
    glow: '#3B82F6',
  },
  'ocean': {
    bg1: '#041A2E', bg2: '#062D4F', bg3: '#083B66',
    accent: '#06B6D4', accentLight: '#06B6D420',
    title: '#F0FDFF', body: '#BAE6FD', muted: '#7DD3FC',
    glow: '#06B6D4',
  },
  'academic': {
    bg1: '#0A1A0A', bg2: '#0D2B0D', bg3: '#133913',
    accent: '#10B981', accentLight: '#10B98120',
    title: '#F0FDF4', body: '#BBF7D0', muted: '#6EE7B7',
    glow: '#10B981',
  },
  'light': {
    bg1: '#F8FAFC', bg2: '#F1F5F9', bg3: '#E2E8F0',
    accent: '#6366F1', accentLight: '#6366F120',
    title: '#0F172A', body: '#334155', muted: '#94A3B8',
    glow: '#6366F1',
  },
  'corporate': {
    bg1: '#111827', bg2: '#1F2937', bg3: '#374151',
    accent: '#F59E0B', accentLight: '#F59E0B20',
    title: '#F9FAFB', body: '#D1D5DB', muted: '#6B7280',
    glow: '#F59E0B',
  },
  // ── Visual Designer template library (#1) — each of the 10 frontend
  // template ids maps 1:1 to a theme here, so choosing a template actually
  // changes how the rendered/exported video looks, not just the editor UI.
  'modern': {
    bg1: '#0B1220', bg2: '#111C33', bg3: '#152246',
    accent: '#3B82F6', accentLight: '#3B82F620',
    title: '#F8FAFC', body: '#CBD5E1', muted: '#64748B',
    glow: '#3B82F6',
  },
  'minimal': {
    bg1: '#FAFAFA', bg2: '#F3F4F6', bg3: '#E5E7EB',
    accent: '#6B7280', accentLight: '#6B728020',
    title: '#111827', body: '#374151', muted: '#9CA3AF',
    glow: '#6B7280',
  },
  'vibrant': {
    bg1: '#2A0A1A', bg2: '#3D0F28', bg3: '#4F1436',
    accent: '#EC4899', accentLight: '#EC489920',
    title: '#FFF5F7', body: '#FBCFE8', muted: '#F472B6',
    glow: '#EC4899',
  },
  'forest': {
    bg1: '#08170D', bg2: '#0D2416', bg3: '#123420',
    accent: '#16A34A', accentLight: '#16A34A20',
    title: '#F0FDF4', body: '#BBF7D0', muted: '#4ADE80',
    glow: '#16A34A',
  },
  'sunset': {
    bg1: '#1F1408', bg2: '#331F0C', bg3: '#4A2C10',
    accent: '#F97316', accentLight: '#F9731620',
    title: '#FFFBEB', body: '#FED7AA', muted: '#FB923C',
    glow: '#F97316',
  },
  'elegant': {
    bg1: '#0D0D0D', bg2: '#1A1A1A', bg3: '#262626',
    accent: '#D97706', accentLight: '#D9770620',
    title: '#F5F5F5', body: '#D4D4D4', muted: '#A3A3A3',
    glow: '#D97706',
  },
  'startup': {
    bg1: '#05070D', bg2: '#0D1117', bg3: '#161B22',
    accent: '#58A6FF', accentLight: '#58A6FF20',
    title: '#F0F6FC', body: '#C9D1D9', muted: '#8B949E',
    glow: '#58A6FF',
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
  const baseX = 108 + offsetX
  const boxX = 96 + offsetX
  const dotX1 = 128 + offsetX
  const dotX2 = 160 + offsetX
  // Sub-point wrap widths scale proportionally with the main wrapChars so
  // the whole block narrows consistently as the avatar placeholder grows.
  const subWrapChars1 = Math.max(18, Math.round(wrapChars * (70 / 60)))
  const subWrapChars2 = Math.max(16, Math.round(wrapChars * (75 / 60)))

  // Group items: level-0 are main ideas, level-1/2 are supporting details
  const mainIdeas = items.filter(i => !i.level || i.level === 0)
  if (!mainIdeas.length) return ''

  const AVAILABLE_H = 980 - startY

  // Estimate how much vertical space this content would need at full size,
  // then scale down font/line-height proportionally if it doesn't fit —
  // rather than cutting ideas off after a hardcoded count.
  const estimateLines = (text: string, maxChars: number) => wrap(esc(text), maxChars).length
  let estimatedH = 0
  for (const mainIdea of mainIdeas) {
    estimatedH += estimateLines(mainIdea.text, wrapChars) > 1 ? 110 : 80
    const supportingPoints = items
      .slice(items.indexOf(mainIdea) + 1)
      .filter(i => (i.level === 1 || i.level === 2) && items.indexOf(i) - items.indexOf(mainIdea) <= items.length)
    for (const sp of supportingPoints) {
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
    // MAIN IDEA - larger, bolder, accent color
    const mainLines = wrap(esc(mainIdea.text), wrapChars)
    svg += `<rect x="${boxX}" y="${y - 10}" width="1728" height="${mainLines.length > 1 ? Math.round(100 * scale) : Math.round(72 * scale)}" 
      rx="8" fill="${t.accent}" opacity="0.08"/>`

    for (let i = 0; i < mainLines.length; i++) {
      svg += `<text x="${baseX}" y="${y + i * mainLineH}" font-family="Arial,sans-serif" font-size="${mainFontSize}" 
        fill="${mainIdea.color || t.title}" font-weight="700" letter-spacing="-0.5">${mainLines[i]}</text>`
    }

    y += mainLines.length > 1 ? gapAfterMainMulti : gapAfterMain

    // Nested supporting points (level 1-2) directly following this main idea
    const supportingPoints = items
      .slice(items.indexOf(mainIdea) + 1)
      .filter(i => (i.level === 1 || i.level === 2) && items.indexOf(i) - items.indexOf(mainIdea) <= items.length)

    for (const supportPoint of supportingPoints) {
      const isLevel2 = supportPoint.level === 2
      const indentX = isLevel2 ? dotX2 : dotX1
      const indentDot = isLevel2 ? 3 : 5
      const supportLines = wrap(esc(supportPoint.text), isLevel2 ? subWrapChars2 : subWrapChars1)

      svg += `<circle cx="${indentX}" cy="${y - 8}" r="${indentDot}" fill="${supportPoint.color || t.muted}" opacity="0.6"/>`

      for (let i = 0; i < supportLines.length; i++) {
        svg += `<text x="${indentX + 20}" y="${y + i * subLineH}" font-family="Arial,sans-serif" font-size="${isLevel2 ? subFontSize2 : subFontSize1}"
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
  const titlePos = positions.title || { x: 0, y: 0, scale: 1 }
  const subtitlePos = positions.subtitle || { x: 0, y: 0, scale: 1 }
  const contentPos = positions.content || { x: 0, y: 0, scale: 1 }
  const imagePos = positions.image || { x: 0, y: 0, scale: 1 }
  
  // Convert percentage offsets to pixels
  const titleOffsetX = (W * titlePos.x) / 100 || 0
  const titleOffsetY = (H * titlePos.y) / 100 || 0
  const subtitleOffsetX = (W * subtitlePos.x) / 100 || 0
  const subtitleOffsetY = (H * subtitlePos.y) / 100 || 0
  const contentOffsetX = (W * contentPos.x) / 100 || 0
  const contentOffsetY = (H * contentPos.y) / 100 || 0
  const imageOffsetX = (W * imagePos.x) / 100 || 0
  const imageOffsetY = (H * imagePos.y) / 100 || 0

  const titleY = (layout === 'title-hero' ? 440 : TITLE_BASE_Y) + titleOffsetY
  const titleFontSize = (layout === 'title-hero' ? 84 : 64) * (titlePos.scale || 1)
  const titleText = esc((slide.title || '').slice(0, 90))
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
  
  // Calculate subtitle Y based on number of title lines to avoid overlap
  // If title is multi-line, push subtitle down further
  const subtitleYAdjust = (layout === 'title-hero' 
    ? 330 
    : Math.max(330, TITLE_BASE_Y + titleLines.length * TITLE_LINE_H + 30)) + subtitleOffsetY

  let contentSvg = ''
  const blocks = slide.blocks || []

  switch (layout) {
    case 'title-hero':
      contentSvg = `
      <text x="${960 + titleOffsetX}" y="${titleY}" font-family="Arial,sans-serif" font-size="${titleFontSize}"
        fill="${t.title}" font-weight="800" text-anchor="middle">${titleText}</text>
      ${subtitleText ? `<text x="${960 + subtitleOffsetX}" y="${titleY + 100}" font-family="Arial,sans-serif" font-size="${40 * (subtitlePos.scale || 1)}"
        fill="${t.accent}" text-anchor="middle" font-weight="500">${subtitleText}</text>` : ''}
      <rect x="${760 + subtitleOffsetX}" y="${titleY + 140}" width="400" height="3" rx="2" fill="${t.accent}" opacity="0.6"/>
      ${blocks[0]?.items?.[0] ? `<text x="${960 + subtitleOffsetX}" y="${titleY + 230}" font-family="Arial,sans-serif" font-size="34"
        fill="${t.body}" text-anchor="middle" opacity="0.9">${esc(blocks[0].items[0].text)}</text>` : ''}
      `
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
      // Content block position now responds to the user's own drag offset
      // (positions.content), same as title/subtitle — previously this was
      // hardcoded to CONTENT_Y and ignored contentOffsetX/contentOffsetY.
      // wrapChars narrows the same way titleWrapChars does, so bullets never
      // run under the avatar placeholder either.
      contentSvg = renderBullets(blocks, t, CONTENT_Y + contentOffsetY, contentOffsetX, titleWrapChars)
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
    `<text x="100" y="${TITLE_BASE_Y + i * TITLE_LINE_H}" font-family="Arial,sans-serif" font-size="${titleFontSize}"
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
${subtitleText ? `<text x="100" y="${subtitleYAdjust}" font-family="Arial,sans-serif" font-size="32"
  fill="${t.accent}" font-weight="500" opacity="0.9">${subtitleText}</text>` : ''}
<rect x="100" y="${Math.max(DIVIDER_Y, subtitleYAdjust + 50)}" width="900" height="2" fill="${t.accent}" opacity="0.4" rx="1"/>
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
  
  // Safe image URL handling - escape special chars for SVG
  const safeImageUrl = (slide.imageUrl || '')
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
