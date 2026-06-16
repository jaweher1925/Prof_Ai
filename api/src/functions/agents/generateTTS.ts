/**
 * POST /api/generateTTS
 *
 * Step 3 of the pipeline — Text to Voice.
 * Takes a scene's script_content and generates an audio file
 * using the voice synthesis API.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel
const DEFAULT_MODEL = 'eleven_multilingual_v2'

async function generateTTSHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      scene_id?: string
      voice_id?: string
      override_text?: string
      voice_settings?: {
        stability?: number
        similarity_boost?: number
        style?: number
        use_speaker_boost?: boolean
        speed?: number
      }
    }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'ELEVENLABS_API_KEY not configured' } }
    }

    // Get the scene
    const scene = await prisma.scene.findUnique({ where: { id: body.scene_id } })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }
    if (!scene.scriptContent) {
      return { status: 400, jsonBody: { error: 'Scene has no script content yet' } }
    }

    // Get voice ID — from body, or from project default, or use default
    let voiceId = body.voice_id || DEFAULT_VOICE_ID
    if (!body.voice_id) {
      const module = await prisma.module.findUnique({
        where: { id: scene.moduleId },
        include: { project: true },
      })
      if (module?.project?.defaultVoiceId) {
        voiceId = module.project.defaultVoiceId
      }
    }

    // Update scene status to generating
    await prisma.scene.update({
      where: { id: body.scene_id },
      data: { status: 'assets_generating' },
    })

    context.log(`Generating TTS for scene ${body.scene_id} with voice ${voiceId}`)

    // Call voice API
    const ttsResponse = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: body.override_text || scene.scriptContent,
        model_id: DEFAULT_MODEL,
        voice_settings: {
          stability:        body.voice_settings?.stability        ?? 0.5,
          similarity_boost: body.voice_settings?.similarity_boost ?? 0.8,
          style:            body.voice_settings?.style            ?? 0.3,
          use_speaker_boost: body.voice_settings?.use_speaker_boost ?? true,
          speed:            body.voice_settings?.speed            ?? 1.0,
        },
      }),
    })

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text()
      context.error('Voice API error:', errText)
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'draft' } })
      return { status: ttsResponse.status, jsonBody: { error: `Voice API error: ${errText}` } }
    }

    // Save the audio file
    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer())
    const audioUrl = await uploadBuffer(audioBuffer, 'mp3', 'audio/mpeg')

    // Update scene with audio URL
    const updatedScene = await prisma.scene.update({
      where: { id: body.scene_id },
      data: {
        ttsAudioUrl: audioUrl,
        status: 'assets_ready',
      },
    })

    context.log(`TTS generated for scene ${body.scene_id}: ${audioUrl}`)

    return {
      status: 200,
      jsonBody: {
        success: true,
        scene_id: body.scene_id,
        tts_audio_url: audioUrl,
      },
    }
  } catch (error: any) {
    context.error('generateTTS error:', error)
    // Reset scene status on failure
    try {
      const { scene_id } = (await request.json() as any)
      await prisma.scene.update({ where: { id: scene_id }, data: { status: 'draft' } })
    } catch {}
    return { status: 500, jsonBody: { error: error.message || 'TTS generation failed' } }
  }
}

app.http('generateTTS', {
  methods: ['POST'],
  route: 'generateTTS',
  authLevel: 'anonymous',
  handler: generateTTSHandler,
})
