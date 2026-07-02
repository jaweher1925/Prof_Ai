/**
 * POST /api/generateHeyGenAvatar
 *
 * Step 5 of the pipeline — Voice to Video (expensive, last).
 * Renders visual slides + TTS audio into video.
 * 
 * For now: Voice-only (no HeyGen avatar overlay yet)
 * Simply: Convert slideDesign + audio → video
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { parse } from 'path'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import {
  renderSegmentsToVideo,
  overlayAvatarOnVideo,
  localPathFromUploadUrl,
  extractAudioTrack,
} from '../../lib/ffmpegVideo'
import { generateAvatarClip } from '../../lib/heygenAvatar'

/**
 * Talking-avatar overlay (#40): if the project has a HeyGen avatar selected
 * (Avatar Studio / Casting Settings) and an API key is configured, generate a
 * lip-synced presenter from the scene's TTS audio and composite it
 * bottom-right — exactly where the Visual Designer preview shows it.
 * Any failure falls back to the slide-only video so rendering never breaks.
 */
async function tryAddAvatar(
  context: InvocationContext,
  slideVideoUrl: string,
  audioUrls: string[],
  moduleId: string
): Promise<string> {
  try {
    if (!process.env.HEYGEN_API_KEY) {
      context.log('[generateHeyGenAvatar] No HEYGEN_API_KEY — skipping avatar overlay')
      return slideVideoUrl
    }
    const module_ = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { project: true },
    })
    const project = module_?.project
    if (!project?.defaultAvatarId) {
      context.log('[generateHeyGenAvatar] No avatar selected on project — skipping avatar overlay')
      return slideVideoUrl
    }

    const basePath = localPathFromUploadUrl(slideVideoUrl)
    if (!basePath) {
      context.warn('[generateHeyGenAvatar] Slide video not found locally — skipping avatar overlay')
      return slideVideoUrl
    }

    // Drive the avatar from the FINAL video's own audio track (not the raw
    // TTS files) so lip-sync stays exact even though crossfade transitions
    // shorten the timeline. Falls back to the raw TTS audio if extraction
    // fails for any reason.
    let audioPaths: string[]
    try {
      audioPaths = [await extractAudioTrack(basePath)]
    } catch {
      audioPaths = audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p)
    }
    if (!audioPaths.length) {
      context.warn('[generateHeyGenAvatar] No audio available — skipping avatar overlay')
      return slideVideoUrl
    }

    context.log(`[generateHeyGenAvatar] Generating HeyGen avatar (${project.defaultAvatarId}) — cached if narration unchanged, otherwise a few minutes…`)
    const avatarPath = await generateAvatarClip({
      audioPaths,
      avatarId: project.defaultAvatarId,
      avatarStyle: project.avatarStyle,
      avatarBackground: project.avatarBackground,
      // Cache key = the raw TTS files: stable across re-renders, changes
      // exactly when the narration audio actually changes
      cacheKeyFiles: audioUrls
        .map(u => localPathFromUploadUrl(u))
        .filter((p): p is string => !!p),
    })

    const finalPath = await overlayAvatarOnVideo(basePath, avatarPath)
    const finalUrl = `/api/uploads/${parse(finalPath).base}`
    context.log(`[generateHeyGenAvatar] ✅ Avatar composited: ${finalUrl}`)
    return finalUrl
  } catch (err: any) {
    context.warn(`[generateHeyGenAvatar] Avatar overlay failed — using slide-only video: ${err?.message}`)
    return slideVideoUrl
  }
}

async function generateHeyGenAvatarHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { scene_id?: string }

    if (!body.scene_id) {
      return { status: 400, jsonBody: { error: 'scene_id is required' } }
    }

    // Get scene with module and segments (explicitly select all segment fields)
    const scene = await prisma.scene.findUnique({
      where: { id: body.scene_id },
      include: {
        module: true,
        segments: { 
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            text: true,
            slideDesign: true,
            ttsAudioUrl: true,
            textAnimationTimings: true,
            segmentType: true,
          }
        },
      },
    })

    if (!scene) {
      return { status: 404, jsonBody: { error: 'Scene not found' } }
    }

    const hasSegments = scene.segments.length > 0

    if (hasSegments) {
      // Validate all segments have audio
      const missingAudio = scene.segments.find(s => !s.ttsAudioUrl)
      if (missingAudio) {
        return { status: 400, jsonBody: { error: `Segment ${missingAudio.id}: No TTS audio. Run TTS generation first.` } }
      }
      
      // Cast segments to RenderableSegment format
      const segments = scene.segments.map(s => ({
        id: s.id,
        text: s.text,
        slideDesign: s.slideDesign || '{}',
        ttsAudioUrl: s.ttsAudioUrl || '',
        textAnimationTimings: s.textAnimationTimings || null,
        motionId: scene.textAnimationType || 'word-by-word',
      }))

      context.log(`[generateHeyGenAvatar] Rendering ${segments.length} segments for scene ${body.scene_id}`)

      t