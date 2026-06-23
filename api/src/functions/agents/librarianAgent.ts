/**
 * POST /api/librarianAgent
 *
 * Step 1 of the pipeline.
 * Reads pre-extracted text from SourceFile.extractedText (saved at upload time)
 * and asks the LLM to create 5 course modules from it.
 *
 * No file parsing here — extraction happened once at upload via extractText.ts.
 * URLs are the only exception: their content is fetched live (it can change).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'

interface LearningJourneyModule {
  title:                      string
  objective:                  string
  key_points:                 string[]
  estimated_duration_minutes: number
}
interface LearningJourney {
  course_title: string
  modules:      LearningJourneyModule[]
}

// ─── URL fetcher (URLs can't be pre-extracted — content changes) ──────────────

async function fetchUrlText(url: string, context: InvocationContext): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProfAI/1.0)' },
      signal:  AbortSignal.timeout(10000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
  } catch (e: any) {
    context.warn(`URL fetch failed (${url}): ${e.message}`)
    return ''
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function librarianAgentHandler(
  request:  HttpRequest,
  context:  InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  let projectId: string | undefined

  try {
    const body = (await request.json()) as { project_id?: string }
    projectId  = body.project_id

    if (!projectId) return { status: 400, jsonBody: { error: 'project_id is required' } }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return { status: 404, jsonBody: { error: 'Project not found' } }

    const sourceFiles = await prisma.sourceFile.findMany({ where: { projectId } })
    if (sourceFiles.length === 0) {
      return { status: 400, jsonBody: { error: 'Upload at least one source file first.' } }
    }

    await prisma.project.update({ where: { id: projectId }, data: { status: 'ingesting_sources' } })
    context.log(`Librarian: processing ${sourceFiles.length} source file(s)`)

    // ── Build combined content from DB (no file I/O for uploads) ─────────────
    // URL fetches used to run one-at-a-time in this loop (each with its own
    // 10s timeout) — with several URL sources that serialized into many
    // seconds of dead time. They're independent network calls, so fetch them
    // all concurrently; non-URL files just read the already-extracted text
    // from DB and resolve instantly.
    const contentParts = await Promise.all(sourceFiles.map(async (file) => {
      let text = ''

      if (file.fileType === 'url') {
        // URLs are fetched live — content may have changed since upload
        text = await fetchUrlText(file.fileUrl, context)
      } else {
        // All other types: text was extracted at upload time and saved in DB
        text = (file.extractedText ?? '').trim()
        if (!text) {
          context.warn(`${file.fileName}: extractedText is empty — file may be a scanned image`)
        }
      }

      if (text) {
        context.log(`${file.fileName}: ${text.length} chars from DB`)
        return `=== ${file.fileName} ===\n${text}`
      }
      return `=== ${file.fileName} ===\n[No readable text — file may be a scanned PDF or unsupported format]`
    }))

    const combinedContent = contentParts.join('\n\n')
    context.log(`Total content length: ${combinedContent.length} chars`)

    // ── Fail early if nothing useful was extracted ────────────────────────────
    const realLength = contentParts
      .filter(p => !p.includes('[No readable text'))
      .join('').replace(/=== .* ===/g, '').trim().length

    if (realLength < 100) {
      return {
        status: 400,
        jsonBody: {
          error:
            'Could not extract readable text from your uploaded files. ' +
            'Please upload a text-based PDF (not a scanned image), a .txt file, or a URL.',
        },
      }
    }

    // ── LLM: create course modules strictly from source content ──────────────
    const systemPrompt = `You are an expert instructional designer.
Analyze the professor's source materials and create a structured Learning Journey for a video course.
CRITICAL RULES:
1. Base the course ENTIRELY on the provided source materials.
2. Module titles must come directly from topics found in the source — use the same terminology.
3. Do NOT create generic modules like "Introduction to the Course" or "Future Directions" unless the source explicitly covers them.
4. If the source has specific named topics (e.g. "Le paradigme Objet"), those MUST become module titles.
Always respond with valid JSON only — no markdown, no explanation.`

    const userPrompt = `Analyze the source materials below and create a Learning Journey course structure.

SOURCE MATERIALS:
${combinedContent.slice(0, 6000)}

INSTRUCTIONS:
- Identify the main topics/chapters from the source above
- Create between 3 and 5 modules — each must match a real topic from the source
- Use EXACT names and terms from the source as module titles
- Do NOT invent topics not present in the source

Return ONLY this JSON:
{
  "course_title": "string (derived from source content)",
  "modules": [
    {
      "title":                      "exact topic name from source",
      "objective":                  "what students will learn about this specific topic",
      "key_points":                 ["specific fact from source", "specific concept", "specific example"],
      "estimated_duration_minutes": 6
    }
  ]
}`

    context.log('Calling LLM to build course structure…')
    // 2048 was too tight — the model's response (5 modules x objective + 3
    // key_points each) regularly ran past it and got cut off mid-string,
    // which is what caused both "Unexpected end of JSON" and "Unterminated
    // string" parse failures (truncation, not actually malformed JSON).
    const journey = await generateJson<LearningJourney>(systemPrompt, userPrompt, 8192)
    context.log(`LLM returned ${journey.modules?.length ?? 0} modules`)

    if (!journey.modules?.length) {
      throw new Error('LLM returned no modules — check source content')
    }

    // ── Save modules to DB ────────────────────────────────────────────────────
    await prisma.module.deleteMany({ where: { projectId } })

    const createdModules = []
    for (let i = 0; i < journey.modules.length; i++) {
      const mod = journey.modules[i]
      const objective = [
        mod.objective,
        mod.key_points?.length ? 'Key points: ' + mod.key_points.join(' | ') : '',
      ].filter(Boolean).join('\n')

      const created = await prisma.module.create({
        data: { projectId, title: mod.title, objective, orderIndex: i, status: 'proposed' },
      })
      createdModules.push(created)
      context.log(`Module ${i + 1}: ${mod.title}`)
    }

    await prisma.project.update({
      where: { id: projectId },
      data:  { status: 'pending_director_approval' },
    })

    return {
      status:   200,
      jsonBody: {
        success:         true,
        course_title:    journey.course_title,
        modules_created: createdModules.length,
        modules:         createdModules,
      },
    }

  } catch (error: any) {
    context.error('librarianAgent error:', error)
    if (projectId) {
      await prisma.project.update({ where: { id: projectId }, data: { status: 'draft' } }).catch(() => {})
    }
    return { status: 500, jsonBody: { error: error.message ?? 'Librarian agent failed' } }
  }
}

app.http('librarianAgent', {
  methods:     ['POST'],
  route:       'librarianAgent',
  authLevel:   'anonymous',
  handler:     librarianAgentHandler,
})
