/**
 * POST /api/scriptGeneratorAgent
 *
 * Step 2 of the pipeline.
 * For each approved module, generates a detailed presenter script
 * with scenes, visual prompts, and estimated durations.
 *
 * Written from scratch — no Base44 dependency.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'

interface SceneOutput {
  title: string
  script_content: string
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

Module title: ${mod.title}
Module objective: ${mod.objective || 'Not specified'}
${specialInstructions}

Create 3-5 scenes. Each scene is one section of the video.
The presenter speaks directly to camera — write conversational, engaging text.

Return this exact JSON:
{
  "title": "${mod.title}",
  "learning_objectives": ["string", "string"],
  "estimated_duration_minutes": number,
  "scenes": [
    {
      "title": "string",
      "script_content": "Full text the presenter speaks (2-4 paragraphs)",
      "visual_prompt": "Description of what should appear on screen behind the presenter (for DALL-E image generation)",
      "duration_seconds": number (30-120),
      "text_animation_type": "none" or "bullet-reveal" or "fade-in" or "lower-third"
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
            visualPrompt: sceneData.visual_prompt,
            textAnimationType: sceneData.text_animation_type || 'none',
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
