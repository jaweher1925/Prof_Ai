import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { projectsService } from '@/services/projects'
import {
  FileText, Sparkles, Loader2, CheckCircle, ChevronDown, ChevronUp, Lock,
  AlertTriangle, RotateCcw, BookOpen, Edit2, Save, X, ArrowRight, ArrowLeft,
  ClipboardCheck
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'

const STATUS_BADGE = {
  review:   { label: 'Draft',     variant: 'default' },
  // 'yellow' reads as in-progress/warning, not "done" — approved is a
  // finished state (same family as 'locked' below), so it should use the
  // same green the app already uses for "done".
  approved: { label: 'Approved',  variant: 'green' },
  draft:    { label: 'Draft',     variant: 'default' },
  locked:   { label: '🔒 Locked', variant: 'green' },
}

/**
 * CASCADE INVALIDATION RULES (Sequential Pipeline)
 *
 * When ANY step is edited, all downstream steps must be locked until
 * that step is re-generated/re-approved.
 *
 * Current Implementation:
 * ✅ Step 1 (Library): Edit sources → Delete scripts → Lock steps 2-7
 * ✅ Step 2 (Scripts): Edit script text → Clear voice ID → Lock steps 3-7
 *
 * Future Implementation:
 * TODO Step 3 (Voices): Change voice → Clear visual design settings
 * TODO Step 4 (Visual Design): Edit design → Clear avatar/video settings
 * TODO Step 5 (Video Editing): Edit videos → Clear avatar/video settings
 * TODO Step 6 (Avatar Studio): Edit avatar → Clear final video
 */

// script.sections changed shape (#29/#30/#31) from a flat array of scenes to
// { welcome: { segments: [...] }, content_scenes: [...], quiz_scene: { questions: [...] } }.
// Normalize either shape into one flat list of editable items so review/edit
// works regardless of which shape a given script has (old scripts saved
// before this change keep working too).

// Content blocks are "one main idea + its nested supporting points" —
// { text, keyPoints } — the same shape the Visual Designer's SlideComposition
// already uses (see compositions.ts's ContentBlockEntry). Reusing it here
// keeps the two editors consistent instead of inventing a second shape.
function bulletsToBlocks(items) {
  const blocks = []
  for (const it of items || []) {
    if (it.level === 2 && blocks.length) {
      blocks[blocks.length - 1].keyPoints.push(it.text)
    } else {
      blocks.push({ text: it.text, keyPoints: [] })
    }
  }
  return blocks
}

function blocksToBulletItems(blocks) {
  const items = []
  for (const b of blocks || []) {
    if (b.text?.trim()) items.push({ text: b.text, level: 1 })
    for (const kp of b.keyPoints || []) {
      if (kp?.trim()) items.push({ text: kp, level: 2 })
    }
  }
  return items
}

function buildDisplayItems(sections) {
  if (Array.isArray(sections)) {
    return sections.map((scene, i) => {
      const bulletItems = scene.slide_content?.blocks?.[0]?.items || []
      return {
        kind:         'legacy',
        idx:          i,
        title:        scene.title,
        text:         scene.script_content,
        duration:     scene.duration_seconds,
        slideContent: scene.slide_content || {},
        contentBlocks: scene.content_blocks?.length ? scene.content_blocks : bulletsToBlocks(bulletItems),
        imageDescription: scene.image_description || '',
      }
    })
  }

  const items = []

  const welcome = sections?.welcome
  if (welcome?.segments?.length) {
    welcome.segments.forEach((seg, i) => {
      const bullets = (seg.elements || []).filter(e => e.type === 'bullet').map(e => ({ text: e.text, level: e.level || 1 }))
      const contentBlocks = seg.content_blocks?.length ? seg.content_blocks : bulletsToBlocks(bullets)
      items.push({
        kind:         'welcome',
        idx:          i,
        title:        seg.slide_title || `Welcome — ${seg.segment_type || `part ${i + 1}`}`,
        text:         seg.text,
        duration:     null,
        slideContent: { title: seg.slide_title, blocks: [{ items: blocksToBulletItems(contentBlocks) }] },
        contentBlocks,
        imageDescription: seg.image_description || '',
      })
    })
  }

  ;(sections?.content_scenes || []).forEach((scene, sceneIdx) => {
    // Current shape: each key point under this scene's topic is its own
    // segment (own narration, own single-point slide) — shown as its own
    // editable row here, same as welcome's segments just above, so what you
    // approve/edit here matches exactly what becomes its own scene-segment
    // (and its own avatar render) downstream.
    if (scene.segments?.length) {
      scene.segments.forEach((seg, segIdx) => {
        const bullets = (seg.elements || []).filter(e => e.type === 'bullet').map(e => ({ text: e.text, level: e.level || 1 }))
        const contentBlocks = seg.content_blocks?.length ? seg.content_blocks : bulletsToBlocks(bullets)
        items.push({
          kind:         'content',
          idx:          `${sceneIdx}:${segIdx}`,
          sceneIdx,
          segIdx,
          title:        scene.title ? `${scene.title} — point ${segIdx + 1}` : (seg.slide_title || `Point ${segIdx + 1}`),
          text:         seg.text,
          duration:     null,
          // The slide's title is the scene's shared topic (same on every
          // point-slide in this scene, per buildContentPointDesign on the
          // backend); slide_title is THIS point's own short label, doubling
          // as its "key insight" since there's nothing else left to bundle.
          slideContent: { title: scene.title, subtitle: seg.slide_title, blocks: [{ items: blocksToBulletItems(contentBlocks) }] },
          contentBlocks,
          imageDescription: seg.image_description || '',
        })
      })
    } else {
      // Back-compat: scripts generated before this change still have the old
      // flat script_content/slide_content shape (one bundled slide per scene).
      const bulletItems = scene.slide_content?.blocks?.[0]?.items || []
      items.push({
        kind:         'content',
        idx:          sceneIdx,
        sceneIdx,
        segIdx:       null,
        title:        scene.title,
        text:         scene.script_content,
        duration:     scene.duration_seconds,
        slideContent: scene.slide_content || {},
        contentBlocks: scene.content_blocks?.length ? scene.content_blocks : bulletsToBlocks(bulletItems),
        imageDescription: scene.image_description || '',
      })
    }
  })

  const quiz = sections?.quiz_scene
  if (quiz?.questions?.length) {
    items.push({ kind: 'quiz', idx: null, title: quiz.title || 'Knowledge Check', questions: quiz.questions })
  }

  return items
}

// ── Wizard stepper ──────────────────────────────────────────────────────────
function Stepper({ steps, activeStep, onStepClick }) {
  return (
    <div className="flex items-center mb-6">
      {steps.map((s, i) => {
        const isActive = activeStep === s.step
        return (
          <React.Fragment key={s.step}>
            <button
              onClick={() => s.reachable && onStepClick(s.step)}
              disabled={!s.reachable}
              className={`flex items-center gap-2.5 ${s.reachable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-colors ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/30'
                  : s.done
                  ? 'bg-green-500 border-green-500 text-white'
                  : s.reachable
                  ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-white/20 text-slate-500 dark:text-slate-400'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-300 dark:text-slate-600'
              }`}>
                {s.done && !isActive ? <CheckCircle className="w-4 h-4" /> : s.step}
              </span>
              <div className="text-left hidden sm:block">
                <p className={`text-xs font-semibold leading-tight ${
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : s.done ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'
                }`}>{s.label}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-600 leading-tight">{s.hint}</p>
              </div>
            </button>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 rounded transition-colors ${s.done ? 'bg-green-400' : 'bg-slate-200 dark:bg-white/10'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function ScriptsPanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()
  const [runningLibrarian, setRunningLibrarian] = useState(false)
  const [runningScripts, setRunningScripts] = useState(false)
  // Default to empty so users can add their own custom instructions if desired.
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [librarianError, setLibrarianError] = useState(null)
  const [scriptError, setScriptError] = useState(null)
  const [expandedScript, setExpandedScript] = useState(null)
  const [editingScene, setEditingScene] = useState(null)   // { scriptId, kind, idx, text, contentBlocks, keyInsight, imageDescription }
  const [savingScene, setSavingScene] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [viewStep, setViewStep] = useState(null)   // manual step override; null = follow progress automatically

  const isStuck = project?.status === 'ingesting_sources'
  const isGenerating = isStuck && !runningLibrarian && !runningScripts
  const hasModules = ['pending_director_approval','journey_approved','in_production','completed'].includes(project?.status)

  const handleResetStuck = async () => {
    await projectsService.update(project.id, { status: 'draft' })
    queryClient.invalidateQueries({ queryKey: ['project', project.id] })
  }

  const { data: scripts = [], isLoading: loadingScripts } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
    refetchInterval: isGenerating ? 3000 : false,
  })

  const approveMutation = useMutation({
    mutationFn: (id) => scriptsService.update(id, { approvalStatus: 'approved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      onUpdate?.()
    },
  })

  const handleRunLibrarian = async () => {
    setRunningLibrarian(true); setLibrarianError(null)
    try {
      await agentsService.runLibrarian(project.id)
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      onUpdate?.()
    } catch (e) {
      setLibrarianError(e.message || 'Librarian agent failed')
    } finally { setRunningLibrarian(false) }
  }

  const handleRunScriptGenerator = async () => {
    setRunningScripts(true); setScriptError(null)
    try {
      await agentsService.runScriptGenerator(project.id, instructions || undefined)
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      onUpdate?.()
    } catch (e) {
      setScriptError(e.message || 'Script generation failed')
    } finally { setRunningScripts(false) }
  }

  // Save edited scene/segment back into the script's sections JSON, handling
  // both the legacy flat-array shape and the current
  // { welcome, content_scenes, quiz_scene } shape. Persists voice script text,
  // structured content blocks (title + key points per bullet), the key
  // insight (subtitle), and the optional image description together. The
  // backend PATCH handler (scripts.ts) then syncs these into the
  // Scene/SceneSegment rows that Voice/Visual Design/Video actually read —
  // editing here isn't just a display update, it reaches the render pipeline.
  const handleSaveScene = async (script, item) => {
    if (!editingScene) return
    setSavingScene(true)
    setSaveError(null)
    try {
      let sections
      try { sections = JSON.parse(script.sections || '{}') } catch { sections = {} }

      const cleanBlocks = (editingScene.contentBlocks || [])
        .map(b => ({ text: (b.text || '').trim(), keyPoints: (b.keyPoints || []).map(k => k.trim()).filter(Boolean) }))
        .filter(b => b.text || b.keyPoints.length)
      const bulletItems = blocksToBulletItems(cleanBlocks)
      const imageDescription = (editingScene.imageDescription || '').trim()
      const keyInsight = (editingScene.keyInsight || '').trim()

      if (Array.isArray(sections)) {
        const prevSlide = sections[item.idx]?.slide_content || {}
        sections[item.idx] = {
          ...sections[item.idx],
          script_content: editingScene.text,
          content_blocks: cleanBlocks,
          image_description: imageDescription,
          slide_content: { ...prevSlide, subtitle: keyInsight, blocks: [{ items: bulletItems }] },
        }
      } else if (item.kind === 'welcome' && sections.welcome?.segments) {
        sections.welcome.segments[item.idx] = {
          ...sections.welcome.segments[item.idx],
          text: editingScene.text,
          content_blocks: cleanBlocks,
          image_description: imageDescription,
        }
      } else if (item.kind === 'content' && sections.content_scenes) {
        const scene = sections.content_scenes[item.sceneIdx]
        if (scene?.segments && item.segIdx !== null) {
          // Current shape — this item is ONE point/segment under the scene.
          // keyInsight here maps to slide_title (this point's own short
          // label), not a scene-wide subtitle — there's no bundling left to
          // summarize once each point has its own slide.
          scene.segments[item.segIdx] = {
            ...scene.segments[item.segIdx],
            text: editingScene.text,
            slide_title: keyInsight || scene.segments[item.segIdx]?.slide_title,
            content_blocks: cleanBlocks,
            image_description: imageDescription,
            elements: [
              { type: 'title', text: scene.title },
              ...bulletItems.map(b => ({ type: 'bullet', text: b.text, animation: 'staggered-bullets' })),
            ],
          }
        } else {
          // Back-compat: old flat script_content/slide_content shape.
          const prevSlide = scene?.slide_content || {}
          sections.content_scenes[item.sceneIdx] = {
            ...scene,
            script_content: editingScene.text,
            content_blocks: cleanBlocks,
            image_description: imageDescription,
            slide_content: { ...prevSlide, subtitle: keyInsight, blocks: [{ items: bulletItems }] },
          }
        }
      }

      await scriptsService.update(script.id, { sections: JSON.stringify(sections) })

      // Script content changed — voices are now out of date
      // Clear voice settings and force user to re-generate
      await projectsService.update(project.id, { defaultVoiceId: null })

      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      setEditingScene(null)
    } catch (e) {
      setSaveError(e.message || 'Failed to save scene. Please try again.')
      console.error('Save scene error:', e)
    } finally { setSavingScene(false) }
  }

  const allApproved = scripts.length > 0 && scripts.every(s => s.approvalStatus === 'approved' || s.approvalStatus === 'locked')

  // ── Wizard progress ──
  const step1Done = hasModules
  const step2Done = scripts.length > 0
  const step3Done = allApproved
  const autoStep = !step1Done ? 1 : !step2Done ? 2 : 3
  const activeStep = viewStep ?? autoStep

  // Whenever the underlying progress advances past where the user is
  // manually looking, snap back to auto-follow so completing an action
  // (e.g. finishing Analyze) naturally reveals the next step.
  useEffect(() => {
    if (viewStep !== null && autoStep > viewStep) setViewStep(null)
  }, [autoStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = [
    { step: 1, label: 'Analyze Sources', hint: 'Find topics & modules', done: step1Done, reachable: true },
    { step: 2, label: 'Generate Scripts', hint: 'Write scenes per module', done: step2Done, reachable: step1Done },
    { step: 3, label: 'Review & Approve', hint: 'Edit scenes, approve', done: step3Done, reachable: step2Done },
  ]

  return (
    <div className="p-6 max-w-6xl">
      <StageHeader
        icon={FileText}
        title="2. Script Generation"
        subtitle="Analyze → Generate → Review, one step at a time"
        complete={allApproved}
        onContinue={() => onContinue?.('voices')}
        continueLabel="Continue to Voice"
        compact
      />

      <Stepper steps={steps} activeStep={activeStep} onStepClick={setViewStep} />

      {/* ── Step 1: Analyze Sources ── */}
      {activeStep === 1 && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analyze Sources</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Extract topics and create 5 modules from your materials.</p>
            </div>
            {step1Done && <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Complete</Badge>}
          </div>

          {isStuck && !runningLibrarian && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">Analysis stuck.</p>
              <button onClick={handleResetStuck} className="text-xs text-amber-600 dark:text-amber-400 underline hover:text-amber-700 dark:hover:text-amber-300 flex-shrink-0">Reset</button>
            </div>
          )}
          {librarianError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{librarianError}</p>
            </div>
          )}

          <Button onClick={handleRunLibrarian} disabled={runningLibrarian || isGenerating} variant={hasModules ? 'secondary' : 'primary'} size="sm">
            {runningLibrarian || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</> : hasModules ? <><RotateCcw className="w-3.5 h-3.5" />Re-analyze</> : <><Sparkles className="w-3.5 h-3.5" />Analyze Sources</>}
          </Button>

          {hasModules && scripts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-1.5">Modules found</p>
              {scripts.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="text-indigo-500 dark:text-indigo-400 font-bold">Module {i + 1}</span>
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          )}

          {step1Done && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex justify-end">
              <button
                onClick={() => setViewStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Continue to Generate Scripts
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Generate Scripts ── */}
      {activeStep === 2 && (
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4.5 h-4.5 text-purple-500 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Generate Scripts</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Create narrative scenes per module with slide content and voice script.</p>
            </div>
            {step2Done && <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />{scripts.length} script{scripts.length === 1 ? '' : 's'}</Badge>}
          </div>

          <button onClick={() => setShowInstructions(v => !v)} className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-2 flex items-center gap-1">
            {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Custom instructions (optional)
          </button>
          {showInstructions && (
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. Friendly tone, target: university students, use examples from biology"
              className="w-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none focus:outline-none focus:border-indigo-500/50 mb-3" rows={3} />
          )}
          {scriptError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{scriptError}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewStep(1)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <Button onClick={handleRunScriptGenerator} disabled={runningScripts || isGenerating || !hasModules} variant={scripts.length > 0 ? 'secondary' : 'primary'} size="sm">
              {runningScripts || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : scripts.length > 0 ? <><RotateCcw className="w-3.5 h-3.5" />Regenerate</> : <><Sparkles className="w-3.5 h-3.5" />Generate Scripts</>}
            </Button>
          </div>

          {step2Done && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex justify-end">
              <button
                onClick={() => setViewStep(3)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Continue to Review
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Review & Approve ── */}
      {activeStep === 3 && (
        <div>
          <button
            onClick={() => setViewStep(2)}
            className="flex items-center gap-1.5 mb-3 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Generate
          </button>

          {loadingScripts ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : scripts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardCheck className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Review Scenes</h3>
              </div>
              {scripts.map((script, videoIdx) => {
                const badge = STATUS_BADGE[script.approvalStatus] || { label: script.approvalStatus, variant: 'default' }
                const isExpanded = expandedScript === script.id
                const sections = (() => { try { return JSON.parse(script.sections || '{}') } catch { return {} } })()
                const displayItems = buildDisplayItems(sections)

                return (
                  <div key={script.id} className="rounded-lg overflow-hidden border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-slate-900/40">
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      onClick={() => setExpandedScript(isExpanded ? null : script.id)}>
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">{videoIdx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{script.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">~{script.estimatedDurationMinutes} min total</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-white/[0.06] px-4 py-4 space-y-4">
                        {/* Lock Status Indicator */}
                        {script.approvalStatus === 'locked' && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                            <Lock className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                            <p className="text-sm text-green-700 dark:text-green-300 font-medium">✓ Script locked. Cannot edit.</p>
                          </div>
                        )}

                        {/* Save Error */}
                        {saveError && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-red-700 dark:text-red-300">Error saving scene</p>
                              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{saveError}</p>
                            </div>
                            <button onClick={() => setSaveError(null)} className="text-red-500 hover:text-red-700 flex-shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {displayItems.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-2">Scenes</p>
                            <div className="space-y-3">
                              {displayItems.map((item, i) => {
                                if (item.kind === 'quiz') {
                                  return (
                                    <div key="quiz" className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-slate-800/50 overflow-hidden">
                                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-white/[0.04]">
                                        <div className="flex items-center gap-2">
                                          <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex-shrink-0">{i + 1}</span>
                                          <p className="text-xs font-medium text-slate-900 dark:text-white">{item.title}</p>
                                          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{item.questions.length} questions</span>
                                        </div>
                                      </div>
                                      <div className="p-3 space-y-2">
                                        {item.questions.map((q, qi) => (
                                          <div key={qi} className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            <span className="text-indigo-500 dark:text-indigo-400 font-medium">{qi + 1}. </span>{q.question}
                                          </div>
                                        ))}
                                        <p className="text-[9px] text-slate-400 dark:text-slate-600 mt-1 italic">Edit questions in Visual Designer →</p>
                                      </div>
                                    </div>
                                  )
                                }

                                const isEditing = editingScene?.scriptId === script.id && editingScene?.kind === item.kind && editingScene?.idx === item.idx
                                return (
                                  <div key={`${item.kind}-${item.idx}`} className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-slate-800/50 overflow-hidden">
                                    {/* Scene header */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-white/[0.04]">
                                      <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex-shrink-0">{i + 1}</span>
                                        <p className="text-xs font-medium text-slate-900 dark:text-white">{item.title}</p>
                                        {item.duration && <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{item.duration}s</span>}
                                      </div>
                                      {!isEditing ? (
                                        <button
                                          onClick={() => setEditingScene({
                                            scriptId: script.id,
                                            kind: item.kind,
                                            idx: item.idx,
                                            text: item.text,
                                            // Points + key insight already came out of the script generator —
                                            // this just loads what's there so the user approves/tweaks it
                                            // against the voice script, instead of starting from a blank slate.
                                            //
                                            // Fall back to the slide's own rendered bullets before giving up
                                            // and showing an empty row: opening straight onto a blank point
                                            // meant the existing slide content wasn't there to EDIT, so the
                                            // only thing the user could do was add a new point on top of
                                            // content they couldn't see.
                                            contentBlocks: item.contentBlocks?.length
                                              ? item.contentBlocks
                                              : (item.slideContent?.blocks?.[0]?.items?.length
                                                  ? bulletsToBlocks(item.slideContent.blocks[0].items)
                                                  : [{ text: '', keyPoints: [] }]),
                                            keyInsight: item.slideContent?.subtitle || '',
                                            imageDescription: item.imageDescription || '',
                                          })}
                                          className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                        >
                                          <Edit2 className="w-3 h-3" /> Edit scene
                                        </button>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => handleSaveScene(script, item)} disabled={savingScene}
                                            className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors">
                                            {savingScene ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                                          </button>
                                          <button onClick={() => setEditingScene(null)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                            <X className="w-3 h-3" /> Cancel
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-white/[0.04]">
                                      {/* LEFT: Voice script (what presenter SAYS) */}
                                      <div className="p-4">
                                        <p className="text-[10px] font-semibold text-blue-600/80 dark:text-blue-400/80 uppercase tracking-widest mb-2 flex items-center gap-1">
                                          🎙 Voice Script
                                        </p>
                                        {isEditing ? (
                                          <textarea
                                            value={editingScene.text}
                                            onChange={e => setEditingScene(prev => ({ ...prev, text: e.target.value }))}
                                            className="w-full bg-white dark:bg-slate-900/60 border border-indigo-500/30 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:border-indigo-500/60"
                                            rows={7}
                                            autoFocus
                                          />
                                        ) : (
                                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.text}</p>
                                        )}
                                      </div>

                                      {/* RIGHT: Slide content (what students READ) — title, a highlighted
                                          key insight callout, then numbered content blocks (main point +
                                          nested supporting points), then an optional image-description
                                          callout. Same structure in view and edit mode so nothing changes
                                          shape when you start editing. */}
                                      <div className="p-4 bg-white/60 dark:bg-black/10">
                                        <p className="text-[10px] font-semibold text-violet-600/80 dark:text-violet-400/80 uppercase tracking-widest mb-2 flex items-center gap-1">
                                          📋 Slide Content
                                        </p>

                                        {item.slideContent?.title && (
                                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug mb-2">{item.slideContent.title}</p>
                                        )}

                                        {isEditing ? (
                                          <div className="space-y-3">
                                            {item.kind !== 'welcome' && (
                                              <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                                                <span className="text-sm flex-shrink-0 mt-0.5">💡</span>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-0.5">Key Insight</p>
                                                  <input
                                                    value={editingScene.keyInsight}
                                                    onChange={e => setEditingScene(prev => ({ ...prev, keyInsight: e.target.value }))}
                                                    placeholder="One-line key insight students should remember"
                                                    className="w-full bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none placeholder:text-slate-400 placeholder:font-normal placeholder:italic"
                                                  />
                                                </div>
                                              </div>
                                            )}

                                            <div className="space-y-2">
                                              {editingScene.contentBlocks.map((block, bi) => (
                                                <div key={bi} className="flex gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 p-2.5">
                                                  <span className="w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{bi + 1}</span>
                                                  <div className="flex-1 min-w-0 space-y-1.5">
                                                    <div className="flex items-start gap-1">
                                                      {/* Main point — a real editable input (bordered +
                                                          filled) so it's obviously editable. It used to be
                                                          a transparent, borderless field styled like a bold
                                                          heading, so it read as static text and users
                                                          thought they could only add/edit the sub-points
                                                          box below. Now the existing point text can be
                                                          edited in place. */}
                                                      <textarea
                                                        value={block.text}
                                                        onChange={e => setEditingScene(prev => {
                                                          const next = [...prev.contentBlocks]
                                                          next[bi] = { ...next[bi], text: e.target.value }
                                                          return { ...prev, contentBlocks: next }
                                                        })}
                                                        placeholder="Main point"
                                                        rows={2}
                                                        className="flex-1 bg-white dark:bg-slate-800/60 border border-slate-300 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white resize-none focus:outline-none focus:border-violet-500/60 transition-colors"
                                                      />
                                                      {editingScene.contentBlocks.length > 1 && (
                                                        <button
                                                          onClick={() => setEditingScene(prev => ({ ...prev, contentBlocks: prev.contentBlocks.filter((_, i) => i !== bi) }))}
                                                          title="Remove this point"
                                                          className="text-slate-300 hover:text-red-500 flex-shrink-0 mt-1.5"
                                                        >
                                                          <X className="w-3.5 h-3.5" />
                                                        </button>
                                                      )}
                                                    </div>
                                                    <textarea
                                                      value={(block.keyPoints || []).join('\n')}
                                                      onChange={e => setEditingScene(prev => {
                                                        const next = [...prev.contentBlocks]
                                                        next[bi] = { ...next[bi], keyPoints: e.target.value.split('\n') }
                                                        return { ...prev, contentBlocks: next }
                                                      })}
                                                      placeholder="Sub-points, one per line (optional)"
                                                      rows={2}
                                                      className="w-full bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
                                                    />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                            <button
                                              onClick={() => setEditingScene(prev => ({ ...prev, contentBlocks: [...prev.contentBlocks, { text: '', keyPoints: [] }] }))}
                                              className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline font-medium"
                                            >
                                              + Add point
                                            </button>

                                            <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20 border-dashed">
                                              <span className="text-sm flex-shrink-0 mt-0.5">🖼</span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-0.5">Image Description (optional)</p>
                                                <textarea
                                                  value={editingScene.imageDescription}
                                                  onChange={e => setEditingScene(prev => ({ ...prev, imageDescription: e.target.value }))}
                                                  placeholder="Describe an image to generate for this scene, e.g. a diagram of the water cycle"
                                                  rows={2}
                                                  className="w-full bg-transparent text-[11px] text-slate-600 dark:text-slate-300 resize-none focus:outline-none placeholder:italic"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        ) : item.slideContent?.title || item.contentBlocks?.length > 0 ? (
                                          <div className="space-y-2.5">
                                            {item.slideContent?.subtitle && (
                                              <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                                                <span className="text-sm flex-shrink-0">💡</span>
                                                <p className="text-xs font-medium text-violet-700 dark:text-violet-300 leading-snug">{item.slideContent.subtitle}</p>
                                              </div>
                                            )}
                                            {item.contentBlocks?.length > 0 && (
                                              <div className="space-y-2">
                                                {item.contentBlocks.map((block, bi) => (
                                                  <div key={bi} className="flex gap-2">
                                                    <span className="w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{bi + 1}</span>
                                                    <div className="flex-1 min-w-0">
                                                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">{block.text}</p>
                                                      {block.keyPoints?.length > 0 && (
                                                        <ul className="mt-1 space-y-0.5">
                                                          {block.keyPoints.map((kp, ki) => (
                                                            <li key={ki} className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug flex gap-1.5">
                                                              <span className="text-slate-400 dark:text-slate-600 flex-shrink-0">–</span>{kp}
                                                            </li>
                                                          ))}
                                                        </ul>
                                                      )}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                            {item.imageDescription && (
                                              <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
                                                <span className="text-sm flex-shrink-0">🖼</span>
                                                <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-snug">{item.imageDescription}</p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-[11px] text-slate-400 dark:text-slate-600 italic">Slide content generated with script</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons - Simple Approve */}
                        <div className="flex flex-col gap-2 pt-2">
                          {script.approvalStatus === 'draft' && (
                            <Button size="sm" onClick={() => approveMutation.mutate(script.id)} disabled={approveMutation.isPending} className="w-full">
                              <CheckCircle className="w-4 h-4" />
                              Approve Script
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {allApproved && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm text-green-700 dark:text-green-300 font-semibold">All scripts approved</p>
                    </div>
                    <button
                      onClick={() => onContinue?.('voices')}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Continue to Voice
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
