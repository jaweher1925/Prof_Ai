import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../lib/db'
import { getUser } from '../lib/auth'

const unauth = () => ({ status: 401, jsonBody: { error: 'Unauthenticated' } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message } } as HttpResponseInit)

// POST /api/source-files
app.http('createSourceFile', {
  methods: ['POST'], route: 'source-files', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      const body = (await req.json()) as any
      if (!body.project_id || !body.file_name || !body.file_url)
        return { status: 400, jsonBody: { error: 'project_id, file_name, file_url required' } }
      const file = await prisma.sourceFile.create({
        data: {
          projectId:     body.project_id,
          fileName:      body.file_name,
          fileUrl:       body.file_url,
          fileType:      body.file_type ?? 'other',
          fileSize:      body.file_size ?? null,
          extractedText: body.extracted_text ?? null,  // saved once at upload time
        },
      })
      return { status: 201, jsonBody: file }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})

// DELETE /api/source-files/{id}
app.http('deleteSourceFile', {
  methods: ['DELETE'], route: 'source-files/{id}', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return unauth()
    try {
      // Use deleteMany so duplicate delete calls don't throw an error
      await prisma.sourceFile.deleteMany({ where: { id: req.params.id } })
      return { status: 204 }
    } catch (e) { ctx.error(e); return err500(e) }
  },
})
