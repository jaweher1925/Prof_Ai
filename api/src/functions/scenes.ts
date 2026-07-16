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
      
      // Get all scenes for this module with their composition
      const scenes = await prisma.scene.findMany({
        where: { moduleId },
        orderBy: { orderIndex: 'asc' },
        include: { 
          composition: true,  // Include slideComposition
        },
      })
      
      // For each scene, get its segments
      const result = []
      for (const scene of scenes) {
        const segments = await prisma.sceneSegment.findMany({
          where: { sceneId: scene.id },
          orderBy: { orderIndex: 'asc' },
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
        
        // Map composition to slideComposition field name
        result.push({ 
          ...scene, 
          slideComposition: scene.composition, 
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
          ...(body.visual_prompt !== undefined && { visualPrompt: body.visual_prompt }),
          ...(body.text_animation_type !== undefined && { textAnimationType: body.text_animation_type }),
          ...(body.presenter_position !== undefined && { presenterPosition: body.presenter_position }),
          ...(body.status !== undefined && { status: body.status }),
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

// DELETE /api/scenes/{id} — removes a scene and re-normalizes orderIndex of remaining siblings
app.http('deleteScene', {
  methods: ['DELETE'], route: 'scenes/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const scene = await prisma.scene.findUnique({ where: { id: req.params.id } })
      if (!scene) return { status: 404, jsonBody: { error: 'Scene not found' } }

      await prisma.scene.delete({ where: { id: req.params.id } })

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
              data: { slideDesign: JSON.stringify(design) },
            })
          } catch {
            // If design is malformed, create a new one with just the theme
            return prisma.sceneSegment.update({
              where: { id: seg.id },
              data: { slideDesign: JSON.stringify({ theme: body.theme, layout: 'bullets' }) },
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
            data: { slideDeckContent: JSON.stringify(mainDesign) },
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

      // Get the scene's slide composition
      const composition = await prisma.slideComposition.findUnique({
        where: { sceneId },
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
        where: { sceneId },
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
