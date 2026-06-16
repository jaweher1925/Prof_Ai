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
async function extractPdfText(filePath: string, context: InvocationContext): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const buffer = readFileSync(filePath)
    const data = await pdfParse(buffer)
    const text = (data.text || '').trim()
    context.log(`PDF extracted: ${text.length} characters`)
    return text.slice(0, 8000)
  } catch (e: any) {
    context.warn(`PDF parse failed: ${e.message} — will use filename as context`)
    return ''
  }
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

/** Map a fileUrl like /uploads/uuid.ext to the actual disk path */
function resolveUploadPath(fileUrl: string): string {
  const fileName = fileUrl.replace('/uploads/', '').replace('/uploads\\', '')
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

      } else {
        // DOCX, XLSX, or other — use filename as context
        content = `[Document: ${file.fileName}]`
      }

      // If we couldn't extract content, still include the filename as context
      if (!content) {
        content = `[File: ${file.fileName} — content could not be extracted automatically]`
      }

      contentParts.push(`--- Source: ${file.fileName} ---\n${content}`)
    }

    const combinedContent = contentParts.join('\n\n')
    context.log(`Total content length: ${combinedContent.length} characters`)
    context.log('Calling LLM to build course structure...')

    // Call LLM
    const systemPrompt = `You are an expert instructional designer.
Your job is to analyze source materials and create a structured Learning Journey for a video course.
Even if content is limited, create a reasonable course structure based on what you know about the topic.
Always respond with valid JSON only — no markdown, no explanation.`

    const userPrompt = `Analyze these source materials and create a Learning Journey course structure.

Source materials:
${combinedContent.slice(0, 12000)}

Create a course with EXACTLY 5 modules. Each module becomes one 6-minute video.
Each module should cover one major topic area with enough depth to fill 6 minutes of presenter content.
Return ONLY this JSON structure (no other text):
{
  "course_title": "string",
  "modules": [
    {
      "title": "string",
      "objective": "string (what the learner will be able to do after this module)",
      "key_points": ["string", "string", "string"],
      "estimated_duration_minutes": 6
    }
  ]
}`

    const journey = await generateJson<LearningJourney>(systemPrompt, userPrompt)
    context.log(`LLM returned: ${journey.modules?.length} modules`)

    if (!journey.modules || !Array.isArray(journey.modules) || journey.modules.length === 0) {
      throw new Error('LLM returned an invalid structure — no modules found')
    }

    // Delete existing modules and recreate
    await prisma.module.deleteMany({ where: { projectId } })

    const createdModules = []
    for (let i = 0; i < journey.modules.length; i++) {
      const mod = journey.modules[i]
      const created = await prisma.module.create({
        data: {
          projectId,
          title: mod.title,
          objective: mod.objective || '',
          orderIndex: i,
          status: 'proposed',
        },
      })
      createdModules.push(created)
      context.log(`Module ${i + 1}: ${mod.title}`)
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'pending_director_approval' },
    })

    context.log(`Librarian complete — ${createdModules.length} modules created`)

    return {
      status: 200,
      jsonBody: {
        success: true,
        course_title: journey.course_title,
        modules_created: createdModules.length,
        modules: createdModules,
      },
    }
  } catch (error: any) {
    context.error('librarianAgent error:', error)
    if (projectId) {
      try {
        await prisma.project.update({ where: { id: projectId }, data: { status: 'draft' } })
      } catch {}
    }
    return { status: 500, jsonBody: { error: error.message || 'Agent failed' } }
  }
}

app.http('librarianAgent', {
  methods: ['POST'],
  route: 'librarianAgent',
  authLevel: 'anonymous',
  handler: librarianAgentHandler,
})