import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// GET /api/modules/{id}/scenes
app.http('getModuleScenes', {
  methods: ['GET'], route: 'modules/{id}/scenes', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id
      if (!moduleId) return { status: 400, jsonBody: { error: 'moduleId is required' } }
      
      // Get all scenes for this module — composition now lives PER SEGMENT
      // (#40), not per scene, so it's fetched below alongside each segment.
      const scenes = await prisma.scene.findMany({
        where: { moduleId },
        orderBy: { orderIndex: 'asc' },
      })

      // For each scene, get its segments — each carrying its OWN composition
      // (one editable slide per narrated part, e.g. a welcome scene's
      // hook/content/content/recap each get their own).
      const result = []
      for (const scene of scenes) {
        const segments = await prisma.sceneSegment.findMany({
          where: { sceneId: scene.id },
          orderBy: { orderIndex: 'asc' },
          include: { composition: true },
        }).catch(e => {
          ctx.warn(`Failed to fetch segments for scene ${scene.id}: ${e.message}`)
          return []
        })

        // If segments have no duration but have audio, estimate from text length
        const enrichedSegments = segments.map(seg => {
          if ((!seg.durationSeconds || seg.durationSeconds === 0) && seg.text) {
            // Estimate: ~3 words per second
            const wordCount = seg.text.trim().split(/\s+/).length
            const estimatedDuration = Math.max(1, Math.ceil(wordCount / 3))
            return { ...seg, durationSeconds: estimatedDuration }
          }
          return seg
        })

        // Legacy back-compat: slideComposition = the scene's primary
        // (first) segment's composition — panels that haven't moved to
        // per-segment editing yet (none currently) can keep reading this.
        result.push({
          ...scene,
          slideComposition: enrichedSegments[0]?.composition ?? null,
          segments: enrichedSegments
        })
      }
      
      return { status: 200, jsonBody: result }
    } catch (e) { 
      ctx.error('Error in getModuleScenes:', e)
      return err500(e) 
    }
  },
})

// PATCH /api/scenes/{id}
app.http('updateScene', {
  methods: ['PATCH'], route: 'scenes/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      const scene = await prisma.scene.update({
        where: { id: req.params.id },
        data: {
          ...(body.script_content !== undefined && { scriptContent: body.script_content }),
          ...(body.slide_deck_content !== undefined && { slideDeckContent: body.slide_deck_content }),
          // Set directly from the Visual Designer's WYSIWYG snapshot on save —
          // the snapshot IS the finished slide, so there's no separate/slow
          // "generate slide image" step needed to mark a scene ready.
          ...(body.visual_asset_url !== undefined && { visualAssetUrl: body.visual_asset_url }),
          // Editing a scene invalidates its previously-rendered video — the
          // Visual Design menu's green "Generated" tick is keyed on
          // avatarVideoUrl, so clearing it here makes the tick disappear the
          // moment the user changes a generated scene (they'd re-generate).
          ...(body.avatar_video_url !== undefined && { avatarVideoUrl: body.avatar_video_url }),
          ...(body.visual_prompt !== undefined && { visualPrompt: body.visual_prompt }),
          ...(body.text_animation_type !== undefined && { textAnimationType: body.text_animation_type }),
          ...(body.presenter_position !== undefined && { presenterPosition: body.presenter_position }),
          ...(body.status !== undefined && { status: body.status }),
          // Approval lock (#user-approve). Passing approved_at: null clears the
          // approval — the frontend does this the moment a user edits an already
          // approved scene, so the green "Approved" tick drops until they
          // re-approve. A non-null ISO string (or the /approve endpoint) sets it.
          ...(body.approved_at !== undefined && {
            approvedAt: body.approved_at ? new Date(body.approved_at) : null,
            ...(body.approved_at ? {} : { status: 'draft' }),
          }),
        },
      })
      return { status: 200, jsonBody: scene }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/modules/{id}/scenes — create a new blank scene appended to the end of the module
app.http('createScene', {
  methods: ['POST'], route: 'modules/{id}/scenes', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id
      const mod = await prisma.module.findUnique({ where: { id: moduleId } })
      if (!mod) return { status: 404, jsonBody: { error: 'Module not found' } }

      const last = await prisma.scene.findFirst({ where: { moduleId }, orderBy: { orderIndex: 'desc' } })
      const nextOrderIndex = last ? last.orderIndex + 1 : 0

      const scene = await prisma.scene.create({
        data: {
          moduleId,
          orderIndex: nextOrderIndex,
          scriptContent: '',
          slideDeckContent: null,
          status: 'draft',
        },
      })
      return { status: 201, jsonBody: scene }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// DELETE /api/scenes/{id} — removes a scene EVERYWHERE: the Scene row (which
// cascade-deletes its SceneSegments → their voice clips, slide designs and
// compositions), and the matching entry in the module's Script.sections so it
// doesn't linger in the Script stage or re-sync back. Nothing about this scene
// survives into any later step.
app.http('deleteScene', {
  methods: ['DELETE'], route: 'scenes/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const scene = await prisma.scene.findUnique({ where: { id: req.params.id } })
      if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

      // Where does this scene sit among its content-kind siblings? Needed to
      // remove the right entry from Script.sections.content_scenes below.
      const siblingsBefore = await prisma.scene.findMany({
        where: { moduleId: scene.moduleId },
        orderBy: { orderIndex: 'asc' },
      })
      const contentIndex = siblingsBefore
        .filter(s => s.sceneKind === 'content' && s.orderIndex < scene.orderIndex)
        .length

      // Delete the scene (cascades segments → voice + slide + composition).
      await prisma.scene.delete({ where: { id: req.params.id } })

      // Strip the matching section from the module's script so the Script stage
      // (and any re-sync) no longer knows about it. Best-effort — a failure
      // here must not undo the scene deletion above.
      if (scene.moduleId) {
        try {
          const script = await prisma.script.findFirst({ where: { moduleId: scene.moduleId } })
          if (script) {
            const sections = JSON.parse(script.sections || '{}')
            if (Array.isArray(sections)) {
              // Legacy flat array — remove by orderIndex position.
              sections.splice(scene.orderIndex, 1)
            } else if (scene.sceneKind === 'welcome') {
              delete sections.welcome
            } else if (scene.sceneKind === 'quiz') {
              delete sections.quiz_scene
            } else if (Array.isArray(sections.content_scenes)) {
              sections.content_scenes.splice(contentIndex, 1)
            }
            await prisma.script.update({ where: { id: script.id }, data: { sections: JSON.stringify(sections) } })
          }
        } catch (e: any) {
          ctx.warn(`deleteScene: could not prune script sections — ${e?.message}`)
        }
      }

      // Re-normalize remaining scenes' orderIndex so there's no gap.
      const siblings = await prisma.scene.findMany({
        where: { moduleId: scene.moduleId },
        orderBy: { orderIndex: 'asc' },
      })
      await Promise.all(
        siblings.map((s, i) =>
          s.orderIndex === i ? null : prisma.scene.update({ where: { id: s.id }, data: { orderIndex: i } })
        )
      )

      return { status: 200, jsonBody: { success: true } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scenes/{id}/approve
app.http('approveScene', {
  methods: ['POST'], route: 'scenes/{id}/approve', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const scene = await prisma.scene.findUnique({ where: { id: req.params.id } })
      if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

      await prisma.scene.update({ where: { id: req.params.id }, data: { status: 'approved', approvedAt: new Date() } })

      // Check if all sibling scenes are approved → update module
      const allScenes = await prisma.scene.findMany({ where: { moduleId: scene.moduleId } })
      const allApproved = allScenes.every((s) => s.status === 'approved')
      let moduleCompleted = false

      if (allApproved) {
        await prisma.module.update({ where: { id: scene.moduleId }, data: { status: 'assets_approved' } })
        moduleCompleted = true

        // Check if all modules in project are done → update project
        const parentModule = await prisma.module.findUnique({ where: { id: scene.moduleId }, select: { projectId: true } })
        if (parentModule) {
          const allModules = await prisma.module.findMany({ where: { projectId: parentModule.projectId } })
          const allDone = allModules.every((m) => ['assets_approved', 'completed'].includes(m.status))
          if (allDone) await prisma.project.update({ where: { id: parentModule.projectId }, data: { status: 'completed' } })
        }
      }

      return { status: 200, jsonBody: { success: true, module_completed: moduleCompleted } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scenes/{id}/ai-rewrite
// Rewrites slide bullet points using the LLM
app.http('aiRewriteScene', {
  methods: ['POST'], route: 'scenes/{id}/ai-rewrite', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as { prompt?: string; content?: string; title?: string }
      if (!body.prompt || !body.content) return { status: 400, jsonBody: { error: 'prompt and content required' } }

      const { generateJson } = await import('../lib/llm')
      const result = await generateJson<{ bullets: Array<{ text: string; level: number }> }>(
        `You are an educational content editor for presentation slides. ${body.prompt} Always respond with valid JSON only.`,
        `Slide title: "${body.title || ''}"
Current bullet points:
${body.content}

Return JSON with rewritten bullets:
{ "bullets": [{ "text": "string", "level": 1 or 2 }] }`,
        1024
      )
      return { status: 200, jsonBody: result }
    } catch (e: any) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scenes/{id}/rebuild-slide
// Rebuilds the whole slide content (title + key insight + content points)
// FROM the voice script, so the slide always matches what the narrator says.
app.http('rebuildSlideFromScript', {
  methods: ['POST'], route: 'scenes/{id}/rebuild-slide', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      const body = (await req.json()) as { script_text?: string }

      // Fall back to the scene's own script if the caller didn't send text
      let scriptText = body.script_text?.trim()
      if (!scriptText) {
        const scene = await prisma.scene.findUnique({ where: { id: sceneId } })
        scriptText = scene?.scriptContent?.trim() || ''
      }
      if (!scriptText) return { status: 400, jsonBody: { error: 'No script text available for this scene' } }

      const { generateJson } = await import('../lib/llm')
      const result = await generateJson<{
        title: string
        subtitle: string
        bullets: Array<{ text: string; level: number }>
      }>(
        `You are an educational slide designer. Given the narrator's voice script for one slide, ` +
        `produce the on-screen slide content that MATCHES it exactly — students read the slide ` +
        `while hearing this narration. Rules: the slide must only contain ideas actually present ` +
        `in the script; title is a short concept name (3-7 words); subtitle is the single key ` +
        `insight students should remember (one sentence, 8-16 words); 3-5 bullet points, each a ` +
        `complete meaningful idea of 8-16 words, in the same order the script presents them. ` +
        `Use the same language the script is written in. Always respond with valid JSON only.`,
        `Voice script for this slide:
"""
${scriptText.slice(0, 4000)}
"""

Return JSON:
{ "title": "string", "subtitle": "string", "bullets": [{ "text": "string", "level": 1 }] }`,
        1024
      )
      return { status: 200, jsonBody: result }
    } catch (e: any) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scenes/{id}/apply-theme-to-segments
// Applies a theme to ALL segments in a scene at once
app.http('applyThemeToSegments', {
  methods: ['POST'], route: 'scenes/{id}/apply-theme-to-segments', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      const body = (await req.json()) as { theme: string }
      if (!body.theme) return { status: 400, jsonBody: { error: 'theme is required' } }

      // Get all segments for this scene
      const segments = await prisma.sceneSegment.findMany({
        where: { sceneId },
        orderBy: { orderIndex: 'asc' },
      })

      // Apply theme to each segment's slideDesign, preserving layout and other properties
      const updated = await Promise.all(
        segments.map(seg => {
          try {
            const design = JSON.parse(seg.slideDesign || '{}')
            // Update only the theme, keep layout, positions, and other properties
            design.theme = body.theme
            // The saved WYSIWYG snapshot still shows the OLD theme — drop it so
            // the video re-renders this segment with the new theme instead of
            // silently using the stale image.
            delete design.renderedSlideUrl
            return prisma.sceneSegment.update({
              where: { id: seg.id },
              // Also clear the already-generated slide PNG (visualAssetUrl) —
              // this is what "Generate Slide Image" produces and what shows up
              // in Video Editing thumbnails. Without this, that image stays
              // frozen at the OLD theme even though the design JSON (and the
              // live editor) already reflect the new one, since nothing else
              // ever re-renders it automatically — only an explicit
              // Generate/Regenerate action does, and that's a separate step
              // the user has to take after switching themes. Clearing it here
              // makes the staleness visible (falls back to "not generated
              // yet") instead of silently showing the wrong theme.
              data: { slideDesign: JSON.stringify(design), visualAssetUrl: null },
            })
          } catch {
            // If design is malformed, create a new one with just the theme
            return prisma.sceneSegment.update({
              where: { id: seg.id },
              data: { slideDesign: JSON.stringify({ theme: body.theme, layout: 'bullets' }), visualAssetUrl: null },
            })
          }
        })
      )

      // Also update the main scene slideDeckContent theme if it exists
      const scene = await prisma.scene.findUnique({ where: { id: sceneId } })
      if (scene) {
        try {
          const mainDesign = JSON.parse(scene.slideDeckContent || '{}')
          // Update theme on main design too
          mainDesign.theme = body.theme
          await prisma.scene.update({
            where: { id: sceneId },
            // Same staleness fix as segments above — Scene.visualAssetUrl is
            // the legacy non-segmented equivalent of segment.visualAssetUrl.
            data: { slideDeckContent: JSON.stringify(mainDesign), visualAssetUrl: null },
          })
        } catch {}
      }

      ctx.log(`Applied theme ${body.theme} to ${updated.length} segments in scene ${sceneId}`)
      return { status: 200, jsonBody: { success: true, updatedCount: updated.length } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scenes/{id}/delete-voice
// Clears TTS audio and duration data from a scene and its segments
// Allows re-generation with proper duration calculation
app.http('deleteVoice', {
  methods: ['POST'], route: 'scenes/{id}/delete-voice', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      
      // Get all segments for this scene
      const segments = await prisma.sceneSegment.findMany({
        where: { sceneId },
      })

      // Clear TTS data from all segments
      await Promise.all(
        segments.map(seg =>
          prisma.sceneSegment.update({
            where: { id: seg.id },
            data: { ttsAudioUrl: null, durationSeconds: null },
          })
        )
      )

      // Clear TTS data from scene itself
      await prisma.scene.update({
        where: { id: sceneId },
        data: { 
          ttsAudioUrl: null,
          durationSeconds: null,
          status: 'draft',
        },
      })

      ctx.log(`Deleted TTS audio for scene ${sceneId} (${segments.length} segments)`)
      return { status: 200, jsonBody: { success: true, segmentsCleared: segments.length } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/scenes/{id}/element-timing
// Updates the timing for visual elements (title, subtitle, content blocks)
app.http('updateElementTiming', {
  methods: ['PATCH'], route: 'scenes/{id}/element-timing', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const sceneId = req.params.id
      const body = (await req.json()) as {
        elementId?: string
        startTime?: number
        duration?: number
      }

      if (!body.elementId || body.startTime === undefined) {
        return { status: 400, jsonBody: { error: 'elementId and startTime are required' } }
      }

      // Composition now lives per-segment (#40) — this endpoint (used by
      // Video Editing's element-timing view) still only deals with a
      // scene's single PRIMARY slide, so resolve that segment first.
      const primarySegment = await prisma.sceneSegment.findFirst({
        where: { sceneId },
        orderBy: { orderIndex: 'asc' },
      })
      if (!primarySegment) {
        return { status: 404, jsonBody: { error: 'Scene has no segments' } }
      }

      const composition = await prisma.slideComposition.findUnique({
        where: { segmentId: primarySegment.id },
      })

      if (!composition) {
        return { status: 404, jsonBody: { error: 'Slide composition not found' } }
      }

      // Update timing based on element ID
      const updateData: any = {}

      if (body.elementId === 'title') {
        updateData.titleStartTime = body.startTime
        if (body.duration !== undefined) updateData.titleDuration = body.duration
      } else if (body.elementId === 'subtitle') {
        updateData.subtitleStartTime = body.startTime
        if (body.duration !== undefined) updateData.subtitleDuration = body.duration
      } else if (body.elementId?.startsWith('content-')) {
        // Update content block timing
        const blockIndex = parseInt(body.elementId.split('-')[1], 10)
        const timings = JSON.parse(composition.contentBlockTimings || '[]')
        
        // Find or create timing entry for this block
        let blockTiming = timings.find((t: any) => t.elementId === body.elementId)
        if (!blockTiming) {
          blockTiming = {
            elementId: body.elementId,
            blockIndex,
            startTime: body.startTime,
            duration: body.duration || 2.5,
          }
          timings.push(blockTiming)
        } else {
          blockTiming.startTime = body.startTime
          if (body.duration !== undefined) blockTiming.duration = body.duration
        }

        updateData.contentBlockTimings = JSON.stringify(timings)
      }

      const updated = await prisma.slideComposition.update({
        where: { segmentId: primarySegment.id },
        data: updateData,
      })

      return { status: 200, jsonBody: updated }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/modules/{id}/change-theme
// Allows changing theme for all scenes in a module
app.http('changeModuleTheme', {
  methods: ['POST'], route: 'modules/{id}/change-theme', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const moduleId = req.params.id
      const body = (await req.json()) as { theme: string }
      if (!body.theme) return { status: 400, jsonBody: { error: 'theme is required' } }

      // Get all scenes in this module
      const scenes = await prisma.scene.findMany({
        where: { moduleId },
        include: { segments: true },
      })

      let totalSegmentsUpdated = 0

      // Update theme for all segments in all scenes
      for (const scene of scenes) {
        // Update all segments in this scene
        for (const segment of scene.segments) {
          try {
            const design = JSON.parse(segment.slideDesign || '{}')
            design.theme = body.theme
            await prisma.sceneSegment.update({
              where: { id: segment.id },
              data: { slideDesign: JSON.stringify(design) },
            })
            totalSegmentsUpdated++
          } catch {
            // Try to update with minimal design
            await prisma.sceneSegment.update({
              where: { id: segment.id },
              data: { slideDesign: JSON.stringify({ theme: body.theme }) },
            })
            totalSegmentsUpdated++
          }
        }

        // Update main scene design
        try {
          const mainDesign = JSON.parse(scene.slideDeckContent || '{}')
          mainDesign.theme = body.theme
          await prisma.scene.update({
            where: { id: scene.id },
            data: { slideDeckContent: JSON.stringify(mainDesign) },
          })
        } catch {}
      }

      ctx.log(`Applied theme ${body.theme} to ${totalSegmentsUpdated} segments across module ${moduleId}`)
      return { status: 200, jsonBody: { success: true, scenesUpdated: scenes.length, segmentsUpdated: totalSegmentsUpdated } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
