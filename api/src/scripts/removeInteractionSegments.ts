/**
 * One-time cleanup (#42): delete all "interaction" segments left over from
 * scripts generated before the 4-step simplification (hook → content →
 * content → recap), and renumber the remaining segments so ordering stays
 * contiguous.
 *
 * Run from api/ after building:
 *   npm run build && node dist/src/scripts/removeInteractionSegments.js
 */
import { prisma } from '../lib/db'

async function main() {
  const doomed = await prisma.sceneSegment.findMany({
    where: { segmentType: 'interaction' },
    select: { id: true, sceneId: true },
  })

  if (!doomed.length) {
    console.log('No interaction segments found — nothing to do.')
    return
  }

  const { count } = await prisma.sceneSegment.deleteMany({
    where: { segmentType: 'interaction' },
  })
  console.log(`Deleted ${count} interaction segment(s).`)

  // Renumber remaining segments per affected scene (0,1,2,…)
  const sceneIds = [...new Set(doomed.map(d => d.sceneId))]
  for (const sceneId of sceneIds) {
    const rest = await prisma.sceneSegment.findMany({
      where: { sceneId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    })
    for (let i = 0; i < rest.length; i++) {
      await prisma.sceneSegment.update({ where: { id: rest[i].id }, data: { orderIndex: i } })
    }
    console.log(`Scene ${sceneId}: renumbered ${rest.length} remaining segments.`)
  }

  console.log('Done. Re-save affected slides in the Visual Designer, then regenerate voice + video.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
