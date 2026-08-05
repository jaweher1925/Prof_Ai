/**
 * POST /api/generateHeyGenAvatar
 *
 * Step 5 of the pipeline — Voice to Video (expensive, last).
 * Renders visual slides + TTS audio into video.
 * 
 * For now: Voice-only (no HeyGen avatar overlay yet)
 * Simply: Convert slideDesign + audio → video
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { parse, join } from 'path'
import { writeFileSync } from 'fs'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import {
  renderSegmentsToVideo,
  overlayAvatarOnVideo,
  localPathFromUploadUrl,
  extractAudioTrack,
  extractAvatarPosition,
} from '../../lib/ffmpegVideo'
import { startAvatarClipJob } from '../../lib/heygenAvatar'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

/**
 * Talking-avatar overlay (#40), now NON-BLOCKING:
 * - avatar cached (narration unchanged) → composite immediately, done.
 * - cache miss → submit the HeyGen job and return its video_id; a sidecar
 *   JSON next to the uploads remembers the slide video + cache path so
 *   pollHeyGenVideo.ts can finish (download → cache → composite) when HeyGen
 *   completes. The HTTP request no longer sits open for the 2–15 min render.
 * Any failure falls back to the slide-only video so rendering never breaks.
 */
async function addAvatarOrQueue(
  context: InvocationContext,
  slideVideoUrl: string,
  audioUrls: string[],
  moduleId: string,
  // sceneId is written into the pending-job sidecar so pollHeyGenVideo.ts AND
  // heygenWebhook.ts (added in the v3 migration) can both identify which scene
  // to finalize without needing it passed back in on every request — the
  // webhook in particular gets nothing from HeyGen except the video_id.
  sceneId: string,
  useAvatar: boolean,
  avatarPosition?: { x: number; y: number; width: number } | null,
  // Single-part Visual Design PREVIEWs set this so the sidecar is tagged
  // preview:true — finalizeHeyGenJob then composites + returns the avatar clip
  // WITHOUT writing Scene.avatarVideoUrl (which would clobber the full-scene
  // video Video Editing assembles from). The preview just needs to SHOW the
  // avatar once it's rendered.
  preview?: boolean,
  segmentId?: string
): Promise<{ pending: false; videoUrl: string; reason?: string } | { pending: true; heygenVideoId: string }> {
  try {
    if (!useAvatar) {
      context.log('[generateHeyGenAvatar] Voice-only mode requested — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl } // intentional — no reason surfaced
    }
    if (!process.env.HEYGEN_API_KEY) {
      context.log('[generateHeyGenAvatar] No HEYGEN_API_KEY — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl, reason: 'Speaking avatar is not configured on this server (missing HeyGen API key) — rendered voice-only.' }
    }
    const module_ = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { project: true },
    })
    const project = module_?.project
    if (!project?.defaultAvatarId) {
      context.log('[generateHeyGenAvatar] No avatar selected on project — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl, reason: 'No presenter avatar is selected for this project — rendered voice-only.' }
    }

    const basePath = localPathFromUploadUrl(slideVideoUrl)
    if (!basePath) {
      context.warn('[generateHeyGenAvatar] Slide video not found locally — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl, reason: 'Could not locate the rendered slide video to overlay the avatar onto — rendered voice-only.' }
    }

    // Drive the avatar from the FINAL video's own audio track (not the raw
    // TTS files) so lip-sync stays exact even though crossfade transitions
    // shorten the timeline. Falls back to the raw TTS audio if extraction
    // fails for any reason.
    let audioPaths: string[]
    try {
      audioPaths = [await extractAudioTrack(basePath)]
    } catch {
      audioPaths = audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p)
    }
    if (!audioPaths.length) {
      context.warn('[generateHeyGenAvatar] No audio available — skipping avatar overlay')
      return { pending: false, videoUrl: slideVideoUrl, reason: 'No narration audio was available to drive the avatar — rendered voice-only.' }
    }

    const job = await startAvatarClipJob({
      audioPaths,
      avatarId: project.defaultAvatarId,
      avatarStyle: project.avatarStyle,
      avatarBackground: project.avatarBackground,
      // Cache key = the raw TTS files: stable across re-renders, changes
      // exactly when the narration audio actually changes
      cacheKeyFiles: audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p),
      // Echoed back in the HeyGen webhook payload for traceability in the
      // HeyGen dashboard — not load-bearing, the sidecar below is what
      // finalizeHeyGenJob actually reads.
      callbackId: preview && segmentId ? `${sceneId}:${segmentId}` : sceneId,
    })

    if (job.cached) {
      const finalPath = await overlayAvatarOnVideo(basePath, job.avatarPath, avatarPosition)
      const finalUrl = `/api/uploads/${parse(finalPath).base}`
      context.log(`[generateHeyGenAvatar] ✅ Avatar composited from cache: ${finalUrl}`)
      return { pending: false, videoUrl: finalUrl }
    }

    // Sidecar so pollHeyGenVideo.ts / heygenWebhook.ts can finish the job later.
    // sceneId is required here (added in the v3 migration) — the webhook has no
    // other way to know which scene a bare video_id belongs to.
    writeFileSync(
      join(UPLOAD_DIR, `heygen_pending_${job.videoId}.json`),
      JSON.stringify({ slideVideoUrl, cachePath: job.cachePath, createdAt: Date.now(), avatarPosition: avatarPosition || null, preview: !!preview, sceneId })
    )
    context.log(`[generateHeyGenAvatar] HeyGen job ${job.videoId} submitted — completing asynchronously via poll`)
    return { pending: true, heygenVideoId: job.videoId }
  } catch (err: any) {
    // Previously this silently fell back to the slide-only video with NO
    // indication anywhere that the avatar failed — the request still
    // returned 200/"completed", so the user just got a voice-only video and
    // had no way to know why (reported as "no avatar in the vd"). Keep the
    // resilient fallback (don't fail the whole render just because the
    // avatar overlay broke) but surface WHY via `reason` so the frontend can
    // actually tell the user instead of pretending nothing went wrong.
    context.warn(`[generateHeyGenAvatar] Avatar overlay failed — using slide-only video: ${err?.message}`)
    return { pending: false, videoUrl: slideVideoUrl, reason: `Speaking avatar rendering failed (${err?.message || 'unknown error'}) — rendered voice-only.` }
  }
}

/** Shared tail for both scene shapes: either finish now (voice-only / cached
 *  avatar) or persist the pending HeyGen job and return the video_id the
 *  frontend polls. */
async function finishOrQueue(
  context: InvocationContext,
  sceneId: string,
  moduleId: string,
  slideVideoUrl: string,
  audioUrls: string[],
  useAvatar: boolean,
  avatarPosition?: { x: number; y: number; width: number } | null
): Promise<HttpResponseInit> {
  const avatar = await addAvatarOrQueue(context, slideVideoUrl, audioUrls, moduleId, sceneId, useAvatar, avatarPosition)

  if (avatar.pending) {
    // NOTE: avatarVideoUrl deliberately keeps the `heygen:<id>` sentinel —
    // pollHeyGenVideo treats "avatarVideoUrl set and NOT heygen:-prefixed" as
    // "already finalized" and would skip compositing entirely if we parked a
    // real URL here.
    await prisma.scene.update({
      where: { id: sceneId },
      data: { avatarVideoUrl: `heygen:${avatar.heygenVideoId}`, status: 'rendering' },
    })
    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: sceneId,
        video_id: avatar.heygenVideoId,
        status: 'rendering',
        // The slide + narration cut is ALREADY rendered and watchable at this
        // point — only the talking-avatar overlay is still queued at HeyGen,
        // which is what takes minutes (it's their render queue, not ours).
        // Hand it back so the user can watch/scrub the scene immediately
        // instead of staring at a spinner until the avatar lands. The avatar
        // is composited on top later by pollHeyGenVideo.
        preview_video_url: slideVideoUrl,
      },
    }
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { avatarVideoUrl: avatar.videoUrl, status: 'completed' },
  })
  context.log(`[generateHeyGenAvatar] ✅ Completed: ${avatar.videoUrl}`)
  return {
    status: 200,
    jsonBody: {
      success: true, scene_id: sceneId, video_url: avatar.videoUrl,
      ...(avatar.reason ? { avatar_warning: avatar.reason } : {}),
    },
  }
}

async function generateHeyGenAvatarHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { scene_id?: string; use_avatar?: boolean; segment_id?: string }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }
    // Honour the frontend's voice-only toggle (was previously ignored)
    const useAvatar = body.use_avatar !== false

    // Get scene with module and segments (explicitly select all segment fields)
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: {
        module: true,
        segments: { 
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            text: true,
            slideDesign: true,
            ttsAudioUrl: true,
            textAnimationTimings: true,
            segmentType: true,
          }
        },
      },
    })

    if (!scene) {
      return { status: 404, jsonBody: { error: 'Scene not found' } }
    }

    const hasSegments = scene.segments.length > 0

    if (hasSegments) {
      // Resolve each segment's audio before validating. Scene.ttsAudioUrl is
      // a mirror of the FIRST segment's clip (see generateTTS.ts), and some
      // segment rows were created retroactively without ever backfilling
      // their OWN ttsAudioUrl column — so the audio genuinely exists (voice
      // really was generated), it's just not copied onto that row. Checking
      // segment.ttsAudioUrl alone was rejecting real, already-voiced scenes
      // with a false "No TTS audio" error. Only the primary segment (the
      // first one, or the only one) gets this fallback — a LATER part
      // (2nd/3rd content, recap) genuinely missing its own audio must still
      // be treated as missing, not silently reuse segment 0's clip.
      const resolvedAudio = scene.segments.map((s, i) =>
        s.ttsAudioUrl || ((i === 0 || scene.segments.length === 1) ? scene.ttsAudioUrl : null)
      )
      const missingIndex = resolvedAudio.findIndex(url => !url)
      if (missingIndex !== -1) {
        return { status: 400, jsonBody: { error: `Segment ${scene.segments[missingIndex].id}: No TTS audio. Run TTS generation first.` } }
      }

      // Cast segments to RenderableSegment format
      const allSegments = scene.segments.map((s, i) => ({
        id: s.id,
        text: s.text,
        slideDesign: s.slideDesign || '{}',
        ttsAudioUrl: resolvedAudio[i] || '',
        textAnimationTimings: s.textAnimationTimings || null,
        motionId: scene.textAnimationType || 'word-by-word',
      }))

      // SCENE-BY-SCENE (#Visual Design): each narrated part is its own row in
      // the designer's menu, so "generate" there must render just THAT part —
      // not silently concatenate every sibling part into one clip. Passing
      // segment_id scopes the render to one segment: independent of its
      // siblings, and proportionally faster (one clip instead of four).
      //
      // Without segment_id the whole scene renders as before — that's the
      // module-level assembly Video Editing relies on, so it stays intact.
      //
      // IMPORTANT: only treat this as a non-persisting PREVIEW when the scene
      // genuinely has MULTIPLE parts. For a single-segment scene, that one
      // segment IS the whole scene — so it must render+persist normally (write
      // Scene.avatarVideoUrl), or generating the first scene never marks it
      // "ready" and Video Editing stays locked ("I generated the scene but the
      // Video Editing step didn't open").
      const isSinglePart = !!body.segment_id && allSegments.length > 1
      const segments = isSinglePart
        ? allSegments.filter(sg => sg.id === body.segment_id)
        : allSegments
      if (isSinglePart && !segments.length) {
        return { status: 404, jsonBody: { error: 'Segment not found on this scene' } }
      }

      context.log(
        `[generateHeyGenAvatar] Rendering ${segments.length}/${allSegments.length} segment(s) for scene ${body.scene_id}` +
        (isSinglePart ? ` (single part ${body.segment_id})` : '')
      )

      try {
        const videoUrl = await renderSegmentsToVideo({
          segments,
          moduleTitle: scene.module?.title,
        })

        // Avatar placeholder position/size from the Visual Designer (#3, #4).
        // For a single-part render use THAT part's own placement, not the
        // first segment's — each part positions its avatar independently.
        const avatarPosition = extractAvatarPosition(
          isSinglePart
            ? scene.segments.find(sg => sg.id === body.segment_id)?.slideDesign
            : scene.segments[0]?.slideDesign
        )

        // A single-part render is a Visual Design PREVIEW of one row. There's
        // no per-segment video column, and writing to Scene.avatarVideoUrl
        // would replace the full-scene video Video Editing assembles from — so
        // it must NOT go through finishOrQueue's scene-level DB write.
        //
        // But the preview still has to SHOW the presenter, or the avatar
        // "disappears" in Visual Design. So composite the avatar here directly
        // via addAvatarOrQueue (no DB write): the avatar clip is cached per its
        // narration audio, so once it exists — after the first full render or
        // an earlier preview — it composites INSTANTLY. Only the very first
        // ever render of a part is slow (HeyGen's queue); in that case we
        // return the slide+voice cut immediately so the user isn't blocked, and
        // the avatar shows on the next preview once its clip is cached.
        if (isSinglePart) {
          if (!useAvatar) {
            return {
              status: 200,
              jsonBody: { success: true, scene_id: body.scene_id, segment_id: body.segment_id, video_url: videoUrl, single_part: true },
            }
          }
          const av = await addAvatarOrQueue(
            context, videoUrl, segments.map(s => s.ttsAudioUrl),
            scene.moduleId, body.scene_id, true, avatarPosition, /* preview */ true, body.segment_id
          )
          if (!av.pending) {
            // Avatar clip was cached (or overlay done) — the preview already
            // HAS the presenter.
            context.log(`[generateHeyGenAvatar] ✅ Single-part preview with avatar: ${av.videoUrl}`)
            return {
              status: 200,
              jsonBody: {
                success: true, scene_id: body.scene_id, segment_id: body.segment_id,
                video_url: av.videoUrl, single_part: true,
                ...(av.reason ? { avatar_warning: av.reason } : {}),
              },
            }
          }
          // First-ever render of this part: HeyGen is queued. Return the job id
          // so the frontend POLLS and swaps in the avatar the moment it's ready
          // — plus the slide+voice cut to watch in the meantime. No permanent
          // voice-only fallback. The scene's own video is untouched (preview
          // sidecar is tagged so poll won't write it).
          context.log(`[generateHeyGenAvatar] Single-part preview: avatar job ${av.heygenVideoId} queued`)
          return {
            status: 200,
            jsonBody: {
              success: true, scene_id: body.scene_id, segment_id: body.segment_id,
              video_id: av.heygenVideoId, status: 'rendering', single_part: true,
              preview_video_url: videoUrl,
            },
          }
        }

        // Talking-avatar overlay (#40) — async when not cached
        return await finishOrQueue(
          context,
          body.scene_id,
          scene.moduleId,
          videoUrl,
          segments.map(s => s.ttsAudioUrl),
          useAvatar,
          avatarPosition
        )
      } catch (renderErr: any) {
        context.error(`[generateHeyGenAvatar] Render failed:`, renderErr)
        await prisma.scene.update({
          where: { id: body.scene_id },
          data: { status: 'assets_ready' },
        })
        return {
          status: 500,
          jsonBody: { error: `Video render failed: ${renderErr?.message}` },
        }
      }
    } else {
      // Non-segmented scene: use legacy slideDeckContent
      if (!scene.slideDeckContent) {
        return { status: 400, jsonBody: { error: 'Scene has no slide design. Use Visual Designer first.' } }
      }

      if (!scene.ttsAudioUrl) {
        return { status: 400, jsonBody: { error: 'Scene has no TTS audio. Run TTS generation first.' } }
      }

      context.log(`[generateHeyGenAvatar] Rendering single-slide scene ${body.scene_id}`)

      try {
        // Convert single slide to segment format
        const segment: any = {
          id: 'single-slide',
          text: scene.scriptContent || '',  // narration → caption animation source
          slideDesign: scene.slideDeckContent,
          ttsAudioUrl: scene.ttsAudioUrl,
          motionId: scene.textAnimationType || 'word-by-word',
        }
        
        const videoUrl = await renderSegmentsToVideo({
          segments: [segment],
          moduleTitle: scene.module?.title,
        })

        // Avatar placeholder position/size from the Visual Designer (#3, #4)
        const avatarPosition = extractAvatarPosition(scene.slideDeckContent)

        // Talking-avatar overlay (#40) — async when not cached
        return await finishOrQueue(
          context,
          body.scene_id,
          scene.moduleId,
          videoUrl,
          [scene.ttsAudioUrl || ''],
          useAvatar,
          avatarPosition
        )
      } catch (renderErr: any) {
        context.error(`[generateHeyGenAvatar] Render failed:`, renderErr)
        await prisma.scene.update({
          where: { id: body.scene_id },
          data: { status: 'assets_ready' },
        })
        return {
          status: 500,
          jsonBody: { error: `Video render failed: ${renderErr?.message}` },
        }
      }
    }
  } catch (error: any) {
    context.error(`[generateHeyGenAvatar] Error:`, error)
    return { status: 500, jsonBody: { error: error?.message || 'Video generation failed' } }
  }
}

app.http('generateHeyGenAvatar', {
  methods: ['POST'],
  route: 'generateHeyGenAvatar',
  authLevel: 'anonymous',
  handler: generateHeyGenAvatarHandler,
})
