import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../lib/auth'

// Both HeyGen avatars and ElevenLabs voices are near-static catalogs (they
// don't change between page loads), but every dropdown open was making a
// fresh live external API call — which is what made "select avatar" feel
// slow. A simple in-memory cache (process lives for the life of the Function
// host) makes every call after the first one instant.
// Was 10 minutes — too short in practice: HeyGen's own /v2/avatars response
// (1000+ avatars) has been observed taking 60+ seconds on a cold call, and
// this cache expiring that often meant users kept re-paying that cost over
// and over through a normal editing session. These catalogs realistically
// change on the order of days, not minutes, so 6 hours trades a little
// staleness for far fewer multi-second/minute stalls opening Visual Design.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
let avatarsCache: { at: number; data: any[] } | null = null
let voicesCache:  { at: number; data: any[] } | null = null

/**
 * How much of the presenter a given avatar actually shows.
 *
 * This is NOT something the render pipeline can change: HeyGen's v3 API has
 * no framing parameter at all (v2's `avatar_style: 'closeUp' | 'normal'` was
 * dropped and never replaced — see heygenAvatar.ts's createAvatarVideo), so
 * an avatar's shot is fixed by the footage it was built from. Confirmed by
 * HeyGen support: "For custom avatars or talking photos, the framing matches
 * the top/sides of your original uploaded image or training video." That's
 * why a chest-up avatar like `Aditya_public_2` renders chest-up no matter
 * what the overlay box does — the body simply isn't in the source frames.
 *
 * HeyGen exposes no framing FIELD either, but their stock catalog encodes
 * posture in the avatar name (`Judy_Teacher_Sitting_public`,
 * `..._Fullbody_...`, `Daisy-inskirt-...`). This reads those keywords so the
 * picker can group by shot instead of making the user open each preview.
 *
 * Deliberately returns 'unknown' rather than guessing when no keyword
 * matches — most of the catalog is unlabelled, and a confidently WRONG
 * "full body" badge is worse than none, since the user would pick it, spend
 * a real HeyGen render, and get the same crop back.
 */
export type AvatarFraming = 'full-body' | 'half-body' | 'close-up' | 'unknown'

export function classifyAvatarFraming(a: any): AvatarFraming {
  // Normalize separators so "full_body", "full-body", "FullBody" and
  // "Fullbody" all reduce to the same searchable form.
  const hay = [a?.avatar_name, a?.name, a?.avatar_id, ...(Array.isArray(a?.tags) ? a.tags : [])]
    .filter(Boolean).join(' ').toLowerCase().replace(/[_\-.]+/g, ' ')
  const has = (...words: string[]) => words.some(w => hay.includes(w))

  // A talking photo is generated from ONE still headshot — always a
  // head/shoulders shot regardless of naming.
  if (a?.is_talking_photo) return 'close-up'

  // Check most-specific first: "full body" must win over a bare "body", and
  // an explicit close-up keyword must not be shadowed by a posture word.
  if (has('fullbody', 'full body', 'wholebody', 'whole body', 'standing', 'walking')) return 'full-body'
  if (has('closeup', 'close up', 'headshot', 'head shot', 'portrait', 'face only')) return 'close-up'
  if (has('halfbody', 'half body', 'waist', 'sitting', 'seated', 'desk', 'office', 'lounge', 'podium', 'chair', 'couch', 'sofa')) return 'half-body'
  return 'unknown'
}

// GET /api/listHeyGenAvatars
app.http('listHeyGenAvatars', {
  methods: ['GET'], route: 'listHeyGenAvatars', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    try {
      if (avatarsCache && Date.now() - avatarsCache.at < CACHE_TTL_MS) {
        return { status: 200, jsonBody: { avatars: avatarsCache.data, cached: true } }
      }
      const key = process.env.HEYGEN_API_KEY
      if (!key) return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
      const res = await fetch('https://api.heygen.com/v2/avatars', { headers: { 'x-api-key': key } })
      const data: any = await res.json()
      ctx.log(`HeyGen avatars call: status ${res.status}, avatars=${data?.data?.avatars?.length ?? 'n/a'}`)
      // This used to always fall through to "success" with whatever data.data
      // happened to contain, even when HeyGen rejected the request outright
      // (bad/expired key, wrong plan/scope, rate limited, etc). That made a
      // real API error look EXACTLY like "this account genuinely has zero
      // avatars" on the frontend — same empty list, no error surfaced. Now a
      // non-OK response is reported as a real error instead of silently
      // becoming an empty avatar list.
      if (!res.ok) {
        return { status: res.status, jsonBody: { error: data?.error?.message || data?.message || data?.error || 'HeyGen API error — check HEYGEN_API_KEY is valid and has avatar access' } }
      }
      // Include talking photos too (custom photo avatars live in a separate
      // array with a different id field) — normalized to avatar_id so the
      // Visual Designer preview and video pipeline can find them by one key.
      const rawList = [
        ...(data?.data?.avatars ?? []),
        ...(data?.data?.talking_photos ?? []).map((tp: any) => ({
          ...tp,
          avatar_id: tp.talking_photo_id,
          avatar_name: tp.talking_photo_name || tp.name || 'Talking Photo',
          is_talking_photo: true,
        })),
      ]
      const avatars = rawList.map((a: any) => ({
        ...a,
        // HeyGen returns 'preview_image_url' in their response, but ensure it's available
        preview_image_url: a.preview_image_url || a.preview_picture_url || a.thumbnail_url || a.image_url || '',
        // Motion preview, when HeyGen provides one — the only fully reliable
        // way to see an avatar's real framing before spending a render on it
        // (see classifyAvatarFraming: the name-based label is best-effort).
        preview_video_url: a.preview_video_url || '',
        framing: classifyAvatarFraming(a),
      }))
      avatarsCache = { at: Date.now(), data: avatars }
      return { status: 200, jsonBody: { avatars } }
    } catch (e: any) { ctx.error(e); return { status: 500, jsonBody: { error: e?.message } } }
  },
})

// GET /api/listElevenLabsVoices
app.http('listElevenLabsVoices', {
  methods: ['GET'], route: 'listElevenLabsVoices', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    try {
      if (voicesCache && Date.now() - voicesCache.at < CACHE_TTL_MS) {
        return { status: 200, jsonBody: { voices: voicesCache.data, cached: true } }
      }
      const key = process.env.ELEVENLABS_API_KEY
      if (!key) return { status: 500, jsonBody: { error: 'ELEVENLABS_API_KEY not configured' } }
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
      const data: any = await res.json()
      ctx.log(`ElevenLabs returned ${data?.voices?.length ?? 0} voices, status: ${res.status}`)
      if (!res.ok) return { status: res.status, jsonBody: { error: data?.detail?.message || 'Voice API error' } }
      const voices = data?.voices ?? []
      voicesCache = { at: Date.now(), data: voices }
      return { status: 200, jsonBody: { voices } }
    } catch (e: any) { ctx.error(e); return { status: 500, jsonBody: { error: e?.message } } }
  },
})
