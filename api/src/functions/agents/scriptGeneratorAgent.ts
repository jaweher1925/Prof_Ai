/**
 * POST /api/scriptGeneratorAgent
 *
 * Step 2 of the pipeline.
 * Reads pre-extracted text from SourceFile.extractedText (saved at upload time)
 * and generates a per-module script: a welcome/objectives scene (#29), a run
 * of content scenes with guaranteed slide bullets (#30), and a closing quiz
 * scene (#31) — all from the professor's actual source materials.
 *
 * Every scene is now made of one or more ordered "segments" (SceneSegment
 * rows): each segment has its own narration text (one ElevenLabs TTS call
 * each) and its own slide elements/animation hints. A plain content scene
 * has exactly one segment; the welcome scene has five (hook → content →
 * content → interaction → recap); the quiz scene has one "question" segment
 * per question. The existing Scene.scriptContent/slideDeckContent fields are
 * still populated too (concatenated text / first-segment slide) so panels
 * that haven't moved to reading segments yet keep working unchanged.
 *
 * No file I/O here — extraction happened once at upload via extractText.ts.
 * URLs are fetched live since their content can change.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'
import { generateJson } from '../../lib/llm'

// ─── Types ────────────────────────────────────────────────────────────────────

type AnimationType = 'fade-in' | 'slide-in-left' | 'slide-in-right' | 'staggered-bullets' | 'pulse'
type SegmentType    = 'hook' | 'content' | 'interaction' | 'recap' | 'question'
type SemanticRole   = 'definition' | 'example' | 'warning' | 'none'

interface SlideElement {
  type:         'title' | 'bullet' | 'image' | 'icon' | 'diagram'
  text?:        string
  imagePrompt?: string
  animation?:   AnimationType
  semanticRole?: SemanticRole
}

/** One sub-slide of a scene — its own narration text (own TTS call) + its own slide. */
interface GeneratedSegment {
  segment_type: SegmentType
  text:         string          // narration script for this segment's own TTS call
  slide_title?: string
  elements:     SlideElement[]  // must include >=1 real bullet/title — see ensureElements() fallback
  image_prompt?: string
  animation?:   AnimationType   // whole-slide entrance animation
}

interface QuizOption { label: string; text: string }
interface QuizQuestion {
  question:             string
  options:              QuizOption[]
  correct_option_label: string
  explanation:          string
}

// ── existing single-slide shape — kept for plain content scenes & back-compat ──
interface SlideBullet  { text: string; level: 1 | 2 }
interface SlideBlock   {
  type:         'bullets' | 'definition' | 'quote' | 'two-column' | 'key-concept'
  items?:       SlideBullet[]
  term?:        string
  definition?:  string
  examples?:    string[]
  quote?:       string
  attribution?: string
  concept?:     string
  left?:        SlideBullet[]
  right?:       SlideBullet[]
}
interface SlideContent {
  title:        string
  subtitle?:    string
  layout:       'title-hero' | 'bullets' | 'split' | 'quote' | 'definition' | 'summary' | 'roadmap'
  theme?:       'dark-navy' | 'ocean' | 'academic' | 'light' | 'corporate'
  blocks:       SlideBlock[]
  imagePrompt?: string
  segments?:    Array<{ segment_type: string; slide_title?: string; text?: string }>
}

interface ContentSceneOutput {
  title:               string
  script_content:      string
  slide_content:       SlideContent
  visual_prompt:       string
  duration_seconds:    number
  text_animation_type: string
}

interface WelcomeSceneOutput {
  title:    string
  segments: GeneratedSegment[]   // hook, content, content, interaction, recap — in that order
}

interface QuizSceneOutput {
  title:     string
  questions: QuizQuestion[]      // 3-5 questions
}

interface ScriptOutput {
  title:                       string
  learning_objectives:         string[]
  welcome_scene:               WelcomeSceneOutput
  content_scenes:              ContentSceneOutput[]
  quiz_scene:                  QuizSceneOutput
  estimated_duration_minutes:  number
}

// ─── URL fetcher (URLs can't be pre-extracted — content may change) ───────────

async function fetchUrlText(url: string, context: InvocationContext): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProfAI/1.0)' },
      signal:  AbortSignal.timeout(8000),
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

/** Build combined source content from DB (no disk reads for uploaded files) */
async function buildSourceContent(
  projectId: string,
  context:   InvocationContext
): Promise<string> {
  const sourceFiles = await prisma.sourceFile.findMany({ where: { projectId } })
  const parts: string[] = []

  for (const file of sourceFiles) {
    let text = ''

    if (file.fileType === 'url') {
      text = await fetchUrlText(file.fileUrl, context)
    } else {
      // All file types: text was extracted at upload and stored in DB
      text = (file.extractedText ?? '').trim()
    }

    if (text) {
      parts.push(`=== ${file.fileName} ===\n${text}`)
      context.log(`  ${file.fileName}: ${text.length} chars`)
    }
  }

  return parts.join('\n\n')
}

// ─── #30 — guarantee non-empty slide content ───────────────────────────────
//
// The LLM is told to always fill bullets, but model output isn't 100%
// reliable. Rather than ship a blank slide, fall back to a focused
// extraction call against the scene's own narration text.

async function extractBullets(sourceText: string, count = 3): Promise<string[]> {
  try {
    const data = await generateJson<{ bullets: string[] }>(
      'You extract short study bullets from narration text. Respond with valid JSON only.',
      `Extract ${count} concise bullet points (max 12 words each) that capture the key facts ` +
      `a student should remember from this narration:\n\n"${sourceText.slice(0, 1200)}"\n\n` +
      `Return exactly: { "bullets": ["...", "...", "..."] }`
    )
    return (data.bullets ?? []).filter(Boolean).slice(0, count)
  } catch {
    return []
  }
}

/** Ensures a content scene's slide_content.blocks has at least one non-empty bullets block. */
async function ensureSlideBullets(scene: ContentSceneOutput): Promise<ContentSceneOutput> {
  const blocks = scene.slide_content?.blocks ?? []
  const hasBullets = blocks.some(b => b.type === 'bullets' && (b.items?.length ?? 0) > 0)
  if (hasBullets) return scene

  const fallbackText = scene.script_content || scene.title
  const bullets = await extractBullets(fallbackText, 3)
  if (!bullets.length) return scene // genuinely nothing to extract from — leave as-is rather than fabricate

  const bulletsBlock: SlideBlock = {
    type:  'bullets',
    items: bullets.map((text, i) => ({ text, level: (i === 0 ? 1 : 2) as 1 | 2 })),
  }
  return {
    ...scene,
    slide_content: {
      ...scene.slide_content,
      blocks: [...blocks.filter(b => b.type !== 'bullets'), bulletsBlock],
    },
  }
}

/** Ensures a generated segment has at least one real bullet/title element. */
async function ensureSegmentElements(segment: GeneratedSegment): Promise<GeneratedSegment> {
  const hasContent = segment.elements.some(el => (el.text ?? '').trim().length > 0)
  if (hasContent) return segment

  const bullets = await extractBullets(segment.text, 2)
  if (!bullets.length) return segment

  return {
    ...segment,
    elements: [
      ...segment.elements,
      ...bullets.map((text): SlideElement => ({ type: 'bullet', text, animation: 'staggered-bullets' })),
    ],
  }
}

// ─── Slide-content fallback builders for legacy single-slide panels ────────

function welcomeLegacySlide(welcome: WelcomeSceneOutput): SlideContent {
  const hook = welcome.segments.find(s => s.segment_type === 'hook')
  const objectiveTagline = (welcome as any).objective || (welcome as any).learning_objective
  
  // Generate roadmap layout showing all 5 segments as a visual flow diagram
  return {
    title:    hook?.slide_title || welcome.title,
    subtitle: typeof objectiveTagline === 'string' ? objectiveTagline.slice(0, 120) : 'Module Overview',
    layout:   'roadmap',
    theme:    'dark-navy',
    blocks:   [],
    // Pass segment metadata for roadmap rendering
    segments: welcome.segments.map(s => ({
      segment_type: s.segment_type,
      slide_title: s.slide_title || s.segment_type.charAt(0).toUpperCase() + s.segment_type.slice(1),
      text: s.text,
    })),
    imagePrompt: hook?.image_prompt,
  }
}

function quizLegacySlide(quiz: QuizSceneOutput): SlideContent {
  return {
    title:  quiz.title || 'Knowledge Check',
    layout: 'summary',
    theme:  'corporate',
    blocks: [{
      type:  'bullets',
      items: quiz.questions.slice(0, 5).map((q, i) => ({ text: q.question, level: (i === 0 ? 1 : 2) as 1 | 2 })),
    }],
  }
}

function buildQuizNarration(quiz: QuizSceneOutput): string {
  return quiz.questions
    .map((q, i) => {
      const opts = q.options.map(o => `${o.label}) ${o.text}`).join('. ')
      // FIXED: Don't include the correct answer in the narration - questions only!
      return `Question ${i + 1}: ${q.question} ${opts}.`
    })
    .join(' ')
}

function buildQuestionSegment(q: QuizQuestion, idx: number): GeneratedSegment {
  const opts = q.options.map(o => `${o.label}) ${o.text}`).join('. ')
  return {
    segment_type: 'question',
    // FIXED: Don't include the correct answer in the segment text - questions only!
    text:         `Question ${idx + 1}: ${q.question} ${opts}.`,
    slide_title:  `Question ${idx + 1}`,
    elements: [
      { type: 'title', text: q.question, animation: 'fade-in' },
      ...q.options.map((o): SlideElement => ({
        type: 'bullet',
        text: `${o.label}) ${o.text}`,
        animation: 'staggered-bullets',
        semanticRole: o.label === q.correct_option_label ? 'definition' : 'none',
      })),
    ],
    animation: 'fade-in',
  }
}

/** Generate auto-designed slides for welcome segment based on its type */
function buildWelcomeSegmentDesign(segment: GeneratedSegment, moduleTitle: string): string {
  const designs: Record<string, SlideContent> = {
    hook: {
      layout: 'title-hero',
      theme: 'ocean',
      title: segment.slide_title || 'Hook',
      subtitle: 'Grab attention',
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet' && el.text)
          .map(el => ({ text: el.text || '', level: 1 }))
      }],
      imagePrompt: segment.image_prompt,
    },
    content: {
      layout: 'bullets',
      theme: 'academic',
      title: segment.slide_title || 'Content',
      subtitle: 'Key concepts',
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet' && el.text)
          .map((el, i) => ({ text: el.text || '', level: i === 0 ? 1 : 2 }))
      }],
      imagePrompt: segment.image_prompt,
    },
    interaction: {
      layout: 'definition',
      theme: 'corporate',
      title: '💡 ' + (segment.slide_title || 'Think About This'),
      subtitle: 'Pause and reflect',
      blocks: [{
        type: 'bullets',
        items: [{text: segment.text || '', level: 1}]
      }],
    },
    recap: {
      layout: 'summary',
      theme: 'dark-navy',
      title: '✓ ' + (segment.slide_title || 'Recap'),
      subtitle: 'Key takeaways',
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet' && el.text)
          .map(el => ({ text: el.text || '', level: 1 }))
      }],
    },
    question: {
      layout: 'bullets',
      theme: 'corporate',
      title: segment.slide_title || 'Question',
      blocks: [{
        type: 'bullets',
        items: segment.elements
          .filter(el => el.type === 'bullet' && el.text)
          .map(el => ({ text: el.text || '', level: 1 }))
      }],
    },
  }
  
  const design = designs[segment.segment_type] || designs.content
  return JSON.stringify(design)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function scriptGeneratorAgentHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { project_id?: string; special_instructions?: string }
    if (!body.project_id) return { status: 400, jsonBody: { error: 'project_id is required' } }
    const projectId = body.project_id

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) return { status: 404, jsonBody: { error: 'Project not found' } }

    const modules = await prisma.module.findMany({
      where:   { projectId: projectId },
      orderBy: { orderIndex: 'asc' },
    })
    if (!modules.length) {
      return { status: 400, jsonBody: { error: 'No modules found. Run the Librarian agent first.' } }
    }

    // ── Load source content once from DB (no re-parsing) ─────────────────────
    context.log(`Loading source content from DB for project ${projectId}…`)
    const sourceContent = await buildSourceContent(projectId, context)
    context.log(`Total source content: ${sourceContent.length} chars`)

    await prisma.project.update({ where: { id: projectId }, data: { status: 'ingesting_sources' } })

    const specialInstructions = body.special_instructions
      ? `\nSpecial instructions: ${body.special_instructions}`
      : ''

    // ── Generate one script per module — run with limited concurrency instead
    // of one-at-a-time, so a 5-module course doesn't serialize 5 full LLM round
    // trips back to back. generateJson() already retries on 429 with backoff,
    // so a couple of concurrent calls is safe and meaningfully faster overall.
    const CONCURRENCY = Math.max(1, parseInt(process.env.SCRIPT_GEN_CONCURRENCY || '3', 10))

    async function generateForModule(mod: typeof modules[number], modIdx: number) {
      context.log(`Generating script for module ${modIdx + 1}/${modules.length}: ${mod.title}`)

      const systemPrompt = `You are an expert instructional designer and scriptwriter for educational video content.
You write engaging, clear presenter scripts for online learning modules, structured around the
hook → learning goal → content → interaction → recap pedagogy.
CRITICAL: Every word must be grounded in the professor's actual source materials provided.
If the source is in French or another language, write all text in that same language.
You ALWAYS fill in real bullet/element text — never leave a slide's bullets or elements empty.
You ALWAYS use only these animation values: "fade-in", "slide-in-left", "slide-in-right", "staggered-bullets", "pulse".
Always respond with valid JSON only — no markdown, no explanation.`

      const userPrompt = `Write a complete module package for this module.

MODULE: ${mod.title}
LEARNING GOAL: ${mod.objective ?? 'Not specified'}

PROFESSOR'S SOURCE MATERIALS — base everything ONLY on this content:
${sourceContent.slice(0, 5000)}

The package has exactly three parts:

1. welcome_scene — a short, student-friendly hook + objectives scene that explains why this module
   matters, told across 5 segments in this exact order and pedagogical role:
   - segment_type "hook": a short, concrete hook (a question, surprising fact, or scenario from the source)
   - segment_type "content": the first main point a student needs, from the source
   - segment_type "content": the second main point a student needs, from the source
   - segment_type "interaction": a short prompt asking the student to pause and think/answer (e.g.
     "Before we continue, think about: ..."), no more than 1-2 sentences
   - segment_type "recap": a one-sentence recap of what this module will cover
   Each segment needs its OWN narration text (60-90 words for hook/content, shorter for
   interaction/recap) and its OWN "elements" array (a "title" element plus 1-3 "bullet" elements
   with real text from the source — never leave elements empty). Add an "image_prompt" on the hook
   segment describing a simple, original educational illustration (flat/infographic style, never
   referencing real people or copyrighted characters).

2. content_scenes — exactly 4 scenes covering the module's sub-topics in depth. Each scene has:
   - script_content: ONLY what the presenter says — natural conversational speech, 60-90 words
   - slide_content: ONLY what students read — a DIFFERENT, structured text from the speech, with
     a "blocks" array that MUST include at least one "bullets" block with 2-3 real items pulled
     from the source (never an empty blocks array)
   - visual_prompt, duration_seconds, text_animation_type (one of: "slow-zoom-in", "zoom-out",
     "pan-left", "pan-right", "ken-burns", "static")

3. quiz_scene — a closing knowledge check with 3-5 multiple-choice questions testing the module's
   key ideas. Each question has 3-4 options (labeled "A","B","C","D"), a correct_option_label, and
   a short (1-2 sentence) explanation of why that answer is correct.
${specialInstructions}

Total estimated duration must not exceed 6 minutes (360 seconds) across welcome + content + quiz.

Return this exact JSON shape:
{
  "title": "${mod.title}",
  "learning_objectives": ["objective 1 from source", "objective 2 from source", "objective 3 from source"],
  "estimated_duration_minutes": 6,
  "welcome_scene": {
    "title": "Welcome scene title",
    "segments": [
      {
        "segment_type": "hook",
        "text": "Hook narration from source",
        "slide_title": "Short hook title",
        "elements": [
          { "type": "title", "text": "Short hook title" },
          { "type": "bullet", "text": "Concrete detail from source", "animation": "fade-in" }
        ],
        "image_prompt": "Simple flat-style educational illustration",
        "animation": "fade-in"
      }
    ]
  },
  "content_scenes": [
    {
      "title": "Scene title",
      "script_content": "What the presenter says — 60-90 conversational words from source content",
      "slide_content": {
        "title": "Slide title (max 7 words)",
        "subtitle": "One-line key insight from source",
        "layout": "bullets",
        "theme": "light",
        "blocks": [
          {
            "type": "bullets",
            "items": [
              { "text": "Specific fact or concept from source", "level": 1 },
              { "text": "Supporting detail from source",        "level": 2 }
            ]
          }
        ],
        "imagePrompt": "Educational diagram that illustrates the concept"
      },
      "visual_prompt": "Brief visual context",
      "duration_seconds": 45,
      "text_animation_type": "ken-burns"
    }
  ],
  "quiz_scene": {
    "title": "Knowledge Check",
    "questions": [
      {
        "question": "Question testing a key idea from source",
        "options": [
          { "label": "A", "text": "Option A" },
          { "label": "B", "text": "Option B" },
          { "label": "C", "text": "Option C" }
        ],
        "correct_option_label": "B",
        "explanation": "Why B is correct, grounded in the source"
      }
    ]
  }
}`

      const scriptData = await generateJson<ScriptOutput>(systemPrompt, userPrompt)

      // ── #30 — backfill any empty bullets/elements before saving ─────────────
      const welcome = scriptData.welcome_scene
      welcome.segments = await Promise.all(welcome.segments.map(ensureSegmentElements))

      const contentScenes = await Promise.all(scriptData.content_scenes.map(ensureSlideBullets))

      const quiz = scriptData.quiz_scene

      // ── Save scenes ───────────────────────────────────────────────────────
      await prisma.scene.deleteMany({ where: { moduleId: mod.id } }) // cascades to scene_segments

      const scenes = []
      let orderIndex = 0

      // Scene 0 — welcome/objectives (#29). scriptContent/slideDeckContent hold a
      // legacy single-clip/single-slide view; the real per-segment data lives in
      // scene_segments for the segment-aware renderer to pick up next.
      {
        const legacySlide = welcomeLegacySlide(welcome)
        const welcomeDuration = welcome.segments.reduce((sum, s) => sum + Math.max(3, s.text.split(' ').length / 2.5), 0)
        const welcomeScene = await prisma.scene.create({
          data: {
            moduleId:           mod.id,
            orderIndex:         orderIndex++,
            sceneKind:          'welcome',
            scriptContent:      welcome.segments.map(s => s.text).join(' '),
            slideDeckContent:   JSON.stringify(legacySlide),
            visualPrompt:       welcome.segments.find(s => s.segment_type === 'hook')?.image_prompt ?? '',
            textAnimationType:  welcome.segments[0]?.animation ?? 'fade-in',
            presenterPosition:  'bottom-right',
            durationSeconds:    welcomeDuration,
            status:             'draft',
          },
        })
        for (let i = 0; i < welcome.segments.length; i++) {
          const seg = welcome.segments[i]
          await prisma.sceneSegment.create({
            data: {
              sceneId:     welcomeScene.id,
              orderIndex:  i,
              segmentType: seg.segment_type,
              text:        seg.text,
              slideTitle:  seg.slide_title,
              elements:    JSON.stringify(seg.elements ?? []),
              imagePrompt: seg.image_prompt,
              animation:   seg.animation,
              // AUTO-DESIGN: Each welcome segment gets a designed slide
              slideDesign: buildWelcomeSegmentDesign(seg, mod.title),
            },
          })
        }
        scenes.push(welcomeScene)
      }

      // Scenes 1-4 — content (#30: bullets already guaranteed above).
      for (const s of contentScenes) {
        const scene = await prisma.scene.create({
          data: {
            moduleId:           mod.id,
            orderIndex:         orderIndex++,
            sceneKind:          'content',
            scriptContent:      s.script_content,
            slideDeckContent:   JSON.stringify(s.slide_content ?? {}),
            visualPrompt:       s.visual_prompt,
            textAnimationType:  s.text_animation_type ?? 'bullet-reveal',
            presenterPosition:  'bottom-right',
            durationSeconds:    s.duration_seconds,
            status:             'draft',
          },
        })
        const bulletsBlock = s.slide_content?.blocks?.find(b => b.type === 'bullets')
        await prisma.sceneSegment.create({
          data: {
            sceneId:     scene.id,
            orderIndex:  0,
            segmentType: 'content',
            text:        s.script_content,
            slideTitle:  s.slide_content?.title,
            elements: JSON.stringify([
              { type: 'title', text: s.slide_content?.title },
              ...(bulletsBlock?.items ?? []).map(it => ({ type: 'bullet', text: it.text, animation: 'staggered-bullets' })),
            ]),
            imagePrompt: s.slide_content?.imagePrompt,
            animation:   s.text_animation_type === 'static' ? 'fade-in' : undefined,
            // AUTO-DESIGN: Create a designed slide for each content segment
            slideDesign: JSON.stringify({
              layout: 'bullets',
              theme: 'academic',
              title: s.slide_content?.title || 'Content',
              subtitle: 'Key points to understand',
              blocks: [{
                type: 'bullets',
                items: (bulletsBlock?.items ?? []).map((it, i) => ({ text: it.text, level: i === 0 ? 1 : 2 }))
              }],
              imagePrompt: s.slide_content?.imagePrompt,
            }),
          },
        })
        scenes.push(scene)
      }

      // Scene 5 — quiz (#31), narrated video with no interactivity. quizData holds
      // the structured questions for future UI; segments hold one per-question clip.
      {
        const quizScene = await prisma.scene.create({
          data: {
            moduleId:           mod.id,
            orderIndex:         orderIndex++,
            sceneKind:          'quiz',
            scriptContent:      buildQuizNarration(quiz),
            slideDeckContent:   JSON.stringify(quizLegacySlide(quiz)),
            quizData:           JSON.stringify(quiz.questions ?? []),
            textAnimationType:  'fade-in',
            presenterPosition:  'bottom-right',
            durationSeconds:    quiz.questions.length * 12,
            status:             'draft',
          },
        })
        for (let i = 0; i < quiz.questions.length; i++) {
          const seg = buildQuestionSegment(quiz.questions[i], i)
          await prisma.sceneSegment.create({
            data: {
              sceneId:     quizScene.id,
              orderIndex:  i,
              segmentType: seg.segment_type,
              text:        seg.text,
              slideTitle:  seg.slide_title,
              elements:    JSON.stringify(seg.elements ?? []),
              animation:   seg.animation,
              // AUTO-DESIGN: Each quiz segment gets a designed slide
              slideDesign: buildWelcomeSegmentDesign(seg, mod.title),
            },
          })
        }
        scenes.push(quizScene)
      }

      // ── Save script record ────────────────────────────────────────────────
      await prisma.script.deleteMany({ where: { moduleId: mod.id } })

      const script = await prisma.script.create({
        data: {
          projectId:               projectId,
          moduleId:                mod.id,
          title:                   scriptData.title,
          version:                 1,
          learningObjectives:      JSON.stringify(scriptData.learning_objectives ?? []),
          sections:                JSON.stringify({ welcome, content_scenes: contentScenes, quiz_scene: quiz }),
          estimatedDurationMinutes: scriptData.estimated_duration_minutes ?? 6,
          status:                  'review',
        },
      })

      await prisma.module.update({ where: { id: mod.id }, data: { status: 'script_approved' } })

      context.log(`  → ${scenes.length} scenes created for "${mod.title}" (welcome + ${contentScenes.length} content + quiz)`)
      return { script, scenes_count: scenes.length }
    }

    // Simple concurrency-limited map: keeps at most CONCURRENCY LLM calls in
    // flight at once while still returning results in module order.
    const results: Array<{ script: any; scenes_count: number }> = new Array(modules.length)
    let nextIdx = 0
    async function worker() {
      while (nextIdx < modules.length) {
        const i = nextIdx++
        results[i] = await generateForModule(modules[i], i)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, modules.length) }, () => worker()))

    const createdScripts = results

    await prisma.project.update({ where: { id: projectId }, data: { status: 'journey_approved' } })

    return {
      status:   200,
      jsonBody: {
        success:         true,
        scripts_created: createdScripts.length,
        scripts:         createdScripts,
      },
    }

  } catch (error: any) {
    context.error('scriptGeneratorAgent error:', error)
    return { status: 500, jsonBody: { error: error.message ?? 'Script generation failed' } }
  }
}

app.http('scriptGeneratorAgent', {
  methods:   ['POST'],
  route:     'scriptGeneratorAgent',
  authLevel: 'anonymous',
  handler:   scriptGeneratorAgentHandler,
})
