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
        preview_image_url: a.preview_image_url || a.preview_picture_url || a.thumbnail_url || a.image_url || ''
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
