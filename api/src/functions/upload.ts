import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../lib/auth'
import { uploadFromForm } from '../lib/storage'

// POST /api/upload
app.http('upload', {
  methods: ['POST'], route: 'upload', authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    try {
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return { status: 400, jsonBody: { error: 'No file provided' } }
      if (file.size > 50 * 1024 * 1024) return { status: 400, jsonBody: { error: 'File exceeds 50 MB limit' } }
      const file_url = await uploadFromForm(file)
      ctx.log(`Uploaded: ${file.name} (${file.size} bytes)`)
      return { status: 200, jsonBody: { file_url } }
    } catch (e: any) {
      ctx.error(e)
      return { status: 500, jsonBody: { error: e?.message } }
    }
  },
})
