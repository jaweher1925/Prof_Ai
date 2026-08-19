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
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs'
import { InvocationContext } from '@azure/functions'
import { prisma } from './db'
import {
  compositeAvatarOverlay, overlayAvatarOnVideo, localPathFromUploadUrl, concatenateVideos,
  renderSegmentsToVideo, extractAvatarPosition, extractAudioTrack, trimVideo, type RenderableSegment,
} from './ffmpegVideo'
import { downloadToUploads, getVideoStatusV3, startAvatarClipJob, resolveAvatarBackgroundColor } from './heygenAvatar'
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

/** Once every segment of a multi-part scene has its own persisted avatar
 *  clip (see the `segmentId` branch in finalizeHeyGenJob below), stitch them
 *  together in orderIndex order into the scene's real Scene.avatarVideoUrl —
 *  same concat used everywhere else in this file. No-ops (returns null) if
 *  any sibling segment hasn't rendered yet — safe to call after every single
 *  segment completion, it just does nothing until the last one lands. This
 *  is what replaces the old parallel "render every segment as one big
 *  all-at-once job" behavior: segments are now rendered one at a time, by
 *  hand, and stitching only happens once ALL of them are individually done. */
export async function stitchSceneFromSegments(
  sceneId: string,
  context: InvocationContext
): Promise<{ videoUrl: string; avatarWarning?: string } | null> {
  const scene = await prisma.scene.findUnique({ where: { id: sceneId } })
  if (!scene) return null
  const segments = await prisma.sceneSegment.findMany({
    where: { sceneId },
    orderBy: { orderIndex: 'asc' },
  })
  if (!segments.length || segments.some((s) => !s.avatarVideoUrl)) return null // not every part has rendered yet

  const clipPaths = segments
    .map((s) => localPathFromUploadUrl(s.avatarVideoUrl as string))
    .filter((p): p is string => !!p)
  if (!clipPaths.length) return null

  let finalUrl: string
  try {
    if (clipPaths.length === 1) {
      finalUrl = `/api/uploads/${parse(clipPaths[0]).base}`
    } else {
      const finalPath = await concatenateVideos(clipPaths)
      finalUrl = `/api/uploads/${parse(finalPath).base}`
    }
  } catch (e: any) {
    context.warn(`[heygenFinalize] scene ${sceneId}: failed to stitch ${clipPaths.length} rendered segments together — ${e?.message}`)
    return null // leave the scene as still-rendering rather than half-stitched
  }

  const oldUrl = scene.avatarVideoUrl && !scene.avatarVideoUrl.startsWith('heygen:') ? scene.avatarVideoUrl : null
  await prisma.scene.update({
    where: { id: sceneId },
    data: { avatarVideoUrl: finalUrl, status: 'completed' },
  })
  deleteOldUpload(oldUrl, finalUrl)
  context.log(`[heygenFinalize] scene ${sceneId}: all ${segments.length} segment(s) individually rendered — stitched into ${finalUrl}`)
  return { videoUrl: finalUrl }
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
        // See generateHeyGenAvatar.ts's sidecar write — the project's raw
        // Avatar Background JSON, resolved back into a padding color below
        // for overlayAvatarOnVideo's headroom-margin fix.
        avatarBackground?: string | null
        // See generateHeyGenAvatar.ts's sidecar write — which HeyGen engine
        // actually rendered this clip (cost-relevant: avatar_iv is ~2-4x
        // pricier than avatar_iii per HeyGen's pricing docs).
        engineUsed?: 'avatar_iii' | 'avatar_iv'
        // Present when this job rendered ONE segment of a multi-part scene
        // (per-segment click in FinalVideoPanel/VisualDesignerPanel) rather
        // than the whole scene. When set, the composited clip is persisted
        // to THIS segment's own SceneSegment.avatarVideoUrl instead of
        // Scene.avatarVideoUrl — then every sibling segment is checked, and
        // once ALL of them have their own clip, they're stitched together
        // into the scene's real avatarVideoUrl (see stitchSceneFromSegments
        // below). This replaces the old "preview never persists" behavior —
        // a per-segment render is now a real, saved render, not throwaway.
        segmentId?: string
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
          const finalPath = await overlayAvatarOnVideo(basePath, avatarPath, meta.avatarPosition, meta.chromaKey, resolveAvatarBackgroundColor(meta.avatarBackground))
          finalUrl = `/api/uploads/${parse(finalPath).base}`
          context.log(`[heygenFinalize] scene ${meta.sceneId}: async avatar composited onto slide video after ${elapsedMin}min`)
        } catch (e: any) {
          context.warn(`[heygenFinalize] scene ${meta.sceneId}: overlay failed, keeping slide-only video — ${e?.message}`)
          avatarWarning = `Speaking avatar rendering failed (${e?.message || 'unknown error'}) — rendered voice-only.`
        }
      } else {
        avatarWarning = 'Could not locate the rendered slide video to overlay the avatar onto — rendered voice-only.'
      }

      // Surface the cost-relevant engine fallback even when the composite
      // itself succeeded — the render still cost 2-4x more than expected,
      // and the only other place this was visible was a server log line.
      if (meta.engineUsed === 'avatar_iv') {
        const bump = 'This scene rendered on HeyGen\'s Avatar IV engine instead of the cheaper Avatar III (the selected avatar doesn\'t support Avatar III) — costs roughly 2-4x more per second on this clip.'
        avatarWarning = avatarWarning ? `${avatarWarning} ${bump}` : bump
      }

      // A single SEGMENT's render — persist onto that segment's own row, then
      // check whether the whole scene is now fully rendered.
      if (meta.segmentId) {
        await prisma.sceneSegment.update({
          where: { id: meta.segmentId },
          data: { avatarVideoUrl: finalUrl },
        })
        // Scene.avatarEngineUsed (2026-08-19 fix — admin dashboard showing
        // "10 scenes rendered, $0.00 spend, 0 on either engine"). This whole
        // branch (per-segment renders — every multi-part scene: quizzes,
        // welcome scenes) never wrote this field at all; only the OTHER
        // branch below (single-part, whole-scene renders) did. That's a real
        // cost-tracking gap, not just a cosmetic one — a project built
        // entirely from multi-part scenes would show $0 estimated spend
        // forever, no matter how much was actually billed by HeyGen. One
        // field on the Scene (not per-segment) is enough since every part of
        // a scene renders through the same project avatar/voice, so they're
        // always the same engine in practice.
        if (meta.sceneId && meta.engineUsed) {
          await prisma.scene.update({
            where: { id: meta.sceneId },
            data: { avatarEngineUsed: meta.engineUsed },
          }).catch(() => { /* best-effort — don't fail the real render over a stats field */ })
        }
        try { unlinkSync(sidecarPath) } catch { /* best-effort cleanup */ }

        const stitched = meta.sceneId ? await stitchSceneFromSegments(meta.sceneId, context) : null
        return {
          outcome: 'completed',
          sceneId: meta.sceneId,
          videoUrl: finalUrl, // this segment's own clip — what the caller (e.g. VisualDesignerPanel) is polling for
          thumbnailUrl: opts.thumbnailUrl ?? null,
          singlePart: true,
          avatarWarning: stitched?.avatarWarning || avatarWarning,
        }
      }

      // Normal whole-scene render.
      if (!meta.preview && meta.sceneId) {
        await prisma.scene.update({
          where: { id: meta.sceneId },
          data: {
            avatarVideoUrl: finalUrl,
            status: 'completed',
            ...(meta.engineUsed ? { avatarEngineUsed: meta.engineUsed } : {}),
          },
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

// ─────────────────────────────────────────────────────────────────────────────
// GROUPED SEGMENT JOBS (#44) — a multi-part scene's segments each get their
// OWN HeyGen job (see generateHeyGenAvatar.ts's startGroupedSegmentRender)
// instead of one combined job. This tracks the group sidecar
// (heygen_group_<sceneId>.json) and is polled once per tick from
// pollHeyGenVideo.ts whenever the video_id being polled belongs to a group —
// it checks EVERY still-pending segment's HeyGen status (not just the one
// video_id the frontend happens to be watching), composites any that just
// finished, and only stitches + persists Scene.avatarVideoUrl once every
// segment has landed.
// ─────────────────────────────────────────────────────────────────────────────

const groupFinalizing = new Set<string>()

type GroupSegmentEntry =
  | { index: number; done: true; clipPath: string | null; warning?: string }
  | {
      index: number; done: false; videoId: string; cachePath: string
      segmentClipPath: string; avatarPosition: { x: number; y: number; width: number } | null; chromaKey: boolean
    }
  // Not yet rendered or submitted to HeyGen at all — carries everything
  // needed to do that later (see renderAndSubmitSegment below), a few
  // segments at a time, from inside pollSegmentGroup's own tick instead of
  // all-at-once inside the original HTTP request (see generateHeyGenAvatar.ts
  // startGroupedSegmentRender's comment for why that was the actual bug
  // behind "first scene takes 4+ min and isn't even done yet").
  | { index: number; done: false; videoId: null; segment: RenderableSegment; attempts?: number }

type GroupFile = {
  sceneId: string; moduleId: string; oldAvatarVideoUrl: string | null; createdAt: number
  moduleTitle: string | null
  avatarCasting: { defaultAvatarId: string; avatarStyle?: string | null; avatarBackground?: string | null }
  segments: GroupSegmentEntry[]
}

/** Render one segment's slide+audio clip and submit its own HeyGen job (or
 *  composite immediately on a cache hit). Pulled out of
 *  generateHeyGenAvatar.ts so both the initial request AND every later poll
 *  tick (pollSegmentGroup, below) can call the exact same logic — the
 *  initial request no longer does this itself, so it returns fast. */
export async function renderAndSubmitSegment(
  segment: RenderableSegment,
  moduleTitle: string | null | undefined,
  avatarCasting: { defaultAvatarId: string; avatarStyle?: string | null; avatarBackground?: string | null },
  sceneId: string
): Promise<
  | { done: true; clipPath: string }
  | { done: false; videoId: string; cachePath: string; segmentClipPath: string; avatarPosition: { x: number; y: number; width: number } | null; chromaKey: boolean }
> {
  const segmentClipUrl = await renderSegmentsToVideo({ segments: [segment], moduleTitle })
  const segmentClipPath = localPathFromUploadUrl(segmentClipUrl)
  if (!segmentClipPath) throw new Error(`Segment ${segment.id}: rendered clip not found locally`)
  const avatarPosition = extractAvatarPosition(segment.slideDesign)

  let audioPaths: string[]
  try {
    audioPaths = [await extractAudioTrack(segmentClipPath)]
  } catch {
    const raw = localPathFromUploadUrl(segment.ttsAudioUrl)
    audioPaths = raw ? [raw] : []
  }
  if (!audioPaths.length) return { done: true, clipPath: segmentClipPath }

  const job = await startAvatarClipJob({
    audioPaths,
    avatarId: avatarCasting.defaultAvatarId,
    avatarStyle: avatarCasting.avatarStyle,
    avatarBackground: avatarCasting.avatarBackground,
    cacheKeyFiles: [localPathFromUploadUrl(segment.ttsAudioUrl)].filter((p): p is string => !!p),
    callbackId: `${sceneId}:${segment.id}`,
  })

  if (job.cached) {
    const composited = await overlayAvatarOnVideo(segmentClipPath, job.avatarPath, avatarPosition, job.chromaKey, resolveAvatarBackgroundColor(avatarCasting.avatarBackground))
    return { done: true, clipPath: composited }
  }
  return { done: false, videoId: job.videoId, cachePath: job.cachePath, segmentClipPath, avatarPosition, chromaKey: job.chromaKey }
}

export async function pollSegmentGroup(
  sceneId: string,
  context: InvocationContext
): Promise<
  | { outcome: 'completed'; videoUrl: string; avatarWarning?: string }
  | { outcome: 'processing' }
  | { outcome: 'not_found' }
> {
  const groupPath = join(UPLOAD_DIR, `heygen_group_${sceneId}.json`)
  if (!existsSync(groupPath)) return { outcome: 'not_found' }
  // Same race guard as `finalizing` above, scoped per-scene — two poll
  // requests landing close together must not both try to composite/stitch.
  if (groupFinalizing.has(sceneId)) return { outcome: 'processing' }
  groupFinalizing.add(sceneId)
  try {
    const group = JSON.parse(readFileSync(groupPath, 'utf8')) as GroupFile
    const warnings: string[] = []
    let changed = false

    // Bound how much LOCAL render + HeyGen-submit work happens on a single
    // poll tick (each one is a real ffmpeg render + a HeyGen upload) so one
    // HTTP request never blocks for the whole scene — the rest just get
    // picked up on the next tick, ~5s later from the frontend.
    const NOT_SUBMITTED_PER_TICK = 2
    let submittedThisTick = 0

    for (const seg of group.segments) {
      if (seg.done) { if (seg.warning) warnings.push(seg.warning); continue }

      if (seg.videoId === null) {
        if (submittedThisTick >= NOT_SUBMITTED_PER_TICK) continue // next tick
        submittedThisTick++
        try {
          const result = await renderAndSubmitSegment(seg.segment, group.moduleTitle, group.avatarCasting, group.sceneId)
          if (result.done) {
            Object.assign(seg, { done: true, clipPath: result.clipPath })
          } else {
            Object.assign(seg, {
              done: false, videoId: result.videoId, cachePath: result.cachePath,
              segmentClipPath: result.segmentClipPath, avatarPosition: result.avatarPosition, chromaKey: result.chromaKey,
            })
            writeFileSync(
              join(UPLOAD_DIR, `heygen_pending_${result.videoId}.json`),
              JSON.stringify({ groupSceneId: sceneId, sceneId, createdAt: Date.now() })
            )
          }
        } catch (e: any) {
          const attempts = ((seg as any).attempts || 0) + 1
          if (attempts >= 3) {
            const warning = `Could not render part ${seg.index + 1} after ${attempts} attempts (${e?.message || 'unknown error'}) — that part was skipped.`
            Object.assign(seg, { done: true, clipPath: null, warning })
            warnings.push(warning)
            context.warn(`[heygenFinalize] group ${sceneId}: segment ${seg.index} permanently failed after ${attempts} attempts: ${e?.message}`)
          } else {
            Object.assign(seg, { attempts })
            context.warn(`[heygenFinalize] group ${sceneId}: segment ${seg.index} render/submit attempt ${attempts} failed, retrying next tick: ${e?.message}`)
          }
        }
        changed = true
        continue
      }

      let status: string, videoUrl: string | null | undefined, failureMessage: string | null | undefined
      try {
        const r = await getVideoStatusV3(seg.videoId)
        status = r.status; videoUrl = r.videoUrl; failureMessage = r.failureMessage
      } catch (e: any) {
        // A transient status-check failure shouldn't blow up the whole poll
        // tick — just leave this segment pending and try again next tick.
        context.warn(`[heygenFinalize] group ${sceneId}: status check failed for segment job ${seg.videoId}: ${e?.message}`)
        continue
      }

      if (status === 'completed' && videoUrl) {
        try {
          const avatarPath = await downloadToUploads(videoUrl)
          try { copyFileSync(avatarPath, seg.cachePath) } catch { /* cache is best-effort */ }
          const composited = await overlayAvatarOnVideo(seg.segmentClipPath, avatarPath, seg.avatarPosition, seg.chromaKey, resolveAvatarBackgroundColor(group.avatarCasting.avatarBackground))
          const finished: GroupSegmentEntry = { index: seg.index, done: true, clipPath: composited }
          Object.assign(seg, finished)
        } catch (e: any) {
          // Compositing failed for this ONE part — fall back to its
          // slide-only clip rather than blocking the whole scene on it.
          const warning = `Speaking avatar rendering failed for one part (${e?.message || 'unknown error'}) — that part is voice-only.`
          const finished: GroupSegmentEntry = { index: seg.index, done: true, clipPath: seg.segmentClipPath, warning }
          Object.assign(seg, finished)
          warnings.push(warning)
        }
        try { unlinkSync(join(UPLOAD_DIR, `heygen_pending_${seg.videoId}.json`)) } catch { /* best-effort */ }
        changed = true
      } else if (status === 'failed') {
        const warning = `HeyGen could not render one part (${failureMessage || 'unknown error'}) — that part is voice-only.`
        const finished: GroupSegmentEntry = { index: seg.index, done: true, clipPath: seg.segmentClipPath, warning }
        Object.assign(seg, finished)
        warnings.push(warning)
        try { unlinkSync(join(UPLOAD_DIR, `heygen_pending_${seg.videoId}.json`)) } catch { /* best-effort */ }
        changed = true
      }
      // else still pending/processing — leave as-is, checked again next tick.
    }

    const stillPending = group.segments.some(s => !s.done)
    if (stillPending) {
      if (changed) writeFileSync(groupPath, JSON.stringify(group))
      return { outcome: 'processing' }
    }

    // Every segment has landed — stitch them together in original order
    // (same crossfade join used for the old combined-audio path) and persist.
    // A segment that permanently failed to render (see the retry/attempts
    // handling above) has clipPath:null — skip it rather than fail the whole
    // scene over one unlucky part.
    const ordered = [...group.segments].sort((a, b) => a.index - b.index)
    const clipPaths = ordered
      .map(s => (s as Extract<GroupSegmentEntry, { done: true }>).clipPath)
      .filter((p): p is string => !!p)
    if (!clipPaths.length) throw new Error('Every segment in this scene failed to render — nothing to stitch together.')
    const finalPath = await concatenateVideos(clipPaths)
    const finalUrl = `/api/uploads/${parse(finalPath).base}`

    await prisma.scene.update({
      where: { id: group.sceneId },
      data: { avatarVideoUrl: finalUrl, status: 'completed' },
    })
    deleteOldUpload(group.oldAvatarVideoUrl, finalUrl)
    try { unlinkSync(groupPath) } catch { /* best-effort */ }
    context.log(`[heygenFinalize] group ${sceneId}: all ${group.segments.length} segment job(s) landed, stitched into ${finalUrl}`)

    return { outcome: 'completed', videoUrl: finalUrl, avatarWarning: warnings[0] }
  } finally {
    groupFinalizing.delete(sceneId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL BATCHED JOBS (#46) — built at the user's explicit request after
// per-scene jobs (even non-blocking/progressive, above) were still too slow
// for a whole module: N scenes = N separate fixed per-job overheads at
// HeyGen. generateModuleAvatarBatch.ts renders every not-yet-done scene's own
// slide+voice video locally (fast, unchanged from the normal path), then
// concatenates ALL of their narration into ONE audio track and submits
// exactly ONE HeyGen job for the whole batch — tracked via a
// `heygen_modulebatch_<moduleId>.json` sidecar carrying each scene's [start,
// end] offset in that combined timeline. This is polled here: once the ONE
// job completes, the single returned avatar clip is downloaded ONCE, split
// back into each scene's own piece with trimVideo(), and composited onto
// that scene's own slide video exactly like the per-scene path does.
//
// Trade-off (agreed with the user before building this): unlike the grouped
// per-segment jobs above, this is all-or-nothing — every scene in the batch
// finishes together when the one job lands, not incrementally. Regenerating
// ONE scene by itself still goes through the original per-scene endpoint,
// untouched by any of this.
// ─────────────────────────────────────────────────────────────────────────────

const moduleBatchFinalizing = new Set<string>()

type ModuleBatchSceneEntry = {
  sceneId: string
  start: number
  end: number
  slideVideoUrl: string
  avatarPosition: { x: number; y: number; width: number } | null
  oldAvatarVideoUrl: string | null
}

type ModuleBatchFile = {
  moduleId: string
  videoId: string
  cachePath?: string | null
  chromaKey: boolean
  // The project's raw Avatar Background JSON — see resolveAvatarBackgroundColor.
  avatarBackground?: string | null
  createdAt: number
  scenes: ModuleBatchSceneEntry[]
}

export async function pollModuleBatch(
  moduleId: string,
  context: InvocationContext
): Promise<
  | { outcome: 'completed'; sceneCount: number }
  | { outcome: 'processing' }
  | { outcome: 'failed'; error?: string }
  | { outcome: 'not_found' }
> {
  const batchPath = join(UPLOAD_DIR, `heygen_modulebatch_${moduleId}.json`)
  if (!existsSync(batchPath)) return { outcome: 'not_found' }
  if (moduleBatchFinalizing.has(moduleId)) return { outcome: 'processing' }
  moduleBatchFinalizing.add(moduleId)
  try {
    const batch = JSON.parse(readFileSync(batchPath, 'utf8')) as ModuleBatchFile

    let status: string, videoUrl: string | null | undefined, failureMessage: string | null | undefined
    try {
      const r = await getVideoStatusV3(batch.videoId)
      status = r.status; videoUrl = r.videoUrl; failureMessage = r.failureMessage
    } catch (e: any) {
      context.warn(`[heygenFinalize] module batch ${moduleId}: status check failed for job ${batch.videoId}: ${e?.message}`)
      return { outcome: 'processing' }
    }

    if (status === 'failed') {
      context.warn(`[heygenFinalize] module batch ${moduleId} failed${failureMessage ? `: ${failureMessage}` : ''}`)
      await prisma.scene.updateMany({ where: { id: { in: batch.scenes.map((s) => s.sceneId) } }, data: { status: 'assets_ready' } })
      try { unlinkSync(batchPath) } catch { /* best-effort */ }
      try { unlinkSync(join(UPLOAD_DIR, `heygen_pending_${batch.videoId}.json`)) } catch { /* best-effort */ }
      return { outcome: 'failed', error: failureMessage || undefined }
    }
    if (status !== 'completed' || !videoUrl) return { outcome: 'processing' }

    const avatarPath = await downloadToUploads(videoUrl)
    if (batch.cachePath) {
      try { copyFileSync(avatarPath, batch.cachePath) } catch { /* cache is best-effort */ }
    }

    // Split the ONE combined clip back into each scene's own slice and
    // composite it onto that scene's own slide video — one scene failing to
    // split/composite falls back to its slide-only video instead of losing
    // every OTHER scene in the batch too.
    let doneSoFar = 0
    for (const entry of batch.scenes) {
      try {
        const clipPath = await trimVideo(avatarPath, entry.start, entry.end)
        const basePath = localPathFromUploadUrl(entry.slideVideoUrl)
        if (!basePath) throw new Error('rendered slide video not found locally')
        const composited = await overlayAvatarOnVideo(basePath, clipPath, entry.avatarPosition, batch.chromaKey, resolveAvatarBackgroundColor(batch.avatarBackground))
        const finalUrl = `/api/uploads/${parse(composited).base}`
        await prisma.scene.update({ where: { id: entry.sceneId }, data: { avatarVideoUrl: finalUrl, status: 'completed' } })
        deleteOldUpload(entry.oldAvatarVideoUrl, finalUrl)
        doneSoFar++
        // Per-scene marker (was previously only visible in the AGGREGATE log
        // line after every scene finished) — search backend logs for "scene
        // <id>" or just this module's id to watch each one land, since the
        // UI's own grid can't show incremental progress for a batched job
        // (see generateBatch's docs in FinalVideoPanel.jsx for why).
        context.log(`[heygenFinalize] module batch ${moduleId}: scene ${entry.sceneId} composited (${doneSoFar}/${batch.scenes.length}) → ${finalUrl}`)
      } catch (e: any) {
        doneSoFar++
        context.warn(`[heygenFinalize] module batch ${moduleId}: scene ${entry.sceneId} split/composite failed (${doneSoFar}/${batch.scenes.length}), using its slide-only video instead: ${e?.message}`)
        await prisma.scene.update({ where: { id: entry.sceneId }, data: { avatarVideoUrl: entry.slideVideoUrl, status: 'completed' } })
      }
    }

    try { unlinkSync(batchPath) } catch { /* best-effort */ }
    try { unlinkSync(join(UPLOAD_DIR, `heygen_pending_${batch.videoId}.json`)) } catch { /* best-effort */ }
    context.log(`[heygenFinalize] module batch ${moduleId}: all ${batch.scenes.length} scene(s) split + composited from one HeyGen job (${batch.videoId})`)
    return { outcome: 'completed', sceneCount: batch.scenes.length }
  } finally {
    moduleBatchFinalizing.delete(moduleId)
  }
}
