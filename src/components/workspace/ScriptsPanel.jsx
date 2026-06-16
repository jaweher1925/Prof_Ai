import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { projectsService } from '@/services/projects'
import {
  FileText, Sparkles, Loader2, CheckCircle, ChevronDown, ChevronUp,
  AlertTriangle, RotateCcw, BookOpen, Edit2, Save, ArrowRight, Mic2, ClipboardList
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

const STATUS_BADGE = {
  review:   { label: 'Needs Review', variant: 'yellow' },
  approved: { label: 'Approved',     variant: 'green' },
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function parseSlideContent(scene) {
  try {
    if (typeof scene.slide_content === 'string') return JSON.parse(scene.slide_content)
    return scene.slide_content || {}
  } catch {
    return {}
  }
}

function getSlideBullets(slideContent) {
  const blocks = Array.isArray(slideContent.blocks) ? slideContent.blocks : []
  const firstBulletBlock = blocks.find(block => Array.isArray(block.items))
  return firstBulletBlock?.items || []
}

function buildFallbackSlideContent(scene) {
  const sentences = (scene.script_content || '')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .slice(0, 4)

  return {
    title: scene.title || 'Slide Notes',
    subtitle: 'Drafted from the presenter script',
    bullets: sentences.map(text => ({ text, level: 1 })),
    isFallback: true,
  }
}

export default function ScriptsPanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()
  const [runningLibrarian, setRunningLibrarian] = useState(false)
  const [runningScripts, setRunningScripts] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [librarianError, setLibrarianError] = useState(null)
  const [scriptError, setScriptError] = useState(null)
  const [expandedScript, setExpandedScript] = useState(null)
  const [editingScene, setEditingScene] = useState(null)
  const [savingScene, setSavingScene] = useState(false)

  const isStuck = project?.status === 'ingesting_sources'
  const isGenerating = isStuck && !runningLibrarian && !runningScripts
  const hasModules = ['pending_director_approval', 'journey_approved', 'in_production', 'completed'].includes(project?.status)

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
    setRunningLibrarian(true)
    setLibrarianError(null)
    try {
      await agentsService.runLibrarian(project.id)
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onUpdate?.()
    } catch (e) {
      setLibrarianError(e.message || 'Librarian agent failed')
    } finally {
      setRunningLibrarian(false)
    }
  }

  const handleRunScriptGenerator = async () => {
    setRunningScripts(true)
    setScriptError(null)
    try {
      await agentsService.runScriptGenerator(project.id, instructions || undefined)
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      onUpdate?.()
    } catch (e) {
      setScriptError(e.message || 'Script generation failed')
    } finally {
      setRunningScripts(false)
    }
  }

  const openSceneEditor = (script, sceneIndex, scene) => {
    setEditingScene({
      scriptId: script.id,
      scriptTitle: script.title,
      sceneIndex,
      sceneTitle: scene.title,
      text: scene.script_content || '',
    })
  }

  const handleSaveScene = async () => {
    if (!editingScene) return
    setSavingScene(true)
    try {
      const script = scripts.find(s => s.id === editingScene.scriptId)
      if (!script) throw new Error('Script not found')
      const sections = parseJson(script.sections, [])
      sections[editingScene.sceneIndex] = {
        ...sections[editingScene.sceneIndex],
        script_content: editingScene.text,
      }
      await scriptsService.update(script.id, { sections: JSON.stringify(sections) })
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      setEditingScene(null)
    } catch (e) {
      alert('Failed to save: ' + e.message)
    } finally {
      setSavingScene(false)
    }
  }

  const allApproved = scripts.length > 0 && scripts.every(s => s.status === 'approved')

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Script Generation</h2>
        <span className="text-xs text-slate-600">5 videos / 6 min each</span>
      </div>

      <div className="mb-6 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white">Step 1 - Analyze Sources</h3>
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
          {runningLibrarian || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing...</> : hasModules ? <><RotateCcw className="w-3.5 h-3.5" />Re-analyze</> : <><Sparkles className="w-3.5 h-3.5" />Analyze Sources</>}
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

      <div className="mb-6 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-medium text-white">Step 2 - Generate Scripts</h3>
          </div>
          {allApproved && <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />All Approved</Badge>}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Writes 8 scenes per video. You can edit any scene before approving.
        </p>
        <button onClick={() => setShowInstructions(v => !v)} className="text-xs text-slate-500 hover:text-indigo-400 transition-colors mb-3 flex items-center gap-1">
          {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Special instructions (optional)
        </button>
        {showInstructions && (
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Friendly tone, target: university students, examples from biology"
            className="w-full bg-slate-800/60 border border-white/10 rounded-lg p-3 text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none focus:border-indigo-500/50 mb-3"
            rows={3}
          />
        )}
        {scriptError && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{scriptError}</p>
          </div>
        )}
        <Button onClick={handleRunScriptGenerator} disabled={runningScripts || isGenerating || !hasModules} variant={scripts.length > 0 ? 'secondary' : 'primary'} size="sm">
          {runningScripts || isGenerating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing scripts...</> : scripts.length > 0 ? <><RotateCcw className="w-3.5 h-3.5" />Regenerate Scripts</> : <><Sparkles className="w-3.5 h-3.5" />Generate Scripts</>}
        </Button>
      </div>

      {loadingScripts ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : scripts.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs text-slate-400 uppercase tracking-widest">Review & Edit Scripts</h3>
          {scripts.map((script, videoIdx) => {
            const badge = STATUS_BADGE[script.status] || { label: script.status, variant: 'default' }
            const isExpanded = expandedScript === script.id
            const sections = parseJson(script.sections, [])
            const objectives = parseJson(script.learningObjectives, [])

            return (
              <div key={script.id} className="rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedScript(isExpanded ? null : script.id)}
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-400">{videoIdx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{script.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">~{script.estimatedDurationMinutes} min / {sections.length} scenes</p>
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
                          {objectives.map((objective, i) => (
                            <li key={i} className="text-xs text-slate-300 flex gap-2"><span className="text-indigo-400">-</span>{objective}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sections.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-2">Scenes ({sections.length})</p>
                        <div className="space-y-3">
                          {sections.map((scene, i) => {
                            const isEditing = editingScene?.scriptId === script.id && editingScene?.sceneIndex === i
                            const slideContent = parseSlideContent(scene)
                            const displaySlide = slideContent.title
                              ? {
                                  title: slideContent.title,
                                  subtitle: slideContent.subtitle,
                                  bullets: getSlideBullets(slideContent),
                                  isFallback: false,
                                }
                              : buildFallbackSlideContent(scene)

                            return (
                              <div key={i} className={`rounded-xl bg-slate-800/50 border overflow-hidden ${isEditing ? 'border-indigo-500/40' : 'border-white/[0.06]'}`}>
                                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-900/30 border-b border-white/[0.04]">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400 flex-shrink-0">{i + 1}</span>
                                    <p className="text-xs font-medium text-white truncate">{scene.title}</p>
                                    {scene.duration_seconds && <span className="text-[10px] text-slate-600 font-mono">{scene.duration_seconds}s</span>}
                                  </div>
                                  <button
                                    onClick={() => openSceneEditor(script, i, scene)}
                                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-400 transition-colors flex-shrink-0"
                                  >
                                    <Edit2 className="w-3 h-3" /> Edit
                                  </button>
                                </div>

                                <div className="grid gap-0 lg:grid-cols-2 lg:divide-x divide-white/[0.04]">
                                  <div className="p-3">
                                    <p className="text-[10px] font-semibold text-blue-400/80 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                      <Mic2 className="w-3 h-3" /> Voice Script
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-6">{scene.script_content}</p>
                                  </div>

                                  <div className="p-3">
                                    <p className="text-[10px] font-semibold text-violet-400/80 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                      <ClipboardList className="w-3 h-3" /> Slide Content
                                    </p>
                                    <div className="space-y-1.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-white leading-snug">{displaySlide.title}</p>
                                        {displaySlide.isFallback && <Badge variant="default">Draft</Badge>}
                                      </div>
                                      {displaySlide.subtitle && (
                                        <p className="text-[11px] text-slate-400 italic leading-snug">{displaySlide.subtitle}</p>
                                      )}
                                      {displaySlide.bullets.length > 0 && (
                                        <ul className="space-y-1 mt-