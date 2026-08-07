/**
 * Shared HeyGen job-completion logic (added during the v3 + webhook migration,
 * 2026-08-04).
 *
 * Previously this logic lived only inline in pollHeyGenVideo.ts. heygenWebhook.ts
 * had its OWN separate (and incomplete — it never composited the avatar onto the
 * slide, never wrote the local cache, never cleaned up the sidecar) copy. That
 * meant a webhook delivery would silently save the raw HeyGen clip as the scene's
 * video instead of the slide+avatar composite the rest of the pipeline expects.
 *
 * Both pollHeyGenVideo.ts (caller already knows status from its own GET) and
 * heygenWebhook.ts (status comes from the webhook event) now call
 * finalizeHeyGenJob() so there is exactly one place that downloads, composites,
 * caches, and updates the DB — poll and webhook can never disagree about what
 * "done" means again.
 */
import { join, parse } from 'path'
import { existsSync, readFileSync, copyFileSync, unlinkSync } from 'fs'
import { InvocationContext } from '@azure/functions'
import { prisma } from './db'
import { compositeAvatarOverlay, overlayAvatarOnVideo, localPathFromUploadUrl } from './ffmpegVideo'
import { downloadToUploads } from './heygenAvatar'
import { deleteOldUpload } from './uploadCleanup'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

// Guards against two finalizers (the poll loop AND a webhook delivery arriving
// around the same time) compositing + writing the same completed video twice.
// Shared at module scope so BOTH pollHeyGenVideo.ts and heygenWebhook.ts guard
// against each other — previously each file had its own private Set, so a
// poll and a webhook landing in the same process could still race.
const finalizing = new Set<string>()

type FinalizeResult = {
  outcome: 'completed' | 'failed' | 'processing' | 'not_found'
  sceneId?: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  singlePart?: boolean
  avatarWarning?: string
}

export async function finalizeHeyGenJob(opts: {
  videoId: string
  status: string // 'completed' | 'failed' | anything else = still processing
  videoUrl?: string | null
  thumbnailUrl?: string | null
  failureMessage?: string | null
  context: InvocationContext
}): Promise<FinalizeResult> {
  const { videoId, status, context } = opts
  const sidecarPath = join(UPLOAD_DIR, `heygen_pending_${videoId}.json`)

  // ── Failed ────────────────────────────────────────────────────────────
  if (status === 'failed') {
    let sceneId: string | undefined
    if (existsSync(sidecarPath)) {
      try {
        const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as { sceneId?: string; preview?: boolean }
        sceneId = meta.sceneId
        if (sceneId && !meta.preview) {
          await prisma.scene.update({ where: { id: sceneId }, data: { status: 'assets_ready' } }) // reset so user can retry
        }
      } catch { /* ignore malformed sidecar */ }
      try { unlinkSync(sidecarPath) } catch { /* best-effort cleanup */ }
    } else {
      const scene = await prisma.scene.findFirst({ where: { avatarVideoUrl: `heygen:${videoId}` } })
      if (scene) {
        sceneId = scene.id
        await prisma.scene.update({ where: { id: scene.id }, data: { status: 'assets_ready' } })
      }
    }
    context.warn(`[heygenFinalize] job ${videoId} failed${opts.failureMessage ? `: ${opts.failureMessage}` : ''}`)
    return { outcome: 'failed', sceneId }
  }

  // ── Not done yet ──────────────────────────────────────────────────────
  if (status !== 'completed' || !opts.videoUrl) {
    return { outcome: 'processing' }
  }
  const videoUrl = opts.videoUrl

  if (finalizing.has(videoId)) {
    return { outcome: 'processing' }
  }
  finalizing.add(videoId)

  try {
    // ── Async job path (sidecar written by generateHeyGenAvatar.ts) ───────
    if (existsSync(sidecarPath)) {
      const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
        slideVideoUrl: string; cachePath?: string; createdAt?: number
        avatarPosition?: { x: number; y: number; width: number } | null
        preview?: boolean
        sceneId?: string
        // The scene's avatarVideoUrl from BEFORE this regenerate was queued
        // (generateHeyGenAvatar.ts overwrote it with the `heygen:<id>`
        // sentinel the moment the job was submitted, so this sidecar is the
        // only place that URL still exists). Deleted below only once the new
        // composite has actually landed — never eagerly — so a job that ends
        // up failing doesn't leave the scene with no video AND no file.
        oldAvatarVideoUrl?: string | null
        // See generateHeyGenAvatar.ts's sidecar write — whether this clip was
        // rendered on the chroma-key green and needs keying out here.
        chromaKey?: boolean
      }

      // Already finalized by the other path (poll vs webhook race) — don't
      // redo the work or overwrite a good composite with a re-derived one.
      if (meta.sceneId && !meta.preview) {
        const existing = await prisma.scene.findUnique({ where: { id: meta.sceneId } })
        if (existing?.avatarVideoUrl && !existing.avatarVideoUrl.startsWith('heygen:')) {
          try { unlinkSync(sidecarPath) } catch { /* best-effort */ }
          return { outcome: 'completed', sceneId: meta.sceneId, videoUrl: existing.avatarVideoUrl }
        }
      }

      const elapsedMin = Math.round((Date.now() - (meta.createdAt || Date.now())) / 60_000)
      const avatarPath = await downloadToUploads(videoUrl)
      if (meta.cachePath) {
        try { copyFileSync(avatarPath, meta.cachePath) } catch { /* cache is best-effort */ }
      }

      let finalUrl = meta.slideVideoUrl // fallback: slide-only video
      let avatarWarning: string | undefined
      const basePath = localPathFromUploadUrl(meta.slideVideoUrl)
      if (basePath) {
        try {
          const finalPath = await overlayAvatarOnVideo(basePath, avatarPath, meta.avatarPosition, meta.chromaKey)
          finalUrl = `/api/uploads/${parse(finalPath).base}`
          context.log(`[heygenFinalize] scene ${meta.sceneId}: async avatar composited onto slide video after ${elapsedMin}min`)
        } catch (e: any) {
          context.warn(`[heygenFinalize] scene ${meta.sceneId}: overlay failed, keeping slide-only video — ${e?.message}`)
          avatarWarning = `Speaking avatar rendering failed (${e?.message || 'unknown error'}) — rendered voice-only.`
        }
      } else {
        avatarWarning = 'Could not locate the rendered slide video to overlay the avatar onto — rendered voice-only.'
      }

      // A single-part Visual Design PREVIEW must NOT be written to Scene.avatarVideoUrl
      // — that field is the full-scene video Video Editing assembles from.
      if (!meta.preview && meta.sceneId) {
        await prisma.scene.update({
          where: { id: meta.sceneId },
          data: { avatarVideoUrl: finalUrl, status: 'completed' },
        })
        // New composite is safely persisted — now it's safe to drop the file
        // the previous regenerate left behind.
        deleteOldUpload(meta.oldAvatarVideoUrl, finalUrl)
      }
      try { unlinkSync(sidecarPath) } catch { /* best-effort cleanup */ }

      return {
        outcome: 'completed',
        sceneId: meta.sceneId,
        videoUrl: finalUrl,
        thumbnailUrl: opts.thumbnailUrl ?? null,
        singlePart: !!meta.preview,
        avatarWarning,
      }
    }

    // ── Legacy path: no sidecar (pre-migration in-flight job, or already
    // cleaned up) — find the scene via the heygen:<id> sentinel and composite
    // from the slide image + TTS audio directly. ─────────────────────────
    const scene = await prisma.scene.findFirst({
      where: { avatarVideoUrl: `heygen:${videoId}` },
      include: { module: { include: { project: true } } },
    })
    if (!scene) return { outcome: 'not_found' }
    if (!scene.avatarVideoUrl?.startsWith('heygen:')) {
      return { outcome: 'completed', sceneId: scene.id, videoUrl: scene.avatarVideoUrl }
    }

    let finalVideoUrl = videoUrl
    let avatarWarning: string | undefined
    if (scene.ttsAudioUrl) {
      try {
        let parsedCues: { text: string; duration_seconds?: number }[] | null = null
        try { parsedCues = scene.textCues ? JSON.parse(scene.textCues) : null } catch { /* no cues */ }

        let avatarLayout: 'original' | 'circle' | null = null
        let avatarRadius: number | null = null
        let avatarBgType: 'color' | 'transparent' | null = null
        let avatarBgColor: string | null = null
        try {
          const bg = scene.module?.project?.avatarBackground ? JSON.parse(scene.module.project.avatarBackground) : null
          if (bg?.layout === 'circle') avatarLayout = 'circle'
          if (typeof bg?.radius === 'number') avatarRadius = bg.radius
          if (bg?.type === 'transparent') avatarBgType = 'transparent'
          else if (bg?.type === 'color' && bg?.value) { avatarBgType = 'color'; avatarBgColor = bg.value }
        } catch { /* malformed JSON — keep defaults */ }

        finalVideoUrl = await compositeAvatarOverlay({
          audioUrl: scene.ttsAudioUrl,
          avatarVideoUrl: videoUrl,
          slideImageUrl: scene.visualAssetUrl,
          textAnimationType: scene.textAnimationType,
          textCues: parsedCues,
          avatarLayout,
          avatarRadius,
          avatarBgType: avatarBgType || 'color',
          avatarBgColor: avatarBgColor || '#1E293B',
        })
        context.log(`[heygenFinalize] scene ${scene.id}: composited avatar onto slide locally (legacy path)`)
      } catch (compositeErr: any) {
        context.warn(`[heygenFinalize] scene ${scene.id}: local avatar composite failed, falling back to raw HeyGen clip — ${compositeErr?.message}`)
        finalVideoUrl = videoUrl
        avatarWarning = `Speaking avatar rendering failed (${compositeErr?.message || 'unknown error'}) — kept the raw avatar clip without the slide merged in.`
      }
    } else {
      context.warn(`[heygenFinalize] scene ${scene.id}: no ttsAudioUrl found, cannot composite — saving raw HeyGen clip`)
      avatarWarning = 'No narration audio was found for this scene, so the avatar could not be composited onto the slide — saved the raw avatar clip instead.'
    }

    await prisma.scene.update({
      where: { id: scene.id },
      data: { avatarVideoUrl: finalVideoUrl, status: 'approved' },
    })
    context.log(`[heygenFinalize] scene ${scene.id} updated with video URL (legacy path)`)
    return { outcome: 'completed', sceneId: scene.id, videoUrl: finalVideoUrl, avatarWarning }
  } finally {
    finalizing.delete(videoId)
  }
}
