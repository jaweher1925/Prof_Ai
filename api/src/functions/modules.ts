/**
 * /api/modules — Module endpoints
 *
 * GET  /api/projects/{id}/modules  → list modules for a project
 * GET  /api/modules/{id}           → get a single module
 * PATCH /api/modules/{id}          → update module status
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// GET /api/projects/{id}/modules
app.http('getProjectModules', {
  methods: ['GET'],
  route: 'projects/{id}/modules',
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const modules = await prisma.module.findMany({
        where: { projectId: req.params.id },
        orderBy: { orderIndex: 'asc' },
        include: { _count: { select: { scenes: true } } },
      })
      return { status: 200, jsonBody: modules }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/modules/{id}
app.http('getModule', {
  methods: ['GET'],
  route: 'modules/{id}',
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const module = await prisma.module.findUnique({ where: { id: req.params.id } })
      if (!module) return { status: 404, jsonBody: { error: 'Not found' } }
      return { status: 200, jsonBody: module }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/modules/{id}
app.http('updateModule', {
  methods: ['PATCH'],
  route: 'modules/{id}',
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      const module = await prisma.module.update({
        where: { id: req.params.id },
        data: {
          ...(body.status !== undefined && { status: body.status }),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.objective !== undefined && { objective: body.objective }),
        },
      })
      return { status: 200, jsonBody: module }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
