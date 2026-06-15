import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const badReq = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const notFound = (msg: string) => ({ status: 404, jsonBody: { error: msg } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

// GET /api/projects
app.http('listProjects', {
  methods: ['GET'], route: 'projects', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const projects = await prisma.project.findMany({ orderBy: { updatedAt: 'desc' } })
      return { status: 200, jsonBody: projects }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/projects
app.http('createProject', {
  methods: ['POST'], route: 'projects', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const { title } = (await req.json()) as { title?: string }
      if (!title?.trim()) return badReq('title is required')
      const project = await prisma.project.create({ data: { title: title.trim() } })
      return { status: 201, jsonBody: project }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}
app.http('getProject', {
  methods: ['GET'], route: 'projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id } })
      if (!project) return notFound('Project not found')
      return { status: 200, jsonBody: project }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/projects/{id}
app.http('updateProject', {
  methods: ['PATCH'], route: 'projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      const project = await prisma.project.update({
        where: { id: req.params.id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.hilt_gates !== undefined && { hiltGates: body.hilt_gates }),
          ...(body.default_avatar_id !== undefined && { defaultAvatarId: body.default_avatar_id }),
          ...(body.default_voice_id !== undefined && { defaultVoiceId: body.default_voice_id }),
        },
      })
      return { status: 200, jsonBody: project }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// DELETE /api/projects/{id}
app.http('deleteProject', {
  methods: ['DELETE'], route: 'projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      await prisma.project.delete({ where: { id: req.params.id } })
      return { status: 204 }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}/source-files
app.http('getProjectSourceFiles', {
  methods: ['GET'], route: 'projects/{id}/source-files', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const files = await prisma.sourceFile.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: 'desc' } })
      return { status: 200, jsonBody: files }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}/scripts
app.http('getProjectScripts', {
  methods: ['GET'], route: 'projects/{id}/scripts', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const scripts = await prisma.script.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: 'asc' } })
      return { status: 200, jsonBody: scripts }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
