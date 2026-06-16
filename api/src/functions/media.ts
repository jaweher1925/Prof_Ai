import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../lib/auth'

// GET /api/listHeyGenAvatars
app.http('listHeyGenAvatars', {
  methods: ['GET'], route: 'listHeyGenAvatars', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    try {
      const key = process.env.HEYGEN_API_KEY
      if (!key) return { status: 500, jsonBody: { error: 'HEYGEN_API_KEY not configured' } }
      const res = await fetch('https://api.heygen.com/v2/avatars', { headers: { 'x-api-key': key } })
      const data: any = await res.json()
      return { status: 200, jsonBody: { avatars: data?.data?.avatars ?? [] } }
    } catch (e: any) { ctx.error(e); return { status: 500, jsonBody: { error: e?.message } } }
  },
})

// GET /api/listElevenLabsVoices
app.http('listElevenLabsVoices', {
  methods: ['GET'], route: 'listElevenLabsVoices', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    try {
      const key = process.env.ELEVENLABS_API_KEY
      if (!key) return { status: 500, jsonBody: { error: 'ELEVENLABS_API_KEY not configured' } }
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
      const data: any = await res.json()
      ctx.log(`ElevenLabs returned ${data?.voices?.length ?? 0} voices, status: ${res.status}`)
      if (!res.ok) return { status: res.status, jsonBody: { error: data?.detai