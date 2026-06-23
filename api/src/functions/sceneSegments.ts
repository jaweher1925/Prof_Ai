/**
 * Scene segment routes (#32).
 *
 * Each Scene is made of one or more ordered SceneSegment rows (see
 * scriptGeneratorAgent.ts's doc comment + schema.prisma). These endpoints let
 * the Visual Designer's segment mini-timeline read/edit a single segment's
 * narration text, slide title, and elements without touching the rest of the
 * scene, and let generateTTS.ts target one segment for a voice regenerate.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// GET /api/scenes/{id}/segments — ordered list of a scene's segments
app.http('getSceneSegments', {
  methods: ['GET'], route: 'scenes/{id}/segments', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segments = await prisma.sceneSegment.findMany({
        where: { sceneId: req.params.id },
        orderBy: { orderIndex: 'asc' },
      })
      return { status: 200, jsonBody: segments }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/sceneSegments/{id} — edit one segment's narration/slide content
app.http('updateSceneSegment', {
  methods: ['PATCH'], route: 'sceneSegments/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      const segment = await prisma.sceneSegment.update({
        where: { id: req.params.id },
        data: {
          ...(body.text !== undefined && { text: body.text }),
          ...(body.slide_title !== undefined && { slideTitle: body.slide_title }),
          ...(body.elements !== undefined && { elements: typeof body.elements === 'string' ? body.elements : JSON.stringify(body.elements) }),
          // Per-segment slide design (#38) — title/subtitle/layout/theme/blocks,
          // same shape as Scene.slideDeckContent. Lets each segment (hook,
          // content, interaction, ...) keep its own slide instead of sharing
          // the whole scene's one design. See slideRenderer.ts + ffmpegVideo.ts.
          ...(body.slide_design !== undefined && { slideDesign: typeof body.slide_design === 'string' ? body.slide_design : JSON.stringify(body.slide_design) }),
          ...(body.image_prompt !== undefined && { imagePrompt: body.image_prompt }),
          ...(body.animation !== undefined && { animation: body.animation }),
          // Clear stale audio whenever the narration text changes so the UI can
          // tell this segment needs a voice regenerate before it's re-rendered.
          ...(body.text !== undefined && { ttsAudioUrl: null }),
        },
      })
      return { status: 200, jsonBody: segment }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

app.http('reorderSceneSegments', {
  methods: ['POST'], route: 'scenes/{id}/segments/reorder', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as { segment_ids?: string[] }
      if (!body.segment_ids?.length) return { status: 400, jsonBody: { error: 'segment_ids is required' } }
      await Promise.all(
        body.segment_ids.map((id, i) => prisma.sceneSegment.update({ where: { id }, data: { orderIndex: i } }))
      )
      return { status: 200, jsonBody: { success: true } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
