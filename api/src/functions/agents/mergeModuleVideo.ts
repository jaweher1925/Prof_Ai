/**
 * POST /api/mergeModuleVideo
 *
 * Concatenates every scene's rendered video in a module, in scene order,
 * into one full module video — so a module of 5-8 short scene clips becomes
 * a single playable video. Requires every scene in the module to already
 * have a rendered video (avatar or voice-only — either is fine).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { concatVideos, localVideoPathFromUploadUrl } from '../../lib/ffmpegVideo'

async function mergeModuleVideoHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { module_id?: string }
    if (!body.module_id) {
      return { status: 400, jsonBody: { error: 'module_id is required' } }
    }

    const scenes = await prisma.scene.findMany({
      where: { moduleId: body.module_id },
      orderBy: { orderIndex: 'asc' },
    })

    if (!scenes.length) {
      return { status: 400, jsonBody: { error: 'This module has no scenes.' } }
    }

    const missing = scenes.filter((s) => !localVideoPathFromUploadUrl(s.avatarVideoUrl))
    if (missing.length) {
      return {
        status: 400,
        jsonBody: {
          error: `${missing.length} scene(s) don't have a rendered video yet. Generate every scene's video first.`,
        },
      }
    }

    const localPaths = scenes.map((s) => localVideoPathFromUploadUrl(s.avatarVideoUrl) as string)

    context.log(`Merging ${localPaths.length} scene videos for module ${body.module_id}`)
    const fullVideoUrl = await concatVideos(localPaths)

    await prisma.module.update({
      where: { id: body.module_id },
      data: { fullVideoUrl },
    })

    return { status: 200, jsonBody: { success: true, module_id: body.module_id, full_video_url: fullVideoUrl } }
  } catch (error: any) {
    context.error('mergeModuleVideo error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Module video merge failed' } }
  }
}

app.http('mergeModuleVideo', {
  methods: ['POST'],
  route: 'mergeModuleVideo',
  authLevel: 'anonymous',
  handler: mergeModuleVideoHandler,
})
