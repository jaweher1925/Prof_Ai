import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getUser } from '../lib/auth'
import { uploadBuffer } from '../lib/storage'
import { extractTextFromBuffer } from '../lib/extractText'

/**
 * POST /api/upload
 *
 * Saves the file to disk and — for PDF/TXT — extracts its text in the same
 * request while the buffer is already in memory.
 *
 * Returns: { file_url, extracted_text }
 *   extracted_text is "" for videos, DOCX, and scanned/image PDFs.
 *
 * The caller (SourcesPanel) passes extracted_text to POST /api/source-files
 * which saves it in SourceFile.extractedText so agents never re-parse the file.
 */
app.http('upload', {
  methods: ['POST'],
  route: 'upload',
  authLevel: 'anonymous',
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!getUser(req)) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

    try {
      const form = await req.formData()
      const file = form.get('file') as File | null

      if (!file) return { status: 400, jsonBody: { error: 'No file provided' } }
      if (file.size > 200 * 1024 * 1024) {
        return { status: 400, jsonBody: { error: 'File exceeds 200 MB limit' } }
      }

      // Read into buffer once — reuse for both disk write and text extraction
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'bin'

      // Disk write and text extraction are independent (both just read the
      // buffer) — run them concurrently instead of back-to-back so the PDF
      // parse no longer adds its full duration on top of the disk write.
      const [file_url, extracted_text] = await Promise.all([
        uploadBuffer(buffer, ext, file.type),
        extractTextFromBuffer(buffer, file.name),
      ])

      ctx.log(
        `Uploaded: ${file.name} (${file.size} bytes) | ` +
        `extracted: ${extracted_text.length} chars`
      )

      return { status: 200, jsonBody: { file_url, extracted_text } }

    } catch (e: any) {
      ctx.error('Upload error:', e)
      return { status: 500, jsonBody: { error: e?.message ?? 'Upload failed' } }
    }
  },
})
