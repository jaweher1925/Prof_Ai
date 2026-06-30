import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { projectsService } from '@/services/projects'
import {
  FileText, Sparkles, Loader2, CheckCircle, ChevronDown, ChevronUp,
  AlertTriangle, RotateCcw, BookOpen, Edit2, Save, X, ArrowRight, Mic2
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

const STATUS_BADGE = {
  review:   { label: 'Needs Review', variant: 'yellow' },
  approved: { label: 'Approved',     variant: 'green' },
}

// script.sections changed shape (#29/#30/#31) from a flat array of scenes to
// { welcome: { segments: [...] }, content_scenes: [...], quiz_scene: { questions: [...] } }.
// This panel still expected the old flat array, so `sections.length` was
// `undefined` and the whole "edit before approving" block silently never
// rendered. Normalize either shape into one flat list of editable items so
// review/edit works again regardless of which shape a given script has
// (old scripts saved before this change keep working too).
function buildDisplayItems(sections) {
  if (Array.isArray(sections)) {
    return sections.map((scene, i) => ({
      kind:         'legacy',
      idx:          i,
      title:        scene.title,
      text:         scene.script_content,
      duration:     scene.duration_seconds,
      slideContent: scene.slide_content || {},
    }))
  }

  const items = []

  const welcome = sections?.welcome
  if (welcome?.segments?.length) {
    welcome.segments.forEach((seg, i) => {
      const bullets = (seg.elements || []).filter(e => e.type === 'bullet').map(e => ({ text: e.text, level: 1 }))
      items.push({
        kind:         'welcome',
        idx:          i,
        title:        seg.slide_title || `Welcome — ${seg.segment_type || `part ${i + 1}`}`,
        text:         seg.text,
        duration:     null,
        slideContent: { title: seg.slide_title, blocks: [{ items: bullets }] },
      })
    })
  }

  ;(sections?.content_scenes || []).forEach((scene, i) => {
    items.push({
      kind:         'content',
      idx:          i,
      title:        scene.title,
      text:         scene.script_content,
      duration:     scene.duration_seconds,
      slideContent: scene.slide_content || {},
    })
  })

  const quiz = sections?.quiz_scene
  if (quiz?.questions?.length) {
    items.push({ kind: 'quiz', idx: null, title: quiz.title || 'Knowledge Check', questions: quiz.questions })
  }

  return items
}

export default function ScriptsPanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()
  const [runningLibrarian, setRunningLibrarian] = useState(false)
  const [runningScripts, setRunningScripts] = useState(false)
  // Default to a brevity instruction so scripts come back short out of the
  // box — especially the first scene, which tends to run long with welcome
  // text + objectives. Still fully editable/clearable by the user.
  const [instructions, setInstructions] = useState(
    'Keep every scene concise — aim for short, tightly-written narration (roughly 60-100 words per scene). ' +
    'The first scene (welcome/intro) must be especially brief and to the point, no more than 50-60 words.'
  )
  const [showInstructions, setShowInstructions] = useState(true)
  const [librarianError, setLibrarianError] = useState(null)
  const [scriptError, setScriptError] = useState(null)
  const [expandedScript, setExpandedScript] = useState(null)
  const [editingScene, setEditingScene] = useState(null)   // { scriptId, kind, idx, text }
  const [savingScene, setSavingScene] = useState(false)

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
    mutationFn: (id) => scriptsService.update(id, { status: 'approved' }),
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
      queryClient.invalidateQueries({ queryKey: ['projects'] })
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

  // Save edited scene/segment text back into the script's sections JSON,
  // handling both the legacy flat-array shape and the current
  // { welcome, content_scenes, quiz_scene } shape.
  const handleSaveScene = async (script, item) => {
    if (!editingScene) return
    setSavingScene(true)
    try {
      let sections
      try { sections = JSON.parse(script.sections || '{}') } catch { sections = {} }

      if (Array.isArray(sections)) {
        sections[item.idx] = { ...sections[item.idx], script_content: editingScene.text }
      } else if (item.kind === 'welcome' && sections.welcome?.segments) {
        sections.welcome.segments[item.idx] = { ...sections.welcome.segments[item.idx], text: editingScene.text }
      } else if (item.kind === 'content' && sections.content_scenes) {
        sections.content_scenes[item.idx] = { ...sections.content_scenes[item.idx], script_content: editingScene.text }
      }

      await scriptsService.update(script.id, { sections: JSON.stringify(sections) })
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      setEditingScene(null)
    } catch (e) {
      alert('Failed to save: ' + e.message)
    } finally { setSavingScene(false) }
  }

  const allApproved = scripts.length > 0 && scripts.every(s => s.status === 'approved')

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Script Generation</h2>
        <span className="text-xs text-slate-600">5 videos · 6 min each</span>
      </div>

      {/* ── Step 1: Librarian ── */}
      <div className="mb-6 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white">Step 1 — Analyze Sources</h3>
          </div>
          {hasModules && <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Reads your uploaded files and creates 5 module topics for the course.
        </p>
        {isStuck && !runningLibrarian && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 flex-1">Analysis stuck.</p>
            <button onClick={handleResetStuck} className="text-xs text-amber-400 underline hover:text-amber-300 flex-shrink-0">Reset</button>
          </div>
        )}
        {librarianError && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{librarianError}</p>
          </div>
        )}
        <Button onClick={handleRunLibrarian} disabled={runningLibrarian || isGenerating} variant={hasModules ? 'secondary' : 'primary'} size="sm">
          {runningLibrarian || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</> : hasModules ? <><RotateCcw className="w-3.5 h-3.5" />Re-analyze</> : <><Sparkles className="w-3.5 h-3.5" />Analyze Sources</>}
        </Button>
        {hasModules && scripts.length > 0 && (
          <div className="mt-3 space-y-1">
            {scripts.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-indigo-400 font-bold">Video {i + 1}</span>
                <span>{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 2: Script Generator ── */}
      <div className="mb-6 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-medium text-white">Step 2 — Generate Scripts</h3>
          </div>
          {allApproved && <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />All Approved</Badge>}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Writes 6 scenes per video (6 min total) — Scene 1: welcome + objectives, Scene 6: summary. You can edit any scene before approving.
        </p>
        <button onClick={() => setShowInstructions(v => !v)} className="text-xs text-slate-500 hover:text-indigo-400 transition-colors mb-3 flex items-center gap-1">
          {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Special instructions (optional)
        </button>
        {showInstructions && (
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Friendly tone, target: university students, examples from biology"
            className="w-full bg-slate-800/60 border border-white/10 rounded-lg p-3 text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-indigo-500/50 mb-3" rows={3} />
        )}
        {scriptError && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{scriptError}</p>
          </div>
        )}
        <Button onClick={handleRunScriptGenerator} disabled={runningScripts || isGenerating || !hasModules} variant={scripts.length > 0 ? 'secondary' : 'primary'} size="sm">
          {runningScripts || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing scripts…</> : scripts.length > 0 ? <><RotateCcw className="w-3.5 h-3.5" />Regenerate Scripts</> : <><Sparkles className="w-3.5 h-3.5" />Generate Scripts</>}
        </Button>
      </div>

      {/* ── Script list ── */}
      {loadingScripts ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : scripts.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs text-slate-400 uppercase tracking-widest">Review & Edit Scripts</h3>
          {scripts.map((script, videoIdx) => {
            const badge = STATUS_BADGE[script.status] || { label: script.status, variant: 'default' }
            const isExpanded = expandedScript === script.id
            const sections = (() => { try { return JSON.parse(script.sections || '{}') } catch { return {} } })()
            const objectives = (() => { try { return JSON.parse(script.learningObjectives || '[]') } catch { return [] } })()
            const displayItems = buildDisplayItems(sections)

            return (
              <div key={script.id} className="rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedScript(isExpanded ? null : script.id)}>
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-400">{videoIdx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{script.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">~{script.estimatedDurationMinutes} min · {displayItems.length} scenes</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
                    {objectives.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Learning Objectives</p>
                        <ul className="space-y-1">
                          {objectives.map((o, i) => (
                            <li key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-indigo-400">•</span>{o}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {displayItems.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-2">Scenes ({displayItems.length})</p>
                        <div className="space-y-3">
                          {displayItems.map((item, i) => {
                            if (item.kind === 'quiz') {
                              return (
                                <div key="quiz" className="rounded-xl bg-slate-800/50 border border-white/[0.06] overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2 bg-slate-900/30 border-b border-white/[0.04]">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400 flex-shrink-0">{i + 1}</span>
                                      <p className="text-xs font-medium text-white">{item.title}</p>
                                      <span className="text-[10px] text-slate-600 font-mono">{item.questions.length} questions</span>
                                    </div>
                                  </div>
                                  <div className="p-3 space-y-2">
                                    {item.questions.map((q, qi) => (
                                      <div key={qi} className="text-xs text-slate-400 leading-relaxed">
                                        <span className="text-indigo-400 font-medium">{qi + 1}. </span>{q.question}
                                      </div>
                                    ))}
                                    <p className="text-[9px] text-slate-600 mt-1 italic">Edit questions in Visual Designer →</p>
                                  </div>
                                </div>
                              )
                            }

                            const isEditing = editingScene?.scriptId === script.id && editingScene?.kind === item.kind && editingScene?.idx === item.idx
                            const slideBullets = item.slideContent?.blocks?.[0]?.items || []
                            return (
                              <div key={`${item.kind}-${item.idx}`} className="rounded-xl bg-slate-800/50 border border-white/[0.06] overflow-hidden">
                                {/* Scene header */}
                                <div className="flex items-center justify-between px-3 py-2 bg-slate-900/30 border-b border-white/[0.04]">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400 flex-shrink-0">{i + 1}</span>
                                    <p className="text-xs font-medium text-white">{item.title}</p>
                                    {item.duration && <span className="text-[10px] text-slate-600 font-mono">{item.duration}s</span>}
                                  </div>
                                  {!isEditing ? (
                                    <button
                                      onClick={() => setEditingScene({ scriptId: script.id, kind: item.kind, idx: item.idx, text: item.text })}
                                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-indigo-400 transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" /> Edit voice
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button onClick={() => handleSaveScene(script, item)} disabled={savingScene}
                                        className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors">
                                        {savingScene ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                                      </button>
                                      <button onClick={() => setEditingScene(null)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                                        <X className="w-3 h-3" /> Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 divide-x divide-white/[0.04]">
                                  {/* LEFT: Voice script (what presenter SAYS) */}
                                  <div className="p-3">
                                    <p className="text-[10px] font-semibold text-blue-400/80 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                      🎙 Voice Script
                                    </p>
                                    {isEditing ? (
                                      <textarea
                                        value={editingScene.text}
                                        onChange={e => setEditingScene(prev => ({ ...prev, text: e.target.value }))}
                                        className="w-full bg-slate-900/60 border border-indigo-500/30 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500/60"
                                        rows={6}
                                        autoFocus
                                      />
                                    ) : (
                                      <p className="text-xs text-slate-400 leading-relaxed">{item.text}</p>
                                    )}
                                  </div>

                                  {/* RIGHT: Slide content (what students READ) */}
                                  <div className="p-3">
                                    <p className="text-[10px] font-semibold text-violet-400/80 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                      📋 Slide Content
                                    </p>
                                    {item.slideContent?.title ? (
                                      <div className="space-y-1.5">
                                        <p className="text-xs font-semibold text-white leading-snug">{item.slideContent.title}</p>
                                        {item.slideContent.subtitle && (
                                          <p className="text-[11px] text-slate-400 italic leading-snug">{item.slideContent.subtitle}</p>
                                        )}
                                        {slideBullets.length > 0 && (
                                          <ul className="space-y-1 mt-1">
                                            {slideBullets.slice(0, 4).map((b, bi) => (
                                              <li key={bi} className={`text-[11px] leading-snug flex gap-1.5 ${b.level === 2 ? 'text-slate-500 ml-2' : 'text-slate-300'}`}>
                                                <span className="text-violet-400 flex-shrink-0">{b.level === 2 ? '◦' : '▸'}</span>
                                                {b.text}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                        <p className="text-[9px] text-slate-600 mt-1 italic">Edit slides in Visual Designer →</p>
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-slate-600 italic">Slide content generated with script</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {script.status !== 'approved' && (
                      <Button size="sm" onClick={() => approveMutation.mutate(script.id)} disabled={approveMutation.isPending} className="w-full">
                        <CheckCircle className="w-4 h-4" />
                        Approve Script
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {allApproved && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <p className="text-sm text-green-300 font-medium">All 5 scripts approved!</p>
                </div>
                <button
                  onClick={() => onContinue?.('voice')}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <Mic2 className="w-4 h-4" />
                  Continue to Voice
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
