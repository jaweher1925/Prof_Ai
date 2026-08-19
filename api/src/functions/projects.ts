import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const badReq = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const notFound = (msg: string) => ({ status: 404, jsonBody: { error: msg } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

// Every project route below scopes to the CALLER's own projects (2026-08-13
// — "user history should be different": every signed-in user was seeing
// every project, not just their own, since Project had no owner column at
// all). This applies uniformly regardless of role — an admin browsing their
// own workspace at /dashboard sees only projects THEY created, same as any
// professor; the admin console's separate, deliberately unfiltered
// /api/admin/projects is still the place for a global view across everyone.
// Legacy projects created before this column existed have userId=null and
// so won't appear for anyone here — see schema.prisma's note on
// Project.userId.

// GET /api/projects
app.http('listProjects', {
  methods: ['GET'], route: 'projects', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const projects = await prisma.project.findMany({ where: { userId: user.userId }, orderBy: { updatedAt: 'desc' } })
      return { status: 200, jsonBody: projects }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// POST /api/projects
app.http('createProject', {
  methods: ['POST'], route: 'projects', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const { title } = (await req.json()) as { title?: string }
      if (!title?.trim()) return badReq('title is required')
      const project = await prisma.project.create({ data: { title: title.trim(), userId: user.userId } })
      return { status: 201, jsonBody: project }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}
app.http('getProject', {
  methods: ['GET'], route: 'projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id } })
      // 404 rather than 403 on a wrong-owner match — doesn't reveal whether
      // the project id exists at all to someone who isn't its owner.
      if (!project || project.userId !== user.userId) return notFound('Project not found')
      return { status: 200, jsonBody: project }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// PATCH /api/projects/{id}
app.http('updateProject', {
  methods: ['PATCH'], route: 'projects/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const existing = await prisma.project.findUnique({ where: { id: req.params.id }, select: { userId: true } })
      if (!existing || existing.userId !== user.userId) return notFound('Project not found')
      const body = (await req.json()) as any
      const project = await prisma.project.update({
        where: { id: req.params.id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.hilt_gates !== undefined && { hiltGates: body.hilt_gates }),
          ...(body.default_avatar_id !== undefined && { defaultAvatarId: body.default_avatar_id }),
          ...(body.default_voice_id !== undefined && { defaultVoiceId: body.default_voice_id }),
          // Avatar Studio (#37) — style/background/voice-settings are saved as
          // JSON strings (SQLite has no native JSON column); accept either an
          // already-stringified value or a plain object from the caller.
          ...(body.avatar_style !== undefined && { avatarStyle: body.avatar_style }),
          ...(body.avatar_background !== undefined && {
            avatarBackground: body.avatar_background === null
              ? null
              : typeof body.avatar_background === 'string' ? body.avatar_background : JSON.stringify(body.avatar_background),
          }),
          ...(body.voice_settings !== undefined && {
            voiceSettings: body.voice_settings === null
              ? null
              : typeof body.voice_settings === 'string' ? body.voice_settings : JSON.stringify(body.voice_settings),
          }),
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
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const existing = await prisma.project.findUnique({ where: { id: req.params.id }, select: { userId: true } })
      if (!existing || existing.userId !== user.userId) return notFound('Project not found')
      await prisma.project.delete({ where: { id: req.params.id } })
      return { status: 204 }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}/source-files
app.http('getProjectSourceFiles', {
  methods: ['GET'], route: 'projects/{id}/source-files', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { userId: true } })
      if (!project || project.userId !== user.userId) return notFound('Project not found')
      const files = await prisma.sourceFile.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: 'desc' } })
      return { status: 200, jsonBody: files }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// GET /api/projects/{id}/scripts
app.http('getProjectScripts', {
  methods: ['GET'], route: 'projects/{id}/scripts', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const user = getUser(req)
    if (!user) return unauth()
    try {
      const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { userId: true } })
      if (!project || project.userId !== user.userId) return notFound('Project not found')
      // Order by the module's own orderIndex, not Script.createdAt — a
      // re-analyzed/regenerated module gets a fresh Script row with a much
      // later createdAt, which used to shuffle it to the bottom of this list
      // even though Modules (and Visual Design's module picker) still show
      // it in its original position. Ordering by module.orderIndex keeps
      // Scripts/Voice/Visual Design all ranking modules the same way.
      const scripts = await prisma.script.findMany({
        where: { projectId: req.params.id },
        orderBy: [{ module: { orderIndex: 'asc' } }, { createdAt: 'asc' }],
      })
      return { status: 200, jsonBody: scripts }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
