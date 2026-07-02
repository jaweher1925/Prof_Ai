import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'
import { TextAnimationTiming, generateDefaultTimings } from '../lib/textAnimations'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// PATCH /api/scene-segments/{id}/text-animation-timings
// Update text animation timings for a segment
app.http('updateTextAnimationTimings', {
  methods: ['PATCH'], route: 'scene-segments/{id}/text-animation-timings', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segmentId = req.params.id
      const body = (await req.json()) as { timings: TextAnimationTiming[] }
      
      if (!Array.isArray(body.timings)) {
        return { status: 400, jsonBody: { error: 'timings must be an array' } }
      }
      
      // Validate timing values
      for (const timing of body.timings) {
        if (typeof timing.elementIndex !== 'number' || timing.elementIndex < 0) {
          return { status: 400, jsonBody: { error: 'Invalid elementIndex' } }
        }
        if (typeof timing.startMs !== 'number' || timing.startMs < 0) {
          return { status: 400, jsonBody: { error: 'Invalid startMs' } }
        }
        if (typeof timing.durationMs !== 'number' || timing.durationMs <= 0) {
          return { status: 400, jsonBody: { error: 'Invalid durationMs' } }
        }
      }
      
      const segment = await prisma.sceneSegment.update({
        where: { id: segmentId },
        data: {
          textAnimationTimings: JSON.stringify({
            timings: body.timings,
            overallDuration: Math.max(...body.timings.map(t => t.startMs + t.durationMs), 0)
          })
        } as any,
      })
      
      return { status: 200, jsonBody: segment }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/scene-segments/{id}/generate-default-timings
// Generate default animation timings based on element count and segment duration
app.http('generateDefaultTextAnimationTimings', {
  methods: ['POST'], route: 'scene-segments/{id}/generate-default-timings', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segmentId = req.params.id
      const body = (await req.json()) as { elementCount: number; segmentDurationMs: number }
      
      const segment = await prisma.sceneSegment.findUnique({
        where: { id: segmentId }
      })
      
      if (!segment) {
        return { status: 404, jsonBody: { error: 'Segment not found' } }
      }
      
      // Generate default timings
      const timings = generateDefaultTimings(body.elementCount, body.segmentDurationMs)
      
      // Save to segment
      const updated = await prisma.sceneSegment.update({
        where: { id: segmentId },
        data: {
          textAnimationTimings: JSON.stringify({
            timings,
            overallDuration: body.segmentDurationMs
          })
        } as any,
      })
      
      ctx.log(`Generated default timings for segment ${segmentId}: ${timings.length} elements`)
      return { status: 200, jsonBody: { segment: updated, timings } }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/scene-segments/{id}/text-animation-timings
// Get current text animation timings for a segment
app.http('getTextAnimationTimings', {
  methods: ['GET'], route: 'scene-segments/{id}/text-animation-timings', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const segmentId = req.params.id
      
      const segment = await prisma.sceneSegment.findUnique({
        where: { id: segmentId }
      })
      
      if (!segment) {
        return { status: 404, jsonBody: { error: 'Segment not found' } }
      }
      
      const timings = segment.textAnimationTimings 
        ? JSON.parse(segment.textAnimationTimings as any)
        : { timings: [] }
      
      return { status: 200, jsonBody: timings }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
