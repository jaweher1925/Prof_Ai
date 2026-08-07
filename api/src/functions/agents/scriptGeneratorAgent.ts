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
 * has exactly one segment; the welcome scene has four (hook → content →
 * content → recap — interaction removed to keep it simple, #42); the quiz
 * scene has one "question" segment
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

// Every scene kind used to seed its slide with a DIFFERENT hardcoded theme —
// hook='ocean' (dark blue), content='academic' (light cream), recap=
// 'dark-navy', quiz/interaction='corporate' — so a freshly generated module
// was mixed-theme from the moment it was created, before the user ever
// touched Visual Designer or picked anything (reported: uploaded slide
// thumbnails showing inconsistent themes even for never-opened modules).
// Visual Designer only overwrites a module's scenes to a consistent theme
// when the user happens to open THAT module, so unvisited ones stayed
// mixed forever. One shared seed theme here means every module starts
// consistent by default — still fully overridable per-scene afterward, this
// only changes what a scene looks like before anyone has edited it.
// 'light' matches the fallback default used everywhere else in the app
// (e.g. VisualDesignerPanel's `parsed.theme || 'light'`).
const DEFAULT_SEED_THEME = 'light'

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

// Content scenes used to be ONE narrated segment whose slide crammed 2-3
// bullet points onto one slide together — narrated in one breath, one HeyGen
// render. That undercounted the real number of "points" in the course (a
// scene showing 3 bullets was still just 1 scene/1 render), and it meant a
// student couldn't get a beat between distinct facts. Content scenes now use
// the exact same "segments" shape as the welcome scene: one scene = one
// sub-topic, split into N segments = N individual points, each with its own
// narration (own TTS call), its own single-point slide, and its own avatar
// render — never bundled together. See scriptGeneratorAgentHandler's prompt
// for the generation-side rules and the save loop below for how this maps to
// Scene (one per sub-topic) + SceneSegment (one per point) rows.
interface ContentSceneOutput {
  title:                string
  visual_prompt:        string
  text_animation_type?: string
  segments:             GeneratedSegment[]   // one per key point — segment_type is always "content"
}

interface WelcomeSceneOutput {
  title:    string
  segments: GeneratedSegment[]   // hook, content, content, recap — in that order (interaction removed, #42)
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
    theme:    DEFAULT_SEED_THEME,
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

/** Combined summary slide for Scene.slideDeckContent — legacy/back-compat only
 *  (mirrors welcomeLegacySlide). The REAL per-point slides live in each
 *  segment's own slideDesign (buildContentPointDesign below); this just gives
 *  any code still reading the scene-level field a reasonable all-points view
 *  instead of an empty one. */
function contentLegacySlide(scene: ContentSceneOutput): SlideContent {
  return {
    title:  scene.title,
    layout: 'bullets',
    theme:  DEFAULT_SEED_THEME,
    blocks: [{
      type:  'bullets',
      items: scene.segments.map((seg): SlideBullet => ({
        text:  seg.elements?.find(el => el.type === 'bullet')?.text || seg.slide_title || seg.text,
        level: 1,
      })),
    }],
    imagePrompt: scene.segments.find(seg => seg.image_prompt)?.image_prompt,
  }
}

/** One point's own slide — single-bullet, focused on just that one fact
 *  (never bundled with sibling points). sceneTitle is shared across every
 *  point in the scene so the run of slides visually reads as "one topic,
 *  told one point at a time"; slide_title becomes this point's own short
 *  label/key-insight, shown as the subtitle. */
function buildContentPointDesign(point: GeneratedSegment, sceneTitle: string): string {
  const items: SlideBullet[] = point.elements?.length
    ? point.elements
        .filter(el => el.type === 'bullet' && el.text)
        .map((el): SlideBullet => ({ text: el.text || '', level: 1 }))
    : [{ text: point.text || 'Key point', level: 1 as const }]
  const design: SlideContent = {
    layout: 'bullets',
    theme: DEFAULT_SEED_THEME,
    title: sceneTitle,
    subtitle: point.slide_title || '',
    blocks: [{ type: 'bullets', items }],
    imagePrompt: point.image_prompt,
  }
  return JSON.stringify(design)
}

function quizLegacySlide(quiz: QuizSceneOutput): SlideContent {
  return {
    title:  quiz.title || 'Knowledge Check',
    layout: 'summary',
    theme:  DEFAULT_SEED_THEME,
    blocks: [{
      type:  'bullets',
      // Each question is its own independent point, not a sub-detail of the
      // one before it — all level 1.
      items: quiz.questions.slice(0, 5).map((q): SlideBullet => ({ text: q.question, level: 1 })),
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
    // The QUESTION itself is the slide title (shows in Visual Design's Slide
    // Title field), so the options below read as its answer points — no separate
    // duplicate title element.
    slide_title:  q.question,
    elements: q.options.map((o): SlideElement => ({
      type: 'bullet',
      text: `${o.label}) ${o.text}`,
      animation: 'staggered-bullets',
      semanticRole: o.label === q.correct_option_label ? 'definition' : 'none',
    })),
    animation: 'fade-in',
  }
}

/** Generate auto-designed slides for welcome segment based on its type.
 *  objectiveTagline (#17): the hook's subtitle used to be a hardcoded
 *  "Course Overview: 4-step learning journey" on EVERY module — that's not a
 *  key insight about THIS module, just generic boilerplate, so the intro
 *  slide always looked like it had none (reported: "there is no key insight
 *  in first scene (intro layout)"). welcomeLegacySlide() (used for the
 *  scene-level roadmap view) already derives a real per-module tagline from
 *  the LLM's own objective/learning_objective field — this just reuses that
 *  same value for the actual per-segment design Visual Designer edits and
 *  renders from, instead of computing it twice or leaving it generic. */
function buildWelcomeSegmentDesign(segment: GeneratedSegment, moduleTitle: string, objectiveTagline?: string): string {
  const designs: Record<string, SlideContent> = {
    hook: {
      layout: 'title-hero',
      theme: DEFAULT_SEED_THEME,
      title: segment.slide_title || moduleTitle || 'Introduction',
      subtitle: objectiveTagline?.trim() || 'Course Overview: 4-step learning journey',
      // Was hardcoded to the same 4 generic "1. Hook - Get curious / 2.
      // Content - Learn key concepts / ..." lines on EVERY module, completely
      // ignoring the LLM's own hook-specific content — the prompt already
      // asks for a real "title + 1-3 bullet" elements array here (a concrete
      // hook detail from THIS module's source material, see the prompt spec
      // above), it just wasn't being read (reported: "not the same design
      // content"). Mirrors the 'content' case's own elements-first pattern
      // just below.
      blocks: [{
        type: 'bullets',
        items: segment.elements?.length
          ? segment.elements
              .filter(el => el.type === 'bullet' && el.text)
              .map((el): SlideBullet => ({ text: el.text || '', level: 1 }))
          : [{ text: segment.text || 'Welcome to this module', level: 1 }]
      }],
      imagePrompt: segment.image_prompt,
    },
    content: {
      layout: 'bullets',
      theme: DEFAULT_SEED_THEME,
      title: segment.slide_title || 'Key Learning Points',
      subtitle: 'Essential concepts from this module',
      blocks: [{
        type: 'bullets',
        items: segment.elements?.length
          ? segment.elements
              .filter(el => el.type === 'bullet' && el.text)
              // Each generated bullet is its own point, not a sub-detail of
              // whichever one happens to come first — all level 1, matching
              // the recap/interaction/question cases below.
              .map((el): SlideBullet => ({ text: el.text || '', level: 1 }))
          : [{text: segment.text || 'Key learning points', level: 1}]
      }],
      imagePrompt: segment.image_prompt,
    },
    interaction: {
      layout: 'definition',
      theme: DEFAULT_SEED_THEME,
      title: '💡 ' + (segment.slide_title || 'Think About This'),
      subtitle: 'Pause and reflect on what you learned',
      blocks: [{
        type: 'bullets',
        items: [{text: segment.text || 'Take a moment to think about this concept', level: 1}]
      }],
    },
    recap: {
      layout: 'summary',
      theme: DEFAULT_SEED_THEME,
      title: '✓ ' + (segment.slide_title || 'What You Learned'),
      subtitle: 'Summary of key takeaways',
      blocks: [{
        type: 'bullets',
        items: segment.elements?.length
          ? segment.elements
              .filter(el => el.type === 'bullet' && el.text)
              .map(el => ({ text: el.text || '', level: 1 }))
          : [{text: segment.text || 'Key points to remember', level: 1}]
      }],
    },
    question: {
      layout: 'bullets',
      theme: DEFAULT_SEED_THEME,
      title: segment.slide_title || 'Question',
      blocks: [{
        type: 'bullets',
        items: segment.elements?.length
          ? segment.elements
              .filter(el => el.type === 'bullet' && el.text)
              .map(el => ({ text: el.text || '', level: 1 }))
          : [{text: segment.text || 'Test your knowledge', level: 1}]
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
hook → learning goal → content → recap pedagogy.
CRITICAL: Every word must be grounded in the professor's actual source materials provided.
If the source is in French or another language, write all text in that same language.
You ALWAYS fill in real bullet/element text — never leave a slide's bullets or elements empty.
You ALWAYS use only these animation values: "fade-in", "slide-in-left", "slide-in-right", "staggered-bullets", "pulse".
Always respond with valid JSON only — no markdown, no explanation.`

      const userPrompt = `Write a complete module package for this module.

MODULE: ${mod.title}
MODULE INDEX: ${modIdx + 1} of ${modules.length}
LEARNING GOAL: ${mod.objective ?? 'Not specified'}
MODULE DESCRIPTION: This is module ${modIdx + 1} in a ${modules.length}-module course. Create a UNIQUE welcome scene specific to this module's topic, NOT a generic course introduction.

PROFESSOR'S SOURCE MATERIALS — base everything ONLY on this content:
${sourceContent.slice(0, 5000)}

The package has exactly three parts:

1. welcome_scene — a SHORT, UNIQUE, MODULE-SPECIFIC student-friendly hook + objectives scene that explains why THIS SPECIFIC MODULE matters.
   DO NOT write a generic "welcome to the course" scene — write an introduction specific to this module's topic (${mod.title}).
   This welcome scene tells across 4 segments in this exact order and pedagogical role:
   - segment_type "hook": a short, concrete hook specific to this module's topic (a question, surprising fact, or scenario from the source) — 30-40 words max
   - segment_type "content": the first main point a student needs from this module, from the source — 30-40 words max
   - segment_type "content": the second main point a student needs from this module, from the source — 30-40 words max
   - segment_type "recap": a one-sentence recap of what THIS MODULE will specifically cover — 15-20 words max
   Each segment needs its OWN narration text (keep as short as specified above) and its OWN "elements" array (a "title" element plus 1-3 "bullet" elements
   with real text from the source — never leave elements empty). Add an "image_prompt" on the hook
   segment describing a simple, original educational illustration (flat/infographic style, never
   referencing real people or copyrighted characters).

2. content_scenes — AS MANY SCENES AS THE SOURCE MATERIAL ACTUALLY SUPPORTS, covering the
   module's sub-topics in depth. Do not pad with filler scenes, and do not compress distinct
   sub-topics into one scene just to hit a target count — one scene per genuinely distinct idea.
   A short source might only support 2-3 scenes; a rich one might support 8-10+.

   Each scene covers ONE sub-topic and is told through its own "segments" array — one segment PER
   distinct key point under that sub-topic (usually 1-3 points per scene, more if the sub-topic
   genuinely has more distinct facts). NEVER narrate two different points together in one
   segment's text, and NEVER put more than one point's worth of content on one slide — each point
   gets its OWN short narration (its own TTS clip and its own avatar render) and its OWN focused,
   single-point slide, exactly like the welcome scene's segments above. If a sub-topic genuinely
   has only one point, one segment is correct — don't invent a second point just to split it.

   Each scene has:
   - title: the scene's shared topic title (max 7 words) — shown on every one of its point-slides
   - visual_prompt: brief visual context, keep static background
   - text_animation_type: one of "slow-zoom-in", "zoom-out", "pan-left", "pan-right", "ken-burns", "static"
   - segments: the points, each with:
     * segment_type: always "content"
     * text: ONLY what the presenter says for THIS ONE point — natural conversational speech,
       grounded in the source, 20-35 words (short, because it's one point, not the whole scene)
     * slide_title: a short (max 8 words) label for this specific point — shown as the slide's
       key-insight subtitle
     * elements: a "title" element (repeat the scene's title) plus exactly ONE "bullet" element
       with the concise on-screen version of THIS point (max 12 words) — never more than one
       bullet per segment, that's what would bundle points back together
     * image_prompt: only on the scene's FIRST segment, a simple flat-style educational
       illustration for the whole sub-topic (later points in the same scene don't need their own)

3. quiz_scene — a closing knowledge check with 3-5 multiple-choice questions testing the module's
   key ideas. Each question has 3-4 options (labeled "A","B","C","D"), a correct_option_label, and
   a short (1-2 sentence) explanation of why that answer is correct.
${specialInstructions}

SCENE COUNT: Not fixed. Let the amount of distinct, genuinely covered sub-topics in the source
material decide how many content_scenes to write — could be as few as 2 or as many as 10+.
Total estimated duration should stay reasonable for a single module (aim for 4-10 minutes across
welcome + content + quiz, but content depth matters more than hitting a specific time).

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
      "title": "Scene title (shared topic for all points below)",
      "visual_prompt": "Brief visual context, keep static background",
      "text_animation_type": "static",
      "segments": [
        {
          "segment_type": "content",
          "text": "What the presenter says about ONLY this first point — 20-35 conversational words from source",
          "slide_title": "Short label for this point (max 8 words)",
          "elements": [
            { "type": "title", "text": "Scene title (shared topic for all points below)" },
            { "type": "bullet", "text": "Concise on-screen version of this point (max 12 words)", "animation": "staggered-bullets" }
          ],
          "image_prompt": "Simple flat-style educational illustration for the whole sub-topic",
          "animation": "fade-in"
        },
        {
          "segment_type": "content",
          "text": "What the presenter says about the SECOND, separate point — 20-35 words from source",
          "slide_title": "Short label for this second point",
          "elements": [
            { "type": "title", "text": "Scene title (shared topic for all points below)" },
            { "type": "bullet", "text": "Concise on-screen version of this second point", "animation": "staggered-bullets" }
          ],
          "animation": "fade-in"
        }
      ]
    }
  ],
  "quiz_scene": {
    "title": "Knowledge Check",
    "questions": [
      {
        "question": "Question testing a key idea from source",
        "options": [
          { "label": "A", "text": "Option A from source material" },
          { "label": "B", "text": "Option B from source material" },
          { "label": "C", "text": "Option C from source material" }
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

      // Same backfill as the welcome segments — a content point missing real
      // bullet/title text gets one extracted from its own narration rather
      // than shipping an empty slide.
      const contentScenes = await Promise.all(
        scriptData.content_scenes.map(async (cs) => ({
          ...cs,
          segments: await Promise.all((cs.segments ?? []).map(ensureSegmentElements)),
        }))
      )

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
              slideDesign: buildWelcomeSegmentDesign(seg, mod.title, legacySlide.subtitle),
            },
          })
        }
        scenes.push(welcomeScene)
      }

      // Scenes N — content. No fixed cap on scene count (however many distinct
      // sub-topics the LLM found), and no fixed cap on points per scene either.
      // Each point is its OWN segment — own narration, own single-point slide,
      // own avatar render — never bundled together (see ContentSceneOutput doc
      // comment above and the prompt's content_scenes instructions below).
      for (const s of contentScenes) {
        const points = s.segments.length ? s.segments : [{
          segment_type: 'content' as const, text: s.title, elements: [], slide_title: s.title,
        }]
        const sceneDuration = points.reduce((sum, seg) => sum + Math.max(3, seg.text.split(' ').length / 2.5), 0)
        const scene = await prisma.scene.create({
          data: {
            moduleId:           mod.id,
            orderIndex:         orderIndex++,
            sceneKind:          'content',
            scriptContent:      points.map(seg => seg.text).join(' '),
            slideDeckContent:   JSON.stringify(contentLegacySlide({ ...s, segments: points })),
            visualPrompt:       s.visual_prompt,
            textAnimationType:  s.text_animation_type ?? 'bullet-reveal',
            presenterPosition:  'bottom-right',
            durationSeconds:    sceneDuration,
            status:             'draft',
          },
        })
        for (let i = 0; i < points.length; i++) {
          const point = points[i]
          await prisma.sceneSegment.create({
            data: {
              sceneId:     scene.id,
              orderIndex:  i,
              segmentType: 'content',
              text:        point.text,
              slideTitle:  point.slide_title,
              elements: JSON.stringify(point.elements?.length ? point.elements : [
                { type: 'title', text: s.title },
                { type: 'bullet', text: point.slide_title || point.text, animation: 'staggered-bullets' },
              ]),
              imagePrompt: point.image_prompt,
              animation:   point.animation ?? (s.text_animation_type === 'static' ? 'fade-in' : undefined),
              // AUTO-DESIGN: each point gets its own single-bullet slide,
              // titled with the scene's shared topic — see buildContentPointDesign.
              slideDesign: buildContentPointDesign(point, s.title),
            },
          })
        }
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

      context.log(`  ✓ ${scenes.length} scenes (welcome + ${contentScenes.length} content + quiz) — no fixed cap`)

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
