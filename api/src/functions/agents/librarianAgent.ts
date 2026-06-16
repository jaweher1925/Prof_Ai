/**
 * POST /api/librarianAgent
 *
 * Step 1 of the pipeline.
 * Reads source files → analyzes content → creates modules in DB.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface LearningJourneyModule {
  title: string
  objective: string
  key_points: string[]
  estimated_duration_minutes: number
}

interface LearningJourney {
  course_title: string
  modules: LearningJourneyModule[]
}

/** Try to extract text from a PDF file */
/**
 * Extract text from a PDF file.
 * Strategy 1: pdf-parse npm package (works on Node 18/20).
 * Strategy 2: raw regex on the PDF binary (works on any Node version).
 * Returns empty string only for scanned/image PDFs with no embedded text.
 */
async function extractPdfText(filePath: string, context: InvocationContext): Promise<string> {
  const buffer = readFileSync(filePath)

  // ── Strategy 1: pdf-parse ──────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    const text = (data.text || '').trim()
    if (text.length > 50) {
      context.log(`PDF extracted via pdf-parse: ${text.length} chars`)
      return text.slice(0, 10000)
    }
  } catch (e: any) {
    context.warn(`pdf-parse failed (${e.message}) — trying raw extraction`)
  }

  // ── Strategy 2: raw regex extraction ──────────────────────────────────
  // Reads text operators in PDF content streams: (hello world)Tj / [(A)(B)]TJ
  try {
    const raw = buffer.toString('binary')
    const chunks: string[] = []

    // Single string: (text)Tj
    const singleRe = /\(([^)]{1,300})\)\s*Tj/g
    let m: RegExpExecArray | null
    while ((m = singleRe.exec(raw)) !== null) {
      chunks.push(decodePdfString(m[1]))
    }

    // Array: [(str)(str)...]TJ
    const arrayRe = /\[((?:\([^)]*\)\s*-?\d*\.?\d*\s*)+)\]\s*TJ/g
    while ((m = arrayRe.exec(raw)) !== null) {
      const parts = m[1].match(/\(([^)]{0,300})\)/g) || []
      parts.forEach(p => chunks.push(decodePdfString(p.slice(1, -1))))
    }

    const text = chunks
      .map(s => s.replace(/[^\x20-\x7EÀ-ɏ]/g, ' ').trim())
      .filter(s => s.length > 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (text.length > 50) {
      context.log(`PDF extracted via raw regex: ${text.length} chars`)
      return text.slice(0, 10000)
    }

    context.warn('PDF appears to be scanned/image-based — no embedded text found')
    return ''
  } catch (e: any) {
    context.warn(`Raw PDF extraction failed: ${e.message}`)
    return ''
  }
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
}

/** Fetch plain text from a URL */
async function fetchUrlText(url: string, context: InvocationContext): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProfAI/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    context.log(`URL fetched: ${text.length} characters from ${url}`)
    return text.slice(0, 8000)
  } catch (e: any) {
    context.warn(`URL fetch failed: ${e.message}`)
    return ''
  }
}

/** Read a plain text file */
function readTextFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8').slice(0, 8000)
  } catch {
    return ''
  }
}

/** Map a fileUrl like /api/uploads/uuid.pdf to the actual disk path */
function resolveUploadPath(fileUrl: string): string {
  // fileUrl = '/api/uploads/abc123.pdf'  →  fileName = 'abc123.pdf'
  const fileName = fileUrl.split('/').pop() || ''
  return join(process.cwd(), 'uploads', fileName)
}

async function librarianAgentHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  let projectId: string | undefined

  try {
    const body = (await request.json()) as { project_id?: string }
    projectId = body.project_id

    if (!projectId) {
      return { status: 400, jsonBody: { error: 'project_id is required' } }
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return { status: 404, jsonBody: { error: 'Project not found' } }

    // Get all source files
    const sourceFiles = await prisma.sourceFile.findMany({ where: { projectId } })
    if (sourceFiles.length === 0) {
      return { status: 400, jsonBody: { error: 'Upload at least one source file first.' } }
    }

    // Update status
    await prisma.project.update({ where: { id: projectId }, data: { status: 'ingesting_sources' } })
    context.log(`Librarian: processing ${sourceFiles.length} file(s)`)

    // Extract content from each file
    const contentParts: string[] = []

    for (const file of sourceFiles) {
      context.log(`Reading: ${file.fileName} (type: ${file.fileType})`)
      let content = ''

      if (file.fileType === 'url') {
        content = await fetchUrlText(file.fileUrl, context)

      } else if (file.fileType === 'pdf') {
        const filePath = resolveUploadPath(file.fileUrl)
        context.log(`PDF path: ${filePath}, exists: ${existsSync(filePath)}`)
        if (existsSync(filePath)) {
          content = await extractPdfText(filePath, context)
        }

      } else if (file.fileType === 'txt') {
        const filePath = resolveUploadPath(file.fileUrl)
        if (existsSync(filePath)) {
          content = readTextFile(filePath)
        }

      } else if (file.fileType === 'video') {
        content = `[Video source: ${file.fileName} - use the title and surrounding project context as reference. Transcript extraction is not available yet.]`

      } else {
        // DOCX, XLSX, or other — use filename as context
        content = `[Document: ${file.fileName}]`
      }

      if (!content) {
        context.warn(`No text extracted from ${file.fileName} — skipping`)
        contentParts.push(`--- Source: ${file.fileName} ---\n[No readable text found — may be a scanned image PDF]`)
      } else {
        contentParts.push(`--- Source: ${file.fileName} ---\n${content}`)
      }
    }

    const combinedContent = contentParts.join('\n\n')
    context.log(`Total extracted content: ${combinedContent.length} characters`)

    // ── Fail early if no real content was extracted ─────────────────────
    const realContentLength = combinedContent
      .replace(/--- Source:.*?---/g, '')
      .replace(/\[No readable text.*?\]/g, '')
      .trim().length

    if (realContentLength < 100) {
      return {
        status: 400,
        jsonBody: {
          error:
            'Could not extract readable text from your uploaded files. ' +
            'Make sure you upload a text-based PDF (not a scanned image). ' +
            'You can also try uploadi