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
      const scenes = await prisma.scene.findMany({ where: { moduleId: req.params.id }, orderBy: { orderIndex: 'asc' } })
      return { status: 200, jsonBody: scenes }
    } catch (e) { ctx.error(e); return err500(e) }
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
