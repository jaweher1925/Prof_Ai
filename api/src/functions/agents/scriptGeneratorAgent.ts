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

    // Update project status
    await prisma.project.update({
      where: { id: body.project_id },
      data: { status: 'ingesting_sources' },
    })

    const specialInstructions = body.special_instructions
      ? `\nSpecial instructions: ${body.special_instructions}`
      : ''

    const createdScripts = []

    // Generate a script for each module
    for (const mod of modules) {
      context.log(`Generating script for module: ${mod.title}`)

      const systemPrompt = `You are an expert scriptwriter for educational video content.
You write engaging, clear presenter scripts for online learning modules.
Always respond with valid JSON only — no markdown, no explanation.`

      const userPrompt = `Write a complete presenter script for this learning module.
This module must be exactly 6 minutes long (360 seconds total).

Module title: ${mod.title}
Module objective: ${mod.objective || 'Not specified'}
${specialInstructions}

CORE PRINCIPLE — TWO COMPLETELY DIFFERENT OUTPUTS PER SCENE:
1. script_content = ONLY what the PRESENTER SAYS out loud — natural conversational speech, 80-120 words, first-person narrator voice, no bullet points
2. slide_content = ONLY what STUDENTS READ on the slide — structured educational reference material (title, subtitle, bullets). Must be DIFFERENT TEXT from script_content. Students should be able to study the slide without watching the video. No narration phrasing. Bullets = facts/concepts to remember.

SLIDE STRUCTURE RULES (like Gamma):
- Follow a logical outline: intro → problem → concept → examples → application → summary
- Scene 1: always layout "title-hero" (module intro)
- Scene 8: always layout "summary" (key takeaways with checkmarks)
- Middle scenes: alternate between "bullets", "definition", "split", "quote"
- Subtitles should state the key insight, not repeat the title
- Bullets must be educational facts/concepts students can study — not what the presenter says

LAYOUT OPTIONS:
- "title-hero": big title + subtitle + one key statement (scene intros)
- "bullets": title + 4-5 scannable bullet points (main content)
- "definition": term being defined + clear definition + 2-3 examples
- "split": two columns — left: concept, right: examples or comparison
- "quote": highlighted key principle or formula (standout concept)
- "summary": "Key Takeaways" checklist of 4-5 items students must remember

THEME: choose the best for this topic:
- "dark-navy": tech, software, data science
- "ocean": business, management, communication
- "academic": science, mathematics, research
- "light": healthcare, education, UX design
- "corporate": finance, law, strategy
${specialInstructions}

Return this exact JSON:
{
  "title": "${mod.title}",
  "learning_objectives": ["string", "string", "string"],
  "estimated_duration_minutes": 6,
  "scenes": [
    {
      "title": "Scene title",
      "script_content": "What the presenter says out loud — 80-120 conversational words",
      "slide_content": {
        "title": "Slide title (max 7 words, educational)",
        "subtitle": "One-line key insight or concept being taught",
        "layout": "bullets",
        "theme": "dark-navy",
        "blocks": [
          {
            "type": "bullets",
            "items": [
              { "text": "Key educational fact or concept", "level": 1 },
              { "text": "Supporting detail, example or sub-concept", "level": 2 }
            ]
          }
        ],
        "imagePrompt": "Description of an educational diagram that would help students understand"
      },
      "visual_prompt": "Brief background context",
      "duration_seconds": 45,
      "text_animation_type": "bullet-reveal"
    }
  ]
}`

      const scriptData = await generateJson<ScriptOutput>(systemPrompt, userPrompt)

      // Delete existing scenes for this module
      await prisma.scene.deleteMany({ where: { moduleId: mod.id } })

      // Create scenes in DB
      const scenes = []
      for (let i = 0; i < scriptData.scenes.length; i++) {
        const sceneData = scriptData.scenes[i]
        const scene = await prisma.scene.create({
          data: {
            moduleId: mod.id,
            orderIndex: i,
            scriptContent: sceneData.script_content,
            slideDeckContent: JSON.stringify(sceneData.slide_content || {}),
            visualPrompt: sceneData.visual_prompt,
            textAnimationType: sceneData.text_animation_type || 'bullet-reveal',
            presenterPosition: 'bottom-right',
            durationSeconds: sceneData.duration_seconds,
            status: 'draft',
          },
        })
        scenes.push(scene)
      }

      // Delete existing script for this module
      await prisma.script.deleteMany({ where: { moduleId: mod.id } })

      // Create Script record
      const script = await prisma.script.create({
        data: {
          projectId: body.project_id,
          moduleId: mod.id,
          title: scriptData.title,
          version: 1,
          learningObjectives: JSON.stringify(scriptData.learning_objectives || []),
          sections: JSON.stringify(scriptData.scenes || []),
          estimatedDurationMinutes: scriptData.estimated_duration_minutes || 4,
          status: 'review',
        },
      })

      // Update module status
      await prisma.module.update({
        where: { id: mod.id },
        data: { status: 'script_approved' },
      })

      createdScripts.push({ script, scenes_count: scenes.length })
      context.log(`Script created for ${mod.title}: ${scenes.length} scenes`)
    }

    // Update project status
    await prisma.project.update({
      where: { id: body.project_id },
      data: { status: 'journey_approved' },
    })

    return {
      status: 200,
      jsonBody: {
        success: true,
        scripts_created: createdScripts.length,
        scripts: createdScripts,
      },
    }
  } catch (error: any) {
    context.error('scriptGeneratorAgent error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Script generation failed' } }
  }
}

app.http('scriptGeneratorAgent', {
  methods: ['POST'],
  route: 'scriptGeneratorAgent',
  authLevel: 'anonymous',
  handler: scriptGeneratorAgentHandler,
})