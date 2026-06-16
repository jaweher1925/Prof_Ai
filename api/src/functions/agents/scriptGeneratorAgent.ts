/**
 * POST /api/scriptGeneratorAgent
 *
 * Step 2 of the pipeline.
 * For each approved module, generates a detailed presenter script
 * with scenes, visual prompts, and estimated durations.
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

// ─── Source-file extraction helpers (same logic as librarianAgent) ─────────

function resolveUploadPath(fileUrl: string): string {
  const fileName = fileUrl.split('/').pop() || ''
  return join(process.cwd(), 'uploads', fileName)
}

async function extractPdfText(filePath: string, context: InvocationContext): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(readFileSync(filePath))
    return (data.text || '').trim().slice(0, 10000)
  } catch (e: any) {
    context.warn(`PDF parse failed: ${e.message}`)
    return ''
  }
}

async function fetchUrlText(url: string, context: InvocationContext): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProfAI/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000)
  } catch (e: any) {
    context.warn(`URL fetch failed: ${e.message}`)
    return ''
  }
}

async function extractSourceContent(
  sourceFiles: { fileName: string; fileUrl: string; fileType: string }[],
  context: InvocationContext
): Promise<string> {
  const parts: string[] = []
  for (const file of sourceFiles) {
    let text = ''
    if (file.fileType === 'url') {
      text = await fetchUrlText(file.fileUrl, context)
    } else if (['pdf', 'txt'].includes(file.fileType)) {
      const path = resolveUploadPath(file.fileUrl)
      if (existsSync(path)) {
        if (file.fileType === 'pdf') text = await extractPdfText(path, context)
        else text = readFileSync(path, 'utf-8').slice(0, 10000)
      }
    }
    if (text) parts.push(`=== ${file.fileName} ===\n${text}`)
    else parts.push(`=== ${file.fileName} === [content not available]`)
  }
  return parts.join('\n\n')
}

interface SlideBullet {
  text: string
  level: 1 | 2
}

interface SlideBlock {
  type: 'bullets' | 'definition' | 'quote' | 'two-column' | 'key-concept'
  items?: SlideBullet[]          // for bullets
  term?: string                  // for definition
  definition?: string            // for definition
  examples?: string[]            // for definition
  quote?: string                 // for quote
  attribution?: string           // for quote
  concept?: string               // for key-concept
  left?: SlideBullet[]           // for two-column
  right?: SlideBullet[]          // for two-column
}

interface SlideContent {
  title: string
  subtitle?: string
  layout: 'title-hero' | 'bullets' | 'split' | 'quote' | 'definition' | 'summary'
  theme?: 'dark-navy' | 'ocean' | 'academic' | 'light' | 'corporate'
  blocks: SlideBlock[]
  imagePrompt?: string
}

interface SceneOutput {
  title: string
  script_content: string
  slide_content: SlideContent
  visual_prompt: string
  duration_seconds: number
  text_animation_type: string
}

interface ScriptOutput {
  title: string
  learning_objectives: string[]
  scenes: SceneOutput[]
  estimated_duration_minutes: number
}

async function scriptGeneratorAgentHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as {
      project_id?: string
      special_instructions?: string
    }
    if (!body.project_id) {
      return { status: 400, jsonBody: { error: 'project_id is required' } }
    }

    const project = await prisma.project.findUnique({ where: { id: body.project_id } })
    if (!project) return { status: 404, jsonBody: { error: 'Project not found' } }

    // Get all modules for this project
    const modules = await prisma.module.findMany({
      where: { projectId: body.project_id },
      orderBy: { orderIndex: 'asc' },
    })

    if (modules.length === 0) {
      return { status: 400, jsonBody: { error: 'No modules found. Run the Librarian agent first.' } }
    }

    // ── Load & extract source files so scripts are grounded in real content ──
    const sourceFiles = await prisma.sourceFile.findMany({
      where: { projectId: body.project_id },
    })
    context.log(`Loading ${sourceFiles.length} source file(s) for script grounding…`)
    const sourceContent = await extractSourceContent(sourceFiles, context)
    context.log(`Source content extracted: ${sourceContent.length} chars`)

    // Update project status
    await prisma.project.update({
      where: { id: body.project_id },
      data: { status: 'ingesting_sources' },
    })

    const specialInstructions = body.special_instructions
      ? `\nSpecial instructions: ${body.special_instructions}`
      : ''

    const createdScripts = []

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // Generate a script for each module — pause between each to respect TPM limits
    for (let modIdx = 0; modIdx < modules.length; modIdx++) {
      const mod = modules[modIdx]
      // Wait 5 seconds between modules to avoid hitting the 12k TPM rate limit
      if (modIdx > 0) {
        context.log(`Waiting 5s before next module to respect rate limits…`)
        await sleep(5000)
      }
   