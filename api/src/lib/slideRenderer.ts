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

function renderBullets(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number): string {
  const items = blocks.find(b => b.type === 'bullets')?.items || []
  let svg = ''; let y = startY
  for (const item of items.slice(0, 5)) {
    const lvl2 = item.level === 2
    const x = lvl2 ? 160 : 108
    const fs = lvl2 ? 30 : 36
    // FEATURE: Support custom text color from item.color (user can set via color picker in VD)
    const color = item.color || (lvl2 ? t.muted : t.body)
    const dotColor = lvl2 ? t.muted : t.accent
    // FEATURE: Support bold (item.bold) and italic (item.italic) styling
    const fontWeight = item.bold ? '700' : (lvl2 ? '400' : '500')
    const fontStyle = item.italic ? 'italic' : 'normal'
    const lines = wrap(esc(item.text), lvl2 ? 72 : 65)
    svg += `<circle cx="${x}" cy="${y - 8}" r="${lvl2 ? 4 : 6}" fill="${dotColor}"/>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="${x + 22}" y="${y + i * 42}" font-family="Arial,sans-serif" font-size="${fs}" fill="${color}" font-weight="${fontWeight}" font-style="${fontStyle}">${lines[i]}</text>`
    }
    y += lines.length > 1 ? (lvl2 ? 100 : 115) : (lvl2 ? 72 : 88)
    if (y > 990) break
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

/** Render a full themed 1920x1080 slide SVG from design data. Used for both
 *  the Visual Designer's still-image preview AND the video render pipeline. */
export function buildSlide(slide: SlideContent, moduleTitle: string, sceneIndex: number, totalScenes: number = 1): string {
  const W = 1920, H = 1080
  const t = THEMES[slide.theme || 'dark-navy'] || THEMES['dark-navy']
  const layout = slide.layout || 'bullets'
  const isLight = slide.theme === 'light'

  const titleY = layout === 'title-hero' ? 440 : TITLE_BASE_Y
  const titleFontSize = layout === 'title-hero' ? 84 : 64
  const titleText = esc((slide.title || '').slice(0, 90))
  const subtitleText = esc((slide.subtitle || '').slice(0, 90))
  const titleLines = layout === 'title-hero' ? [titleText] : wrap(titleText, 42)

  let contentSvg = ''
  const blocks = slide.blocks || []

  switch (layout) {
    case 'title-hero':
      contentSvg = `
      <text x="960" y="${titleY}" font-family="Arial,sans-serif" font-size="${titleFontSize}"
        fill="${t.title}" font-weight="800" text-anchor="middle">${titleText}</text>
      ${subtitleText ? `<text x="960" y="${titleY + 100}" font-family="Arial,sans-serif" font-size="40"
        fill="${t.accent}" text-anchor="middle" font-weight="500">${subtitleText}</text>` : ''}
      <rect x="760" y="${titleY + 140}" width="400" height="3" rx="2" fill="${t.accent}" opacity="0.6"/>
      ${blocks[0]?.items?.[0] ? `<text x="960" y="${titleY + 230}" font-family="Arial,sans-serif" font-size="34"
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
    default:
      contentSvg = renderBullets(blocks, t, CONTENT_Y)
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
  return `
<!-- Module tag pill -->
<rect x="100" y="40" width="${pillW}" height="46" rx="23" fill="${t.accentLight}"/>
<rect x="100" y="40" width="${pillW}" height="46" rx="23" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<text x="${100 + pillW / 2}" y="70" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="${t.accent}"
  font-weight="700" letter-spacing="2">${pillLabel}</text>

<!-- Progress bar (replaces literal scene numbering) -->
<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="${t.muted}" opacity="0.25"/>
<rect x="${barX}" y="${barY}" width="${barW * pct}" height="${barH}" rx="3" fill="${t.accent}"/>

<!-- Main title — fixed-height band, never overlaps content below -->
${titleLinesSvg}
${subtitleText ? `<text x="100" y="${SUBTITLE_Y}" font-family="Arial,sans-serif" font-size="32"
  fill="${t.accent}" font-weight="500" opacity="0.9">${subtitleText}</text>` : ''}
<rect x="100" y="${DIVIDER_Y}" width="900" height="2" fill="${t.accent}" opacity="0.4" rx="1"/>
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
  const imgW = Math.min(90, slide.imageWidth || 36)  // % of width, capped at 90%
  const imgH = Math.round(imgW * 0.67)  // 3:2 aspect ratio
  const imgX = (100 - imgW) / 2  // Center horizontally
  const imgY = CONTENT_Y + 200  // Below content
  
  // SVG clip path requires inline radius specification (no % in rx/ry for clip paths)
  // Convert percentages to absolute pixels for clip path
  const imgXPx = (W * imgX) / 100
  const imgYPx = imgY
  const imgWPx = (W * imgW) / 100
  const imgHPx = imgH
  
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
    <rect x="${imgXPx}" y="${imgYPx}" width="${imgWPx}" height="${imgHPx}" 
      rx="${cornerRadius}" ry="${cornerRadius}"/>
  </clipPath>
</defs>
<image x="${imgXPx}" y="${imgYPx}" width="${imgWPx}" height="${imgHPx}" 
  href="${safeImageUrl}" preserveAspectRatio="xMidYMid slice" 
  clip-path="url(#imgClip)" opacity="0.95"/>
<!-- Image border for definition -->
<rect x="${imgXPx}" y="${imgYPx}" width="${imgWPx}" height="${imgHPx}" 
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
