/**
 * POST /api/heygenWebhook
 *
 * Receives HeyGen v3 webhook deliveries (avatar_video.success / avatar_video.fail)
 * — the push-based alternative to pollHeyGenVideo.ts polling every 5-8s.
 *
 * Rewritten during the v3 migration (2026-08-04). The PREVIOUS version of this
 * handler was a stub: on avatar_video.success it wrote the raw HeyGen clip URL
 * straight into Scene.avatarVideoUrl. That is NOT what the rest of the pipeline
 * expects — the real "finished video" is the raw avatar composited onto the
 * slide (overlayAvatarOnVideo in ffmpegVideo.ts), which pollHeyGenVideo.ts did
 * correctly but this handler never did. Turning webhooks "on" without this fix
 * would have made every webhook-completed scene show the bare avatar on a solid
 * background with no slide behind it. It now calls the same finalizeHeyGenJob()
 * pollHeyGenVideo.ts uses, so poll and webhook produce identical results.
 *
 * Security: HeyGen signs the raw request body with HMAC-SHA256 (Heygen-Signature
 * header, secret from POST /v3/webhooks/endpoints). Requests that don't verify
 * are rejected — see verifyHeygenWebhookSignature() in heygenAvatar.ts. Without
 * this, anyone who learns this URL could forge a "video complete" event and
 * point it at an arbitrary MP4 for any scene ID that happens to be pending.
 *
 * This endpoint does nothing on its own — HeyGen only calls it once a webhook
 * endpoint has been registered (POST /v3/webhooks/endpoints with this URL) and
 * PUBLIC_API_BASE_URL is set so createAvatarVideo() actually asks for a callback.
 * Until both of those are true, polling continues to be what finishes jobs, and
 * this handler simply never receives traffic.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { verifyHeygenWebhookSignature } from '../../lib/heygenAvatar'
import { finalizeHeyGenJob } from '../../lib/heygenFinalize'

// Best-effort replay/duplicate-delivery guard, keyed on HeyGen's Heygen-Event-Id
// header (HeyGen retries failed deliveries with backoff for up to 24h, and the
// same event can arrive more than once — see developers.heygen.com/docs/webhooks).
// finalizeHeyGenJob() is independently idempotent (checks scene state before
// redoing work), so this is a fast-path optimization, not the only safety net.
const seenEvents = new Map<string, number>()
const SEEN_TTL_MS = 60 * 60_000

function alreadyProcessed(eventId: string | null): boolean {
  const now = Date.now()
  for (const [id, ts] of seenEvents) {
    if (now - ts > SEEN_TTL_MS) seenEvents.delete(id)
  }
  if (!eventId) return false
  if (seenEvents.has(eventId)) return true
  seenEvents.set(eventId, now)
  return false
}

async function heygenWebhookHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Read the RAW body for signature verification — re-serializing a parsed
  // JSON object before hashing would break the HMAC on any whitespace/key-order
  // difference (see developers.heygen.com/docs/webhooks).
  const rawBody = await request.text()

  const verification = verifyHeygenWebhookSignature(
    rawBody,
    request.headers.get('heygen-signature'),
    request.headers.get('heygen-timestamp')
  )
  if (!verification.ok) {
    context.warn(`heygenWebhook: rejected delivery — ${verification.reason}`)
    // 401 so HeyGen's retry logic knows this attempt didn't succeed — but note
    // an unverifiable request is never trusted regardless of retry behavior.
    return { status: 401, jsonBody: { error: verification.reason } }
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { status: 400, jsonBody: { error: 'invalid JSON body' } }
  }

  const eventId = request.headers.get('heygen-event-id')
  if (alreadyProcessed(eventId)) {
    context.log(`heygenWebhook: duplicate delivery of event ${eventId}, acknowledging without reprocessing`)
    return { status: 200, jsonBody: { received: true, duplicate: true } }
  }

  try {
    const eventType: string = body.event_type
    const eventData = body.event_data || {}
    const videoId: string | undefined = eventData.video_id

    context.log(`heygenWebhook: received ${eventType} for video ${videoId}`)

    if (!videoId) {
      return { status: 200, jsonBody: { received: true } } // nothing we can act on
    }

    if (eventType === 'avatar_video.success') {
      const result = await finalizeHeyGenJob({
        videoId,
        status: 'completed',
        videoUrl: eventData.url,
        context,
      })
      context.log(`heygenWebhook: finalized ${videoId} — outcome=${result.outcome} scene=${result.sceneId || 'n/a'}`)
    } else if (eventType === 'avatar_video.fail') {
      await finalizeHeyGenJob({
        videoId,
        status: 'failed',
        failureMessage: eventData.error_message || eventData.message || eventData.reason || null,
        context,
      })
    } else {
      // Other event types (translations, avatars, etc.) aren't relevant to this
      // pipeline — acknowledge and ignore rather than error.
      context.log(`heygenWebhook: ignoring unhandled event type ${eventType}`)
    }
    // Always 200 quickly on a request we understood — HeyGen retries with
    // exponential backoff for up to 24h on non-2xx, so a real transient error
    // (e.g. DB hiccup) still gets another chance rather than being swallowed.
    return { status: 200, jsonBody: { received: true } }
  } catch (error: any) {
    context.error('heygenWebhook error:', error)
    // Non-2xx here is intentional (unlike the old stub) — lets HeyGen retry a
    // delivery that failed for a transient reason instead of us silently
    // dropping a completion event.
    return { status: 500, jsonBody: { error: error?.message || 'webhook processing failed' } }
  }
}

app.http('heygenWebhook', {
  methods: ['POST'],
  route: 'heygenWebhook',
  authLevel: 'anonymous',
  handler: heygenWebhookHandler,
})
