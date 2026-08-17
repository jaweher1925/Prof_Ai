/**
 * Resets every scene that's stuck waiting on a HeyGen job — clears the
 * `heygen:<id>` pending sentinel back to null so the scene shows as
 * not-yet-generated, and deletes the leftover sidecar files
 * (heygen_pending_*.json / heygen_group_*.json / heygen_module_*.json) so
 * nothing tries to resume or finalize a job that's being abandoned.
 *
 * This does NOT cancel the job on HeyGen's side (HeyGen has no cancel
 * endpoint in v3 — the render will finish or fail on their servers
 * regardless) — it just makes the app forget about it so you can start
 * fresh and generate that scene again one at a time.
 *
 * Usage (from the api/ folder):
 *   node scripts/resetStuckHeyGenJobs.js            # reset every project
 *   node scripts/resetStuckHeyGenJobs.js <projectId> # just one project
 */
const { PrismaClient } = require('@prisma/client')
const { readdirSync, unlinkSync, existsSync } = require('fs')
const { join } = require('path')

const prisma = new PrismaClient()
const UPLOAD_DIR = join(__dirname, '..', 'uploads')

async function main() {
  const projectId = process.argv[2] || null

  const where = {
    avatarVideoUrl: { startsWith: 'heygen:' },
    ...(projectId ? { module: { projectId } } : {}),
  }

  const stuck = await prisma.scene.findMany({
    where,
    select: { id: true, avatarVideoUrl: true, moduleId: true },
  })

  if (!stuck.length) {
    console.log('No scenes are stuck on a pending HeyGen job — nothing to reset.')
    return
  }

  console.log(`Found ${stuck.length} scene(s) stuck on a pending job:`)
  stuck.forEach((s) => console.log(`  - scene ${s.id} (job ${s.avatarVideoUrl.replace('heygen:', '')})`))

  await prisma.scene.updateMany({
    where: { id: { in: stuck.map((s) => s.id) } },
    data: { avatarVideoUrl: null, status: 'assets_ready' },
  })
  console.log(`Reset ${stuck.length} scene(s) — they'll show as not-yet-generated now.`)

  // Clean up sidecar files so pollHeyGenVideo/heygenWebhook never tries to
  // finalize a job we just told the DB to forget about.
  if (!existsSync(UPLOAD_DIR)) return
  const jobIds = new Set(stuck.map((s) => s.avatarVideoUrl.replace('heygen:', '')))
  let cleaned = 0
  for (const file of readdirSync(UPLOAD_DIR)) {
    if (!/^heygen_(pending|group|module)_/.test(file)) continue
    // pending_<videoId>.json names the job directly; group/module sidecars
    // are keyed by sceneId/moduleId instead — clean those up too if they
    // belong to one of the scenes/modules we just reset.
    const matchesJobId = [...jobIds].some((id) => file.includes(id))
    const matchesScene = stuck.some((s) => file.includes(s.id) || file.includes(s.moduleId))
    if (matchesJobId || matchesScene) {
      try { unlinkSync(join(UPLOAD_DIR, file)); cleaned++ } catch { /* best-effort */ }
    }
  }
  console.log(`Cleaned up ${cleaned} leftover sidecar file(s).`)
  console.log('Done — reopen the module in the app and generate scenes one at a time.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
