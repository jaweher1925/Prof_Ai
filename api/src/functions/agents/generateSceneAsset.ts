/**
 * POST /api/generateSceneAsset
 * Step 4 — Slide generation.
 * Gamma-style: structured content → layout template → themed SVG → PNG
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideBullet { text: string; level?: number }
interface SlideBlock {
  type: 'bullets' | 'definition' | 'quote' | 'two-column' | 'key-concept' | 'summary'
  items?: SlideBullet[]
  term?: string; definition?: string; examples?: string[]
  quote?: string; attribution?: string
  concept?: string
  left?: SlideBullet[]; right?: SlideBullet[]
}
interface SlideContent {
  title?: string
  subtitle?: string
  layout?: string
  theme?: string
  blocks?: SlideBlock[]
  imagePrompt?: string
}

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: Record<string, {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Layout renderers ─────────────────────────────────────────────────────────

function renderBullets(blocks: SlideBlock[], t: typeof THEMES['dark-navy'], startY: number): string {
  const items = blocks.find(b => b.type === 'bullets')?.items || []
  let svg = ''; let y = startY
  for (const item of items.slice(0, 5)) {
    const lvl2 = item.level === 2
    const x = lvl2 ? 160 : 108
    const fs = lvl2 ? 30 : 36
    const color = lvl2 ? t.muted : t.body
    const dotColor = lvl2 ? t.muted : t.accent
    const lines = wrap(esc(item.text), lvl2 ? 72 : 65)
    svg += `<circle cx="${x}" cy="${y - 8}" r="${lvl2 ? 4 : 6}" fill="${dotColor}"/>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="${x + 22}" y="${y + i * 42}" font-family="Arial,sans-serif" font-size="${fs}" fill="${color}">${lines[i]}</text>`
    }
    y += lines.length > 1 ? (lvl2 ? 100 : 115) : (lvl2 ? 72 : 88)
    if (y > 990) break
  }
  return svg
}

function renderDefinition(blocks: SlideBlock[], t: typeof THEMES['dark-navy']): string {
  const b = blocks.find(b => b.type === 'definition')
  if (!b) return ''
  let svg = ''
  // Term box
  svg += `<rect x="96" y="400" width="900" height="70" rx="12" fill="${t.accentLight}"/>
  <rect x="96" y="400" width="900" height="70" rx="12" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
  <text x="146" y="445" font-family="Arial,sans-serif" font-size="38" fill="${t.accent}" font-weight="700">${esc(b.term || '')}</text>`
  // Definition
  const defLines = wrap(esc(b.definition || ''), 72)
  for (let i = 0; i < defLines.length; i++) {
    svg += `<text x="108" y="${508 + i * 48}" font-family="Arial,sans-serif" font-size="34" fill="${t.body}">${defLines[i]}</text>`
  }
  // Examples
  let ey = 508 + defLines.length * 48 + 40
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

function renderQuote(blocks: SlideBlock[], t: typeof THEMES['dark-navy']): string {
  const b = blocks.find(b => b.type === 'quote')
  if (!b) return ''
  const lines = wrap(esc(b.quote || ''), 58)
  let svg = `<text x="96" y="430" font-family="Georgia,serif" font-size="90" fill="${t.accent}" opacity="0.3">"</text>`
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
    svg += `<text x="120" y="${500 + i * 80}" font-family="Georgia,serif" font-size="56" fill="${t.title}" font-style="italic">${lines[i]}</text>`
  }
  if (b.attribution) {
    svg += `<text x="120" y="${500 + Math.min(lines.length, 3) * 80 + 50}" font-family="Arial,sans-serif" font-size="28" fill="${t.accent}">— ${esc(b.attribution)}</text>`
  }
  return svg
}

function renderSplit(blocks: SlideBlock[], t: typeof THEMES['dark-navy']): string {
  const b = blocks.find(b => b.type === 'two-column' || b.type === 'split' as any)
  const left = b?.left || blocks.find(x => x.type === 'bullets')?.items?.slice(0, 3) || []
  const right = b?.right || blocks.find(x => x.type === 'bullets')?.items?.slice(3, 6) || []
  let svg = `<rect x="96" y="380" width="730" height="580" rx="16" fill="${t.accentLight}" opacity="0.5"/>
  <rect x="870" y="380" width="730" height="580" rx="16" fill="${t.accentLight}" opacity="0.3"/>
  <text x="200" y="430" font-family="Arial,sans-serif" font-size="24" fill="${t.accent}" font-weight="600" letter-spacing="3">CONCEPT</text>
  <text x="974" y="430" font-family="Arial,sans-serif" font-size="24" fill="${t.accent}" font-weight="600" letter-spacing="3">EXAMPLES</text>`

  let ly = 470
  for (const item of left.slice(0, 4)) {
    const lines = wrap(esc(item.text), 32)
    svg += `<circle cx="124" cy="${ly - 8}" r="5" fill="${t.accent}"/>`
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="148" y="${ly + i * 38}" font-family="Arial,sans-serif" font-size="28" fill="${t.body}">${lines[i]}</text>`
    }
    ly += lines.length > 1 ? 100 : 68
  }

  let ry = 470
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

function renderSummary(blocks: SlideBlock[], t: typeof THEMES['dark-navy']): string {
  const items = blocks.find(b => b.type === 'summary' || b.type === 'bullets')?.items || []
  let svg = ''; let y = 420
  for (const item of items.slice(0, 5)) {
    const lines = wrap(esc(item.text), 60)
    // Checkmark icon
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

// ─── Main slide builder ───────────────────────────────────────────────────────

function buildSlide(slide: SlideContent, moduleTitle: string, sceneIndex: number): string {
  const W = 1920, H = 1080
  const t = THEMES[slide.theme || 'dark-navy'] || THEMES['dark-navy']
  const layout = slide.layout || 'bullets'
  const isLight = slide.theme === 'light'
  const accentArr = ['#3B82F6','#6366F1','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4']
  const moduleAccent = accentArr[sceneIndex % accentArr.length]

  // Title area
  const titleY = layout === 'title-hero' ? 440 : 190
  const titleFontSize = layout === 'title-hero' ? 84 : 68
  const titleText = esc((slide.title || '').slice(0, 60))
  const subtitleText = esc((slide.subtitle || '').slice(0, 80))

  // Content area
  let contentSvg = ''
  const blocks = slide.blocks || []
  const contentY = slide.subtitle ? 390 : 360

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
    default: // bullets
      contentSvg = renderBullets(blocks, t, contentY)
  }

  const dividerY = layout === 'title-hero' ? 0 : (slide.subtitle ? 350 : 320)

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

${layout !== 'title-hero' ? `
<!-- Module label -->
<rect x="72" y="32" width="12" height="80" rx="6" fill="${moduleAccent}" opacity="0.7"/>
<text x="100" y="78" font-family="Arial,sans-serif" font-size="22" fill="${t.accent}"
  font-weight="600" letter-spacing="3">${esc(moduleTitle.toUpperCase().slice(0, 40))}</text>

<!-- Main title -->
<text x="100" y="${titleY}" font-family="Arial,sans-serif" font-size="${titleFontSize}"
  fill="${t.title}" font-weight="700" letter-spacing="-1">${titleText}</text>
${subtitleText ? `<text x="100" y="${titleY + 72}" font-family="Arial,sans-serif" font-size="34"
  fill="${t.accent}" font-weight="500" opacity="0.9">${subtitleText}</text>` : ''}
<rect x="100" y="${dividerY}" width="820" height="2" fill="${t.accent}" opacity="0.4" rx="1"/>
` : `
<!-- Hero: module label centered at top -->
<text x="960" y="100" font-family="Arial,sans-serif" font-size="22" fill="${t.accent}"
  font-weight="600" letter-spacing="4" text-anchor="middle">${esc(moduleTitle.toUpperCase().slice(0, 40))}</text>
<rect x="360" y="120" width="1200" height="1" fill="${t.accent}" opacity="0.3" rx="1"/>
`}

<!-- Content -->
${contentSvg}

<!-- Scene badge -->
<rect x="72" y="${H - 78}" width="150" height="42" rx="21" fill="${t.accentLight}"/>
<rect x="72" y="${H - 78}" width="150" height="42" rx="21" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<text x="147" y="${H - 49}" font-family="Arial,sans-serif" font-size="20" fill="${t.accent}"
  font-weight="700" text-anchor="middle">Scene ${sceneIndex + 1}</text>

<!-- Layout badge -->
<text x="240" y="${H - 49}" font-family="Arial,sans-serif" font-size="16" fill="${t.muted}"
  font-weight="500" letter-spacing="1">${layout.toUpperCase()}</text>

<!-- Branding -->
<text x="100" y="${H - 24}" font-family="Arial,sans-serif" font-size="18" fill="${t.muted}"
  letter-spacing="2" font-weight="600">PROFAI STUDIO</text>

<!-- Decorative circles -->
<circle cx="1780" cy="180" r="280" fill="${t.accent}" opacity="0.04"/>
<circle cx="1820" cy="920" r="180" fill="${t.accent}" opacity="0.05"/>
</svg>`
}

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
    const svg = buildSlide(slideContent, moduleTitle, sceneIndex)
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
