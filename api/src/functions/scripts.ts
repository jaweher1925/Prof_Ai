import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

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
      return { status: 200, jsonBody: updatedScript }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
