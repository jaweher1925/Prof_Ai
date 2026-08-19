/**
 * POST /api/pollHeyGenVideo
 *
 * Checks the status of a video generation job.
 * When complete, saves the final video URL to the scene.
 *
 * Migrated to HeyGen v3 (2026-08-04): GET /v3/videos/{id} replaces the retired
 * /v1/video_status.get. Completion handling itself now lives in
 * heygenFinalize.ts, shared with heygenWebhook.ts, so a job that finishes via
 * a webhook push and one that finishes via this poll are handled identically.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { getUser } from '../../lib/auth'
import { getVideoStatusV3 } from '../../lib/heygenAvatar'
import { finalizeHeyGenJob, pollSegmentGroup, pollModuleBatch } from '../../lib/heygenFinalize'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

async function pollHeyGenVideoHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      video_id?: string
      scene_id?: string
    }

    if (!body.video_id) {
      return { status: 400, jsonBody: { error: 'video_id is required' } }
    }

    if (!process.env.HEYGEN_API_KEY) {
      return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
    }

    // Grouped segment job (#44) — this video_id is one of SEVERAL independent
    // per-segment HeyGen jobs for a multi-part scene (see
    // generateHeyGenAvatar.ts's startGroupedSegmentRender). The frontend only
    // knows about this one representative video_id, so pollSegmentGroup()
    // checks every sibling segment's status on this same tick and only
    // reports "completed" once the whole scene has been stitched together —
    // the polling CONTRACT (poll this one id, wait for completed:true) stays
    // identical to a normal single job from the frontend's point of view.
    const pendingSidecarPath = join(UPLOAD_DIR, `heygen_pending_${body.video_id}.json`)
    if (existsSync(pendingSidecarPath)) {
      try {
        const meta = JSON.parse(readFileSync(pendingSidecarPath, 'utf8')) as { groupSceneId?: string; moduleGroupId?: string }
        if (meta.groupSceneId) {
          const groupResult = await pollSegmentGroup(meta.groupSceneId, context)
          if (groupResult.outcome === 'completed') {
            return {
              status: 200,
              jsonBody: {
                video_id: body.video_id, status: 'completed', video_url: groupResult.videoUrl,
                completed: true,
                ...(groupResult.avatarWarning ? { avatar_warning: groupResult.avatarWarning } : {}),
              },
            }
          }
          // 'processing' or 'not_found' (already finalized by a previous
          // tick, sidecar cleaned up) — either way, keep the frontend polling.
          return {
            status: 200,
            jsonBody: { video_id: body.video_id, status: 'processing', video_url: null, completed: false },
          }
        }
        // Module-level batched job (#46) — this video_id is the ONE HeyGen
        // job covering every scene in the batch. The frontend just wants
        // completed:true/false; the module_id-keyed sidecar (checked here)
        // tracks whether every scene has been split + composited yet.
        if (meta.moduleGroupId) {
          const batchResult = await pollModuleBatch(meta.moduleGroupId, context)
          if (batchResult.outcome === 'completed') {
            return {
              status: 200,
              jsonBody: { video_id: body.video_id, status: 'completed', video_url: null, completed: true, scene_count: batchResult.sceneCount },
            }
          }
          if (batchResult.outcome === 'failed') {
            return {
              status: 200,
              jsonBody: { video_id: body.video_id, status: 'failed', video_url: null, completed: false, error: batchResult.error },
            }
          }
          return {
            status: 200,
            jsonBody: { video_id: body.video_id, status: 'processing', video_url: null, completed: false },
          }
        }
      } catch { /* malformed sidecar — fall through to the normal single-job path */ }
    }

    const { status, videoUrl, thumbnailUrl, failureMessage } = await getVideoStatusV3(body.video_id)
    context.log(`Video ${body.video_id} status: ${status}`)

    if (status === 'processing' || status === 'pending') {
      // Surface a warning in logs if a job is approaching HeyGen's own render
      // ceiling — doesn't change behavior, just visibility for debugging stuck jobs.
      const sidecarPath = join(UPLOAD_DIR, `heygen_pending_${body.video_id}.json`)
      if (existsSync(sidecarPath)) {
        try {
          const meta = JSON.parse(readFileSync(sidecarPath, 'utf8')) as { createdAt?: number }
          const elapsedMin = Math.round((Date.now() - (meta.createdAt || Date.now())) / 60_000)
          if (elapsedMin > 25) {
            context.warn(`HeyGen job ${body.video_id} still processing after ${elapsedMin}min (approaching timeout)`)
          }
        } catch { /* ignore sidecar read errors */ }
      }
      return {
        status: 200,
        jsonBody: { video_id: body.video_id, status, video_url: null, thumbnail_url: thumbnailUrl, completed: false },
      }
    }

    const result = await finalizeHeyGenJob({
      videoId: body.video_id,
      status,
      videoUrl,
      thumbnailUrl,
      failureMessage,
      context,
    })

    if (result.outcome === 'not_found') {
      // No sidecar and no scene carries the heygen:<id> sentinel — nothing left to do.
      return {
        status: 200,
        jsonBody: { video_id: body.video_id, status, video_url: videoUrl || null, thumbnail_url: thumbnailUrl, completed: status === 'completed' },
      }
    }

    if (result.outcome === 'failed') {
      return {
        status: 200,
        jsonBody: { video_id: body.video_id, status: 'failed', video_url: null, completed: false, error: failureMessage || undefined },
      }
    }

    if (result.outcome === 'processing') {
      // Another request (poll or webhook) is already finalizing this job.
      return {
        status: 200,
        jsonBody: { video_id: body.video_id, status: 'processing', video_url: null, completed: false },
      }
    }

    // outcome === 'completed'
    return {
      status: 200,
      jsonBody: {
        video_id: body.video_id,
        status: 'completed',
        video_url: result.videoUrl,
        thumbnail_url: result.thumbnailUrl ?? thumbnailUrl ?? null,
        completed: true,
        ...(result.singlePart ? { single_part: true } : {}),
        ...(result.avatarWarning ? { avatar_warning: result.avatarWarning } : {}),
      },
    }
  } catch (error: any) {
    context.error('pollHeyGenVideo error:', error)
    return { status: 500, jsonBody: { error: error.message } }
  }
}

app.http('pollHeyGenVideo', {
  methods: ['POST'],
  route: 'pollHeyGenVideo',
  authLevel: 'anonymous',
  handler: pollHeyGenVideoHandler,
})
