/**
 * POST /api/mergeModuleVideo
 *
 * Concatenates every scene's rendered video in a module, in scene order,
 * into one full module video — so a module of 5-8 short scene clips becomes
 * a single playable video. Requires every scene in the module to already
 * have a rendered video (avatar or voice-only — either is fine).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { parse } from 'path'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { concatVideos, localVideoPathFromUploadUrl } from '../../lib/ffmpegVideo'
import { deleteOldUpload } from '../../lib/uploadCleanup'

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
    // concatVideos() always returns a local disk path (e.g.
    // C:\...\api\uploads\xxx_scene.mp4 or /home/site/wwwroot/uploads/xxx_scene.mp4
    // inside the container) — it's meant for ffmpeg's own use, never for a browser.
    // Saving that raw path directly into Module.fullVideoUrl (as this used to do)
    // made every finished module show a black, unplayable video: browsers refuse
    // to load file:///C:/... URLs for security. Every other place in this codebase
    // converts to the web-servable /api/uploads/{filename} form before persisting
    // or returning a video URL — this was the one spot that didn't.
    const localFullVideoPath = await concatVideos(localPaths)
    const fullVideoUrl = `/api/uploads/${parse(localFullVideoPath).base}`

    // Re-merging a module (e.g. after editing/regenerating one scene) always
    // produces a brand new concatenated file — without this, the PREVIOUS
    // full module video was never deleted and just sat in uploads/ forever.
    const previousModule = await prisma.module.findUnique({ where: { id: body.module_id }, select: { fullVideoUrl: true } })

    await prisma.module.update({
      where: { id: body.module_id },
      data: { fullVideoUrl },
    })
    deleteOldUpload(previousModule?.fullVideoUrl, fullVideoUrl)

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
