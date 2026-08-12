/**
 * POST /api/generateModuleAvatarBatch
 *
 * Module-level batched avatar rendering (#46, built at the user's explicit
 * request after per-scene jobs — even the non-blocking/progressive version
 * in generateHeyGenAvatar.ts's startGroupedSegmentRender — were still too
 * slow for a whole module: N scenes = N separate fixed per-job HeyGen
 * overheads, each ~1-5min regardless of clip length (see heygenAvatar.ts's
 * startAvatarClipJob docs).
 *
 * This renders every requested scene's own slide+voice video locally first
 * (fast, CPU-only, identical to what the normal per-scene path already
 * does), concatenates ALL of their narration into ONE audio track, and
 * submits exactly ONE HeyGen job for the whole batch — cutting N HeyGen jobs
 * down to 1. heygenFinalize.ts's pollModuleBatch() (routed to from
 * pollHeyGenVideo.ts) downloads the single returned avatar clip once it
 * lands, splits it back into each scene's own [start,end] slice, and
 * composites each slice onto that scene's own slide video.
 *
 * Trade-off (discussed with the user before building this): unlike the
 * per-scene / per-segment paths, this is all-or-nothing — every scene in the
 * batch finishes together when the one job completes, not incrementally.
 * Regenerating a SINGLE scene should still go through generateHeyGenAvatar.ts
 * (unaffected by any of this).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { join, parse } from 'path'
import { writeFileSync } from 'fs'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import {
  renderSegmentsToVideo,
  localPathFromUploadUrl,
  extractAudioTrack,
  extractAvatarPosition,
  concatAudioWithOffsets,
  trimVideo,
  overlayAvatarOnVideo,
  type RenderableSegment,
} from '../../lib/ffmpegVideo'
import { startAvatarClipJob } from '../../lib/heygenAvatar'
import { deleteOldUpload } from '../../lib/uploadCleanup'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

type SceneRender = {
  sceneId: string
  slideVideoUrl: string
  audioPath: string
  avatarPosition: { x: number; y: number; width: number } | null
  oldAvatarVideoUrl: string | null
}

async function generateModuleAvatarBatchHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { module_id?: string; scene_ids?: string[] }
    if (!body.module_id) return { status: 400, jsonBody: { error: 'module_id is required' } }

    const module_ = await prisma.module.findUnique({ where: { id: body.module_id }, include: { project: true } })
    if (!module_) return { status: 404, jsonBody: { error: 'Module not found' } }
    const project = module_.project
    if (!project?.defaultAvatarId) {
      return { status: 400, jsonBody: { error: 'No presenter avatar is selected for this project — choose one in Casting settings first.' } }
    }
    if (!process.env.HEYGEN_API_KEY) {
      return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
    }

    const allScenes = await prisma.scene.findMany({
      where: { moduleId: body.module_id },
      orderBy: { orderIndex: 'asc' },
      include: { segments: { orderBy: { orderIndex: 'asc' } } },
    })
    const scenes = body.scene_ids?.length ? allScenes.filter((s) => body.scene_ids!.includes(s.id)) : allScenes
    if (!scenes.length) return { status: 400, jsonBody: { error: 'No scenes to generate.' } }

    // Render every scene's own slide+voice video locally FIRST — CPU-bound,
    // unrelated to HeyGen, same rendering the normal per-scene path already
    // does.
    //
    // REVERTED (2026-08-12): briefly raised to 4 to cut the ~5min/9-scene
    // pre-processing time, on the theory that capping ffmpeg's own thread
    // count (ENCODE_SPEED in ffmpegVideo.ts, was `-threads 0` = claim every
    // core) made more CONCURRENT processes safe. It wasn't — the backend
    // process crashed outright (not a caught JS error, an actual process
    // death) during the very next batch run at concurrency 4. Each scene's
    // render can itself spin up to 2 more ffmpeg processes internally
    // (renderSegmentsToVideo's own RENDER_CONCURRENCY), so concurrency 4
    // here meant up to 8 ffmpeg child processes at once — enough to exhaust
    // memory/process limits on this machine and take the whole host down
    // with it, not just fail the one request. Back to 2 (max ~4 concurrent
    // ffmpeg processes) until this can be raised more carefully — e.g.
    // capped ffmpeg threads is still a safe, real win on its own even at
    // concurrency 2, since two processes no longer fight for every core.
    const CONCURRENCY = 2
    let cursor = 0
    const rendered: SceneRender[] = new Array(scenes.length)
    const renderOne = async (i: number) => {
      const scene = scenes[i]
      const segs = scene.segments.length ? scene.segments : null
      const resolvedAudio = segs
        ? segs.map((s, j) => s.ttsAudioUrl || ((j === 0 || segs.length === 1) ? scene.ttsAudioUrl : null))
        : [scene.ttsAudioUrl]
      const missingIdx = resolvedAudio.findIndex((u) => !u)
      if (missingIdx !== -1) throw new Error(`Scene ${scene.id}: missing TTS audio — run TTS generation first.`)

      const renderable: RenderableSegment[] = segs
        ? segs.map((s, j) => ({
            id: s.id,
            text: s.text,
            slideDesign: s.slideDesign || '{}',
            ttsAudioUrl: resolvedAudio[j] as string,
            textAnimationTimings: s.textAnimationTimings || null,
            motionId: scene.textAnimationType || 'word-by-word',
          }))
        : [{
            id: 'single-slide',
            text: scene.scriptContent || '',
            slideDesign: scene.slideDeckContent || '{}',
            ttsAudioUrl: resolvedAudio[0] as string,
            motionId: scene.textAnimationType || 'word-by-word',
          }]

      const slideVideoUrl = await renderSegmentsToVideo({ segments: renderable, moduleTitle: module_.title })
      const slideVideoPath = localPathFromUploadUrl(slideVideoUrl)
      if (!slideVideoPath) throw new Error(`Scene ${scene.id}: rendered slide video not found locally`)
      const avatarPosition = extractAvatarPosition(segs ? segs[0]?.slideDesign : scene.slideDeckContent)

      let audioPath: string
      try {
        audioPath = await extractAudioTrack(slideVideoPath)
      } catch {
        audioPath = localPathFromUploadUrl(resolvedAudio[0] as string) || slideVideoPath
      }
      rendered[i] = { sceneId: scene.id, slideVideoUrl, audioPath, avatarPosition, oldAvatarVideoUrl: scene.avatarVideoUrl }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, async () => {
      while (true) {
        const i = cursor++
        if (i >= scenes.length) break
        await renderOne(i)
      }
    })
    await Promise.all(workers)

    // ONE combined audio track for the whole batch + each scene's own
    // [start,end] offset within it — heygenFinalize.ts's pollModuleBatch()
    // uses these to split the single returned avatar clip back apart.
    const { combinedPath, offsets } = await concatAudioWithOffsets(rendered.map((r) => r.audioPath))

    const job = await startAvatarClipJob({
      audioPaths: [combinedPath],
      avatarId: project.defaultAvatarId,
      avatarStyle: project.avatarStyle,
      avatarBackground: project.avatarBackground,
      cacheKeyFiles: rendered.map((r) => r.audioPath),
      callbackId: `module:${body.module_id}`,
    })

    const sceneEntries = rendered.map((r, i) => ({
      sceneId: r.sceneId,
      start: offsets[i].start,
      end: offsets[i].end,
      slideVideoUrl: r.slideVideoUrl,
      avatarPosition: r.avatarPosition,
      oldAvatarVideoUrl: r.oldAvatarVideoUrl,
    }))

    if (job.cached) {
      // Rare (only if this EXACT combined narration was rendered before) —
      // split + composite + persist right away instead of queuing a poll.
      context.log(`[generateModuleAvatarBatch] Module ${body.module_id}: combined audio already cached, splitting immediately`)
      for (const entry of sceneEntries) {
        try {
          const clip = await trimVideo(job.avatarPath, entry.start, entry.end)
          const basePath = localPathFromUploadUrl(entry.slideVideoUrl)
          if (!basePath) throw new Error('rendered slide video not found locally')
          const composited = await overlayAvatarOnVideo(basePath, clip, entry.avatarPosition, job.chromaKey)
          const finalUrl = `/api/uploads/${parse(composited).base}`
          await prisma.scene.update({ where: { id: entry.sceneId }, data: { avatarVideoUrl: finalUrl, status: 'completed' } })
          deleteOldUpload(entry.oldAvatarVideoUrl, finalUrl)
        } catch (e: any) {
          context.warn(`[generateModuleAvatarBatch] scene ${entry.sceneId} split/composite failed, using slide-only video: ${e?.message}`)
          await prisma.scene.update({ where: { id: entry.sceneId }, data: { avatarVideoUrl: entry.slideVideoUrl, status: 'completed' } })
        }
      }
      return { status: 200, jsonBody: { success: true, module_id: body.module_id, status: 'completed', scene_count: sceneEntries.length } }
    }

    writeFileSync(
      join(UPLOAD_DIR, `heygen_modulebatch_${body.module_id}.json`),
      JSON.stringify({
        moduleId: body.module_id, videoId: job.videoId, cachePath: job.cachePath,
        chromaKey: job.chromaKey, createdAt: Date.now(), scenes: sceneEntries,
      })
    )
    writeFileSync(
      join(UPLOAD_DIR, `heygen_pending_${job.videoId}.json`),
      JSON.stringify({ moduleGroupId: body.module_id, createdAt: Date.now() })
    )
    await prisma.scene.updateMany({ where: { id: { in: sceneEntries.map((e) => e.sceneId) } }, data: { status: 'rendering' } })

    context.log(`[generateModuleAvatarBatch] Module ${body.module_id}: ${sceneEntries.length} scene(s) batched into ONE HeyGen job ${job.videoId}`)
    return {
      status: 200,
      jsonBody: { success: true, module_id: body.module_id, video_id: job.videoId, status: 'rendering', scene_count: sceneEntries.length },
    }
  } catch (error: any) {
    context.error('[generateModuleAvatarBatch] Error:', error)
    return { status: 500, jsonBody: { error: error?.message || 'Module batch generation failed' } }
  }
}

app.http('generateModuleAvatarBatch', {
  methods: ['POST'],
  route: 'generateModuleAvatarBatch',
  authLevel: 'anonymous',
  handler: generateModuleAvatarBatchHandler,
})
