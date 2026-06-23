/**
 * POST /api/generateTTS
 *
 * Step 3 of the pipeline — Text to Voice.
 *
 * #32 update: a scene is now made of one or more ordered SceneSegment rows
 * (see schema.prisma's SceneSegment doc comment + scriptGeneratorAgent.ts).
 * Each segment gets its OWN ElevenLabs call and its OWN ttsAudioUrl, so the
 * render pipeline can later stitch per-segment clips together (see
 * renderSceneSegmentsVideo in ffmpegVideo.ts). Pass segment_id to
 * regenerate just one segment's voice (e.g. after editing its text in the
 * Visual Designer); omit it to (re)generate every segment that's missing
 * audio. Scenes with no segments yet (old data) fall back to the original
 * single-call-per-scene behavior unchanged.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { uploadBuffer } from '../../lib/storage'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel
const DEFAULT_MODEL = 'eleven_multilingual_v2'

interface VoiceSettings {
  stability?: number
  similarity_boost?: number
  style?: number
  use_speaker_boost?: boolean
  speed?: number
}

/** One ElevenLabs call → uploaded mp3 URL. Throws on API failure. */
async function synthesize(text: string, voiceId: string, apiKey: string, settings?: VoiceSettings): Promise<string> {
  const ttsResponse = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: DEFAULT_MODEL,
      voice_settings: {
        stability:        settings?.stability        ?? 0.5,
        similarity_boost: settings?.similarity_boost ?? 0.8,
        style:            settings?.style            ?? 0.3,
        use_speaker_boost: settings?.use_speaker_boost ?? true,
        speed:            settings?.speed            ?? 1.0,
      },
    }),
  })
  if (!ttsResponse.ok) {
    const errText = await ttsResponse.text()
    throw new Error(`Voice API error: ${errText}`)
  }
  const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer())
  return uploadBuffer(audioBuffer, 'mp3', 'audio/mpeg')
}

async function generateTTSHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  let sceneIdForCleanup: string | undefined

  try {
    const body = (await request.json()) as {
      scene_id?: string
      segment_id?: string
      voice_id?: string
      override_text?: string
      voice_settings?: VoiceSettings
    }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }
    sceneIdForCleanup = body.scene_id

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return { status: 500, jsonBody: { error: 'ELEVENLABS_API_KEY not configured' } }
    }

    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: { segments: { orderBy: { orderIndex: 'asc' } } },
    })
    if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

    // Get voice ID — from body, or from project default, or use default
    let voiceId = body.voice_id || DEFAULT_VOICE_ID
    // Voice settings (stability/style/speed) — from body, or from the Avatar
    // Studio's saved project defaults (#37), so sliders set there apply to
    // every scene without having to be passed on each call.
    let voiceSettings = body.voice_settings
    if (!body.voice_id || !voiceSettings) {
      const module = await prisma.module.findUnique({
        where: { id: scene.moduleId },
        include: { project: true },
      })
      if (!body.voice_id && module?.project?.defaultVoiceId) {
        voiceId = module.project.defaultVoiceId
      }
      if (!voiceSettings && module?.project?.voiceSettings) {
        try { voiceSettings = JSON.parse(module.project.voiceSettings) } catch { /* malformed JSON — use ElevenLabs defaults */ }
      }
    }

    await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_generating' } })

    // Per-segment path
    if (scene.segments.length > 0) {
      const targets = body.segment_id
        ? scene.segments.filter(s => s.id === body.segment_id)
        : scene.segments

      if (body.segment_id && targets.length === 0) {
        await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'assets_ready' } })
        return { status: 404, jsonBody: { error: 'Segment not found on this scene' } }
      }

      context.log(`Generating TTS for ${targets.length} segment(s) of scene ${body.scene_id} with voice ${voiceId}`)

      const generated: { segment_id: string; tts_audio_url: string }[] = []
      for (const seg of targets) {
        const text = (body.segment_id && body.override_text) || seg.text
        const audioUrl = await synthesize(text, voiceId, apiKey, voiceSettings)
        await prisma.sceneSegment.update({ where: { id: seg.id }, data: { ttsAudioUrl: audioUrl } })
        generated.push({ segment_id: seg.id, tts_audio_url: audioUrl })
      }

      // Back-compat: keep scene.ttsAudioUrl pointing at the first segment's
      // clip so older code paths that only check the scene-level field still
      // see "this scene has audio".
      const allSegments = await prisma.sceneSegment.findMany({ where: { sceneId: body.scene_id }, orderBy: { orderIndex: 'asc' } })
      const firstAudio = allSegments.find(s => s.ttsAudioUrl)?.ttsAudioUrl
      const allHaveAudio = allSegments.every(s => !!s.ttsAudioUrl)

      await prisma.scene.update({
        where: { id: body.scene_id },
        data: {
          ttsAudioUrl: firstAudio ?? scene.ttsAudioUrl,
          status: allHaveAudio ? 'assets_ready' : 'assets_generating',
        },
      })

      context.log(`TTS generated for scene ${body.scene_id}: ${generated.length} segment(s)`)

      return {
        status: 200,
        jsonBody: {
          success: true,
          scene_id: body.scene_id,
          segments: generated,
          tts_audio_url: firstAudio ?? null,
        },
      }
    }

    // Legacy single-clip path (no segments on this scene)
    if (!scene.scriptContent) {
      await prisma.scene.update({ where: { id: body.scene_id }, data: { status: 'draft' } })
      return { status: 400, jsonBody: { error: 'Scene has no script content yet' } }
    }

    context.log(`Generating TTS for scene ${body.scene_id} with voice ${voiceId}`)

    const audioUrl = await synthesize(body.override_text || scene.scriptContent, voiceId, apiKey, voiceSettings)

    await prisma.scene.update({
      where: { id: body.scene_id },
      data: { ttsAudioUrl: audioUrl, status: 'assets_ready' },
    })

    context.log(`TTS generated for scene ${body.scene_id}: ${audioUrl}`)

    return {
      status: 200,
      jsonBody: { success: true, scene_id: body.scene_id, tts_audio_url: audioUrl },
    }
  } catch (error: any) {
    context.error('generateTTS error:', error)
    if (sceneIdForCleanup) {
      try { await prisma.scene.update({ where: { id: sceneIdForCleanup }, data: { status: 'draft' } }) } catch {}
    }
    return { status: 500, jsonBody: { error: error.message || 'TTS generation failed' } }
  }
}

app.http('generateTTS', {
  methods: ['POST'],
  route: 'generateTTS',
  authLevel: 'anonymous',
  handler: generateTTSHandler,
})
