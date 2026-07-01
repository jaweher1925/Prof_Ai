import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../lib/auth'

// Both HeyGen avatars and ElevenLabs voices are near-static catalogs (they
// don't change between page loads), but every dropdown open was making a
// fresh live external API call — which is what made "select avatar" feel
// slow. A simple in-memory cache (process lives for the life of the Function
// host) makes every call after the first one instant.
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
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
      const avatars = (data?.data?.avatars ?? []).map((a: any) => ({
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
