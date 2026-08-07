import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// ═══════════════════════════════════════════════════════════════════════════
// Per Scene Scripting (HITL) — sync Script.sections edits into the actual
// render-pipeline rows.
//
// script.sections is a "review record" the ScriptsPanel reads/writes — it is
// NOT what downstream stages consume. Voice generation (generateTTS.ts) reads
// SceneSegment.text (or Scene.scriptContent as a legacy fallback for scenes
// with no segments); Visual Designer / video rendering read
// SceneSegment.slideDesign (buildSlide()'s shape) and SceneSegment.imagePrompt
// (used to generate an image from a written description). Without this sync,
// edits made in ScriptsPanel look saved but never reach voice/visual/video —
// mirrors the same category of gap compositions.ts's syncCompositionToSegment
// already closes for the Visual Designer.
// ═══════════════════════════════════════════════════════════════════════════

interface ContentBlockLite { text: string; keyPoints: string[] }

function blocksToSlideBullets(blocks: ContentBlockLite[] | undefined): Array<{ text: string; level: 1 | 2 }> {
  const items: Array<{ text: string; level: 1 | 2 }> = []
  for (const b of blocks || []) {
    if (b.text?.trim()) items.push({ text: b.text, level: 1 })
    for (const kp of b.keyPoints || []) {
      if (kp?.trim()) items.push({ text: kp, level: 2 })
    }
  }
  return items
}

async function syncScriptSectionsToScenes(moduleId: string | null, sectionsRaw: string, ctx: InvocationContext) {
  if (!moduleId) return
  let sections: any
  try { sections = JSON.parse(sectionsRaw || '{}') } catch { return }
  // Legacy flat-array scripts predate the module/scene-kind ordering this
  // sync relies on — skip rather than guess a possibly-wrong mapping.
  if (Array.isArray(sections)) return

  const scenes = await prisma.scene.findMany({
    where: { moduleId },
    orderBy: { orderIndex: 'asc' },
    include: { segments: { orderBy: { orderIndex: 'asc' } } },
  })

  // ── Welcome: one Scene, one SceneSegment per welcome.segments[i] ──
  const welcomeScene = scenes.find(s => s.sceneKind === 'welcome')
  const welcomeSegments = sections.welcome?.segments
  if (welcomeScene && Array.isArray(welcomeSegments)) {
    for (let i = 0; i < welcomeSegments.length; i++) {
      const seg = welcomeSegments[i]
      const target = welcomeScene.segments[i]
      if (!target) continue
      const bulletItems = blocksToSlideBullets(seg.content_blocks)
      let design: any = {}
      try { design = JSON.parse(target.slideDesign || '{}') } catch { design = {} }
      await prisma.sceneSegment.update({
        where: { id: target.id },
        data: {
          text: seg.text ?? target.text,
          ...(bulletItems.length ? {
            elements: JSON.stringify(bulletItems.map(b => ({ type: 'bullet', text: b.text, level: b.level }))),
            slideDesign: JSON.stringify({ ...design, blocks: [{ type: 'bullets', items: bulletItems }] }),
          } : {}),
          ...(seg.image_description !== undefined ? { imagePrompt: seg.image_description } : {}),
        },
      }).catch(e => ctx.warn(`syncScriptSectionsToScenes: welcome segment ${target.id} sync failed: ${e}`))
    }
    // Keep Scene.scriptContent in sync too (legacy fallback path in generateTTS.ts).
    await prisma.scene.update({
      where: { id: welcomeScene.id },
      data: { scriptContent: welcomeSegments.map((s: any) => s.text).join(' ') },
    }).catch(e => ctx.warn(`syncScriptSectionsToScenes: welcome scene sync failed: ${e}`))
  }

  // ── Content scenes: one Scene per content_scenes[i], one SceneSegment per
  // content_scenes[i].segments[j] — each key point is its own segment (own
  // narration, own single-point slide), same shape as the welcome sync
  // above. Falls back to the pre-migration flat script_content/slide_content
  // shape for scripts generated before this change, so old projects don't
  // break when their scripts are edited/saved again.
  const contentScenesData = sections.content_scenes
  const contentScenes = scenes.filter(s => s.sceneKind === 'content')
  if (Array.isArray(contentScenesData)) {
    for (let i = 0; i < contentScenesData.length; i++) {
      const s = contentScenesData[i]
      const scene = contentScenes[i]
      if (!scene) continue

      if (Array.isArray(s.segments)) {
        for (let j = 0; j < s.segments.length; j++) {
          const seg = s.segments[j]
          const target = scene.segments[j]
          if (!target) continue
          const bulletItems = blocksToSlideBullets(seg.content_blocks)
          let design: any = {}
          try { design = JSON.parse(target.slideDesign || '{}') } catch { design = {} }
          await prisma.sceneSegment.update({
            where: { id: target.id },
            data: {
              text: seg.text ?? target.text,
              ...(seg.slide_title !== undefined ? { slideTitle: seg.slide_title } : {}),
              ...(bulletItems.length ? {
                elements: JSON.stringify(bulletItems.map(b => ({ type: 'bullet', text: b.text, level: b.level }))),
                slideDesign: JSON.stringify({
                  ...design,
                  ...(seg.slide_title !== undefined ? { subtitle: seg.slide_title } : {}),
                  blocks: [{ type: 'bullets', items: bulletItems }],
                }),
              } : (seg.slide_title !== undefined ? {
                slideDesign: JSON.stringify({ ...design, subtitle: seg.slide_title }),
              } : {})),
              ...(seg.image_description !== undefined ? { imagePrompt: seg.image_description } : {}),
            },
          }).catch(e => ctx.warn(`syncScriptSectionsToScenes: content segment ${target.id} sync failed: ${e}`))
        }
        await prisma.scene.update({
          where: { id: scene.id },
          data: { scriptContent: s.segments.map((seg: any) => seg.text).join(' ') },
        }).catch(e => ctx.warn(`syncScriptSectionsToScenes: content scene ${scene.id} sync failed: ${e}`))
        continue
      }

      // ── Back-compat: pre-migration flat shape (one bundled segment) ──
      const bulletItems = blocksToSlideBullets(s.content_blocks)
      const keyInsight: string | undefined = s.slide_content?.subtitle
      const hasDesignUpdate = bulletItems.length > 0 || keyInsight !== undefined
      const primarySegment = scene.segments[0]

      let sceneDesign: any = {}
      try { sceneDesign = JSON.parse(scene.slideDeckContent || '{}') } catch { sceneDesign = {} }

      await prisma.scene.update({
        where: { id: scene.id },
        data: {
          scriptContent: s.script_content ?? scene.scriptContent,
          ...(s.image_description !== undefined ? { visualPrompt: s.image_description } : {}),
          ...(hasDesignUpdate ? {
            slideDeckContent: JSON.stringify({
              ...sceneDesign,
              ...(keyInsight !== undefined ? { subtitle: keyInsight } : {}),
              ...(bulletItems.length ? { blocks: [{ type: 'bullets', items: bulletItems }] } : {}),
            }),
          } : {}),
        },
      }).catch(e => ctx.warn(`syncScriptSectionsToScenes: content scene ${scene.id} sync failed: ${e}`))

      if (primarySegment) {
        let segDesign: any = {}
        try { segDesign = JSON.parse(primarySegment.slideDesign || '{}') } catch { segDesign = {} }
        await prisma.sceneSegment.update({
          where: { id: primarySegment.id },
          data: {
            text: s.script_content ?? primarySegment.text,
            ...(hasDesignUpdate ? {
              slideDesign: JSON.stringify({
                ...segDesign,
                ...(keyInsight !== undefined ? { subtitle: keyInsight } : {}),
                ...(bulletItems.length ? { blocks: [{ type: 'bullets', items: bulletItems }] } : {}),
              }),
            } : {}),
            ...(s.image_description !== undefined ? { imagePrompt: s.image_description } : {}),
          },
        }).catch(e => ctx.warn(`syncScriptSectionsToScenes: content segment ${primarySegment.id} sync failed: ${e}`))
      }
    }
  }
}

// GET /api/scripts/{id}
app.http('getScript', {
  methods: ['GET'], route: 'scripts/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const script = await prisma.script.findUnique({ where: { id: req.params.id } })
      if (!script) return { status: 404, jsonBody: { error: 'Not found' } }
      return { status: 200, jsonBody: script }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/scripts/{id}
app.http('updateScript', {
  methods: ['PATCH'], route: 'scripts/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      const script = await prisma.script.findUnique({ where: { id: req.params.id } })
      if (!script) return { status: 404, jsonBody: { error: 'Script not found' } }

      // Phase 1 HITL: Cannot edit sections if script is locked
      if (script.locked && body.sections !== undefined) {
        return { status: 403, jsonBody: { error: 'Script is locked. Cannot edit content.' } }
      }

      // Validate approval status transition
      if (body.approvalStatus === 'locked') {
        if (script.approvalStatus !== 'approved') {
          return { status: 400, jsonBody: { error: 'Script must be approved before locking.' } }
        }
      }

      // Build update data with lock tracking
      const updateData: any = {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.sections !== undefined && { sections: body.sections }),
        ...(body.learning_objectives !== undefined && { learningObjectives: body.learning_objectives }),
        ...(body.approvalStatus !== undefined && {
          approvalStatus: body.approvalStatus,
          // If locking, set lock metadata
          ...(body.approvalStatus === 'locked' && {
            locked: true,
            lockedAt: new Date(),
            lockedBy: getUser(req),
          }),
        }),
      }

      const updatedScript = await prisma.script.update({
        where: { id: req.params.id },
        data: updateData,
      })

      // Per Scene Scripting (HITL): propagate sections edits into the actual
      // Scene/SceneSegment rows voice/visual/video read. Best-effort — never
      // block the sections save itself on a sync failure.
      if (body.sections !== undefined) {
        await syncScriptSectionsToScenes(updatedScript.moduleId, body.sections, ctx)
          .catch(e => ctx.warn(`syncScriptSectionsToScenes failed: ${e}`))
      }

      return { status: 200, jsonBody: updatedScript }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
