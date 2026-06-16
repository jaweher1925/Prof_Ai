/**
 * GET /api/uploads/{filename}
 * Serves files from the local uploads directory (audio, images).
 * In Azure production, replace with Blob Storage redirect.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { readFile, access } from 'fs/promises'
import { join, extname } from 'path'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

const MIME: Record<string, string> = {
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
}

async function serveUploadHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const filename = request.params.filename
  if (!filename || filename.includes('..')) {
    return { status: 400, jsonBody: { error: 'Invalid filename' } }
  }

  const filePath = join(UPLOAD_DIR, filename)

  try {
    await access(filePath)
  } catch {
    return { status: 404, jsonBody: { error: 'File not found' } }
  }

  const buffer = await readFile(filePath)
  const ext = extname(filename).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'

  return {
    status: 200,
    body: buffer,
    headers: {
      'Content-Type':        contentType,
      'Content-Length':      String(buffer.length),
      'Content-Disposition': 'inline',           // render in browser, never download
      'Cache-Control':       'public, max