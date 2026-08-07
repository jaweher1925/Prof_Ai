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
import { deleteOldUpload } from '../lib/uploadCleanup'

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
      // See scenes.ts's updateScene for why: capture the pre-update URL so
      // the file it used to point at can be deleted once the new one is
      // safely saved — the Visual Designer's WYSIWYG snapshot save hits this
      // endpoint on every per-segment edit.
      const before = body.visual_asset_url !== undefined
        ? await prisma.sceneSegment.findUnique({ where: { id: req.params.id }, select: { visualAssetUrl: true } })
        : null
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
          // Per-segment WYSIWYG snapshot set straight from Visual Designer on
          // save — makes this part "ready" without a separate generate step.
          ...(body.visual_asset_url !== undefined && { visualAssetUrl: body.visual_asset_url }),
          ...(body.image_prompt !== undefined && { imagePrompt: body.image_prompt }),
          ...(body.animation !== undefined && { animation: body.animation }),
          // Clear stale audio whenever the narration text changes so the UI can
          // tell this segment needs a voice regenerate before it's re-rendered.
          ...(body.text !== undefined && { ttsAudioUrl: null }),
        },
      })
      if (before) deleteOldUpload(before.visualAssetUrl, segment.visualAssetUrl)
      return { status: 200, jsonBody: segment }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// DELETE /api/sceneSegments/{id} — remove ONE part (hook/content/recap/
// question) from a multi-part scene, without touching its siblings or the
// scene itself.
//
// Previously the ONLY way to remove a part was the Visual Designer's
// per-scene trash icon, which deletes the WHOLE Scene (cascading every
// sibling segment) — shown on the scene's first row. That made deleting the
// first part of a quiz (or welcome hook/content/recap) look like it deleted
// every OTHER part too, because it did: there was no way to remove a single
// part on its own (reported: "if I delete the first scene/question, why does
// it delete the others too?").
app.http('deleteSceneSegment', {
  methods: ['DELETE'], route: 'sceneSegments/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segment = await prisma.sceneSegment.findUnique({ where: { id: req.params.id } })
      if (!segment) return { status: 404, jsonBody: { error: 'Segment not found' } }

      const siblings = await prisma.sceneSegment.findMany({
        where: { sceneId: segment.sceneId },
        orderBy: { orderIndex: 'asc' },
      })
      // A scene must keep at least one part — removing the last one would
      // leave a Scene row with no narration/slide at all. Point the caller at
      // the existing whole-scene delete instead.
      if (siblings.length <= 1) {
        return { status: 400, jsonBody: { error: 'This is the only part left on this scene — delete the whole scene instead.' } }
      }

      await prisma.sceneSegment.delete({ where: { id: req.params.id } })
      // Cascades its SlideComposition row automatically (schema onDelete:
      // Cascade) — only the uploaded slide image file needs manual cleanup.
      deleteOldUpload(segment.visualAssetUrl, null)

      // Re-normalize remaining siblings' orderIndex so there's no gap — quiz
      // narration order and the Visual Designer's row numbering both depend
      // on a contiguous 0..N-1 sequence.
      const remaining = siblings.filter(s => s.id !== segment.id)
      await Promise.all(
        remaining.map((s, i) =>
          s.orderIndex === i ? null : prisma.sceneSegment.update({ where: { id: s.id }, data: { orderIndex: i } })
        )
      )

      const scene = await prisma.scene.findUnique({ where: { id: segment.sceneId } })

      // Quiz scenes keep a denormalized copy of their questions on
      // Scene.quizData (and derive durationSeconds from the question count)
      // — without this, deleting a question segment leaves quizData/duration
      // silently pointing at a question that no longer has a segment.
      if (scene?.sceneKind === 'quiz' && scene.quizData) {
        try {
          const questions = JSON.parse(scene.quizData)
          if (Array.isArray(questions) && questions[segment.orderIndex] !== undefined) {
            questions.splice(segment.orderIndex, 1)
            await prisma.scene.update({
              where: { id: scene.id },
              data: { quizData: JSON.stringify(questions), durationSeconds: questions.length * 12 },
            })
          }
        } catch (e: any) {
          ctx.warn(`deleteSceneSegment: could not prune quizData — ${e?.message}`)
        }
      }

      // Best-effort: prune the matching entry from the Script stage's review
      // copy too (welcome.segments[i] / quiz_scene.questions[i]) — mirrors
      // deleteScene's own script-section pruning below. Never blocks the
      // segment deletion above on failure.
      if (scene?.moduleId) {
        try {
          const script = await prisma.script.findFirst({ where: { moduleId: scene.moduleId } })
          if (script) {
            const sections = JSON.parse(script.sections || '{}')
            if (!Array.isArray(sections)) {
              let changed = false
              if (scene.sceneKind === 'welcome' && Array.isArray(sections.welcome?.segments)) {
                sections.welcome.segments.splice(segment.orderIndex, 1)
                changed = true
              } else if (scene.sceneKind === 'quiz' && Array.isArray(sections.quiz_scene?.questions)) {
                sections.quiz_scene.questions.splice(segment.orderIndex, 1)
                changed = true
              }
              if (changed) {
                await prisma.script.update({ where: { id: script.id }, data: { sections: JSON.stringify(sections) } })
              }
            }
          }
        } catch (e: any) {
          ctx.warn(`deleteSceneSegment: could not prune script sections — ${e?.message}`)
        }
      }

      return { status: 200, jsonBody: { success: true } }
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
