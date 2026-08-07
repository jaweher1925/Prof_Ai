/**
 * One-off fix-up for the "some scenes are just a title with no content
 * points" bug: api/src/lib/slideRenderer.ts's renderBullets() used to
 * require level 0 for a "main" bullet, but every bullet the app actually
 * generates is level 1 (see scriptGeneratorAgent.ts / the Visual Designer
 * editor) — so any slide whose PNG was built by the server-side renderer
 * (i.e. never manually opened in Visual Designer, which would have captured
 * a real WYSIWYG snapshot instead) silently rendered title-only.
 *
 * That renderer bug is now fixed, but the ALREADY-GENERATED PNGs sitting in
 * api/uploads/ from before the fix are still the broken title-only images —
 * fixing the code doesn't retroactively repaint them. This script finds
 * every scene segment that (a) has real bullet content saved and (b) never
 * got a WYSIWYG snapshot (no renderedSlideUrl in its slide_design — the
 * telltale sign it went through the buggy path), and re-runs slide
 * generation for each one so it picks up the fix.
 *
 * Usage:
 *   1. Make sure the API is running locally (cd api && npm start) — this
 *      hits it over HTTP just like the app does.
 *   2. In another terminal: cd api && node scripts/regenerate-empty-slides.js
 */
const { PrismaClient } = require('@prisma/client')

const API_BASE = process.env.API_BASE || 'http://localhost:7071'
const prisma = new PrismaClient()

function safeParse(json) {
  try { return JSON.parse(json || '{}') } catch { return {} }
}

async function main() {
  const segments = await prisma.sceneSegment.findMany({
    select: { id: true, sceneId: true, slideDesign: true, slideTitle: true },
  })

  const targets = segments.filter((seg) => {
    const design = safeParse(seg.slideDesign)
    const hasBullets = (design.blocks || []).some(
      (b) => b?.type === 'bullets' && (b.items?.length ?? 0) > 0
    )
    // Already has a real WYSIWYG capture — leave it alone, it's fine.
    const hasSnapshot = !!design.renderedSlideUrl
    return hasBullets && !hasSnapshot
  })

  console.log(`Found ${segments.length} segments, ${targets.length} need regenerating.\n`)

  let ok = 0, fail = 0
  for (const seg of targets) {
    try {
      const res = await fetch(`${API_BASE}/api/generateSceneAsset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: seg.sceneId, segment_id: seg.id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      ok++
      console.log(`✓ ${seg.slideTitle || seg.id}`)
    } catch (err) {
      fail++
      console.error(`✗ ${seg.slideTitle || seg.id} — ${err.message}`)
    }
    // Be gentle — these hit an LLM-adjacent image pipeline in some paths.
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log(`\nDone. ${ok} regenerated, ${fail} failed.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
