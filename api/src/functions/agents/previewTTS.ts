/**
 * POST /api/previewTTS
 *
 * Generates a short audio preview with the given voice settings.
 * Returns the MP3 audio directly — no DB save, no file written to disk.
 * Used by the Voice Settings panel so professors can hear changes instantly.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../../lib/auth'
import { prisma } from '../../lib/db'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const DEFAULT_VOICE_ID   = '21m00Tcm4TlvDq8ikWAM' // Rachel
const DEFAULT_MODEL      = 'eleven_multilingual_v2'

const PREVIEW_TEXT =
  'This is a preview of how your voice narration will sound with the current settings. ' +
  'Adjust the sliders and click test again to compare.'

app.http('previewTTS', {
  methods: ['POST'],
  route: 'previewTTS',
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(request)
    if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) return { status: 500, jsonBody: { error: 'ELEVENLABS_API_KEY not configured' } }

    try {
      const body = (await request.json()) as {
        text?:          string
        voice_id?:      string
        project_id?:    string
        voice_settings?: {
          stability?:         number
          similarity_boost?:  number
          style?:             number
          use_speaker_boost?: boolean
          speed?:             number
        }
      }

      // Resolve voice ID: explicit → project default → Rachel
      let voiceId = body.voice_id || DEFAULT_VOICE_ID
      if (!body.voice_id && body.project_id) {
        const project = await prisma.project.findUnique({ where: { id: body.project_id } })
        if (project?.defaultVoiceId) voiceId = project.defaultVoiceId
      }

      const previewText = (body.text || PREVIEW_TEXT).slice(0, 300) // cap to ~300 chars for speed

      context.log(`Preview TTS — voice: ${voiceId}, stability: ${body.voice_settings?.stability}`)

      const ttsRes = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
        method:  'POST',
        headers: {
          'xi-api-key':   apiKey,
          'Content-Type': 'application/json',
          'Accept':       'audio/mpeg',
        },
        body: JSON.stringify({
          text:     previewText,
          model_id: DEFAULT_MODEL,
          voice_settings: {
            stability:         body.voice_settings?.stability         ?? 0.5,
            similarity_boost:  body.voice_settings?.similarity_boost  ?? 0.8,
            style:             body.voice_settings?.style             ?? 0.3,
            use_speaker_boost: body.voice_settings?.use_speaker_boost ?? true,
            speed:             body.voice_settings?.speed             ?? 1.0,
          },
        }),
      })

      if (!ttsRes.ok) {
        const err = await ttsRes.text()
        context.error('ElevenLabs preview error:', err)
        return { status: ttsRes.status, jsonBody: { error: `Voice API error: ${err}` } }
      }

      // Return audio binary directly — frontend creates a Blob URL and plays it
      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
      return {
        status:  200,
        body:    audioBuffer,
        headers: {
          'Content-Type':   'audio/mpeg',
          'Content-Length': String(audioBuffer.byteLength),
          'Cache-Control':  'no-store',
        },
      }
    } catch (e: any) {
      context.error('previewTTS error:', e)
      return { status: 500, jsonBody: { error: e?.message || 'Preview failed' } }
    }
  },
})
