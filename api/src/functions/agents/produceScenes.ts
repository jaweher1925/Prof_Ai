/**
 * POST /api/produceScenes
 *
 * Bulk orchestrator — triggers TTS + Visual generation for ALL scenes
 * in a project or module at once.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'

async function produceScenesHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      project_id?: string
      module_id?: string
      generate_audio?: boolean
      generate_visual?: boolean
    }

    if (!body.project_id && !body.module_id) {
      return { status: 400, jsonBody: { error: 'project_id or module_id is required' } }
    }

    const generateAudio = body.generate_audio !== false // default true
    const generateVisual = body.generate_visual !== false // default true

    // Find all scenes to produce
    let scenes
    if (body.module_id) {
      scenes = await prisma.scene.findMany({
        where: { moduleId: body.module_id, status: { in: ['draft', 'assets_ready'] } },
        orderBy: { orderIndex: 'asc' },
      })
    } else {
      scenes = await prisma.scene.findMany({
        where: {
          module: { projectId: body.project_id! },
          status: { in: ['draft', 'assets_ready'] },
        },
        include: { module: true },
        orderBy: { orderIndex: 'asc' },
      })
    }

    if (scenes.length === 0) {
      return { status: 400, jsonBody: { error: 'No scenes found to produce' } }
    }

    const baseUrl = `http://localhost:7071/api`
    const results = []

    for (const scene of scenes) {
      const sceneResult: Record<string, unknown> = { scene_id: scene.id, tasks: [] }

      // Queue TTS generation
      if (generateAudio && scene.scriptContent && !scene.ttsAudioUrl) {
        try {
          const ttsRes = await fetch(`${baseUrl}/generateTTS`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_id: scene.id }),
          })
          const ttsData = await ttsRes.json() as { success?: boolean }
          ;(sceneResult.tasks as string[]).push(ttsData.success ? 'tts:ok' : `tts:error`)
          context.log(`TTS for scene ${scene.id}: ${ttsData.success ? 'ok' : 'failed'}`)
        } catch (e: any) {
          ;(sceneResult.tasks as string[]).push(`tts:error:${e.message}`)
        }
      }

      // Queue visual generation
      if (generateVisual && scene.visualPrompt && !scene.visualAssetUrl) {
        try {
          const vizRes = await fetch(`${baseUrl}/generateSceneAsset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_id: scene.id }),
          })
          const vizData = await vizRes.json() as { success?: boolean }
          ;(sceneResult.tasks as string[]).push(vizData.success ? 'visual:ok' : `visual:error`)
          context.log(`Visual for scene ${scene.id}: ${vizData.success ? 'ok' : 'failed'}`)
        } catch (e: any) {
          ;(sceneResult.tasks as string[]).push(`visual:error:${e.message}`)
        }
      }

      results.push(sceneResult)
    }

    // Update project/module status
    if (body.project_id) {
      await prisma.project.update({
        where: { id: body.project_id },
        data: { status: 'in_production' },
      })
    }

    return {
      status: 200,
      jsonBody: {
        success: true,
        scenes_processed: scenes.length,
        results,
      },
    }
  } catch (error: any) {
    context.error('produceScenes error:', error)
    return { status: 500, jsonBody: { error: error.message } }
  }
}

app.http('produceScenes', {
  methods: ['POST'],
  route: 'produceScenes',
  authLevel: 'anonymous',
  handler: produceScenesHandler,
})
