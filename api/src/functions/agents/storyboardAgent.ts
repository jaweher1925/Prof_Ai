/**
 * POST /api/storyboardAgent
 *
 * Reads all scene transcripts for a project and generates storyboard data:
 * - visual_prompt   (cinematic scene description)
 * - motion_style    (Slow Zoom In / Zoom Out / Pan Left / Pan Right / Ken Burns / Static)
 * - text_cues       (key terms to overlay on screen with duration)
 *
 * The narration text is NEVER rewritten — it comes directly from scriptContent.
 * This agent only adds visual/motion metadata on top of the exact transcript.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'

interface TextCue {
  text: string
  duration_seconds: number
}

interface StoryboardScene {
  scene_id: string
  visual_prompt: string
  motion_style: 'Slow Zoom In' | 'Zoom Out' | 'Pan Left' | 'Pan Right' | 'Ken Burns' | 'Static'
  text_cues: TextCue[]
  slide_title: string
  slide_subtitle: string
  slide_bullets: string[]
}

interface StoryboardOutput {
  scenes: StoryboardScene[]
}

async function storyboardAgentHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { project_id?: string; module_id?: string }

    if (!body.project_id && !body.module_id) {
      return { status: 400, jsonBody: { error: 'project_id or module_id is required' } }
    }

    // Fetch scenes — either for a whole project or a single module
    const scenes = body.module_id
      ? await prisma.scene.findMany({
          where: { moduleId: body.module_id },
          orderBy: { orderIndex: 'asc' },
          include: { module: true },
        })
      : await prisma.scene.findMany({
          where: { module: { projectId: body.project_id } },
          orderBy: [{ module: { orderIndex: 'asc' } }, { orderIndex: 'asc' }],
          include: { module: true },
        })

    if (!scenes.length) {
      return { status: 400, jsonBody: { error: 'No scenes found. Generate scripts first.' } }
    }

    context.log(`Storyboard: processing ${scenes.length} scene(s)`)

    // Build the transcript list for the LLM
    const transcriptList = scenes.map((s, i) => (
      `Scene ${i + 1} [ID: ${s.id}] (${s.module?.title || 'Module'}):\n"${s.scriptContent}"`
    )).join('\n\n')

    const systemPrompt = `You are an expert video storyboard director.
You receive exact narration transcripts and generate visual + motion metadata for each scene.
CRITICAL: Do NOT rewrite, summarize, or change the narration text. Only generate visual/motion data.
Always respond with valid JSON only.`

    const userPrompt = `Generate storyboard data for each scene below.

TRANSCRIPTS:
${transcriptList}

RULES:
- visual_prompt: cinematic, dark tech aesthetic (deep navy/charcoal bg, glowing icons, flat symbols, data visuals, no people unless specified). 2-3 sentences.
- motion_style: pick the most fitting — "Slow Zoom In" (tension/emphasis), "Zoom Out" (big picture), "Pan Left" (left-to-right flow), "Pan Right" (right-to-left), "Ken Burns" (documentary), "Static" (definitions/calm)
- text_cues: 1-3 key terms/phrases from the narration that should appear on screen as overlays (1-2 second duration each)
- slide_title: short title for the slide (max 8 words, educational)
- slide_subtitle: one-line key insight students should take away
- slide_bullets: 3-5 educational bullet points about this scene's topic (what students READ, NOT what the narrator says)

Return this exact JSON:
{
  "scenes": [
    {
      "scene_id": "the scene ID from the transcript header",
      "visual_prompt": "Cinematic dark-tech description...",
      "motion_style": "Slow Zoom In",
      "text_cues": [
        { "text": "Key Term", "duration_seconds": 1.5 }
      ],
      "slide_title": "Educational slide title",
      "slide_subtitle": "Key insight for students",
      "slide_bullets": ["Bullet 1", "Bullet 2", "Bullet 3"]
    }
  ]
}`

    const result = await generateJson<StoryboardOutput>(systemPrompt, userPrompt)

    if (!result.scenes?.length) {
      throw new Error('LLM returned no scenes')
    }

    // Save storyboard data back to each scene
    let updated = 0
    for (const sb of result.scenes) {
      try {
        const slideContent = {
          title: sb.slide_title,
          subtitle: sb.slide_subtitle,
          layout: 'bullets',
          blocks: [{
            type: 'bullets',
            items: sb.slide_bullets.map(t => ({ text: t, level: 1 })),
          }],
        }

        await prisma.scene.update({
          where: { id: sb.scene_id },
          data: {
            visualPrompt: sb.visual_prompt,
            textAnimationType: sb.motion_style.toLowerCase().replace(/\s+/g, '-'),
            textCues: JSON.stringify(sb.text_cues),
            slideDeckContent: JSON.stringify(slideContent),
          },
        })
        updated++
      } catch (e: any) {
        context.warn(`Failed to update scene ${sb.scene_id}: ${e.message}`)
      }
    }

    context.log(`Storyboard complete — ${updated}/${result.scenes.length} scenes updated`)

    return {
      status: 200,
      jsonBody: {
        success: true,
        scenes_updated: updated,
        scenes: result.scenes,
      },
    }
  } catch (error: any) {
    context.error('storyboardAgent error:', error)
    return { status: 500, jsonBody: { error: error.message || 'Storyboard generation failed' } }
  }
}

app.http('storyboardAgent', {
  methods: ['POST'],
  route: 'storyboardAgent',
  authLevel: 'anonymous',
  handler: storyboardAgentHandler,
})
