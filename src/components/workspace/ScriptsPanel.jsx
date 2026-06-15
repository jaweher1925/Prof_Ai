/**
 * Stage 2 — Script
 * 1. Run Librarian → creates modules from source files
 * 2. Review modules → approve the structure
 * 3. Run Script Generator → creates scripts + scenes per module
 * 4. Review scripts → approve each one
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { projectsService } from '@/services/projects'
import {
  FileText, Sparkles, Loader2, CheckCircle, ChevronDown, ChevronUp,
  AlertTriangle, RotateCcw, BookOpen
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

const STATUS_BADGE = {
  review:   { label: 'Needs Review', variant: 'yellow' },
  approved: { label: 'Approved',     variant: 'green' },
}

export default function ScriptsPanel({ project, onUpdate }) {
  const queryClient = useQueryClient()
  const [runningLibrarian, setRunningLibrarian] = useState(false)
  const [runningScripts, setRunningScripts] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [librarianError, setLibrarianError] = useState(null)
  const [scriptError, setScriptError] = useState(null)
  const [expandedScript, setExpandedScript] = useState(null)

  // If project is stuck on ingesting_sources (from a previous failed run), allow reset
  const isStuck = project?.status === 'ingesting_sources'
  const isGenerating = isStuck && !runningLibrarian && !runningScripts
  const hasModules = ['pending_director_approval','journey_approved','in_production','completed'].includes(project?.status)
  const hasScripts = ['journey_approved','in_production','completed'].includes(project?.status)

  const handleResetStuck = async () => {
    await projectsService.update(project.id, { status: 'draft' })
    queryClient.invalidateQueries({ queryKey: ['project', project.id] })
  }

  // Fetch modules
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => fetch(`/api/projects/${project.id}/scripts`).then(r => r.json()),
    enabled: !!project?.id,
    refetchInterval: isGenerating ? 3000 : false,
  })

  // Fetch scripts
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

  const allApproved = scripts.length > 0 && scripts.every(s => s.status === 'approved')

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Script Generation</h2>
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
          The Librarian AI reads your uploaded files and creates a module structure for the course.
        </p>

        {isStuck && !runningLibrarian && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-amber-300">Analysis is stuck. Click Reset to try again.</p>
            </div>
            <button onClick={handleResetStuck} className="text-xs text-amber-400 underline hover:text-amber-300 flex-shrink-0">
              Reset
            </button>
          </div>
        )}
        {librarianError && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{librarianError}</p>
          </div>
        )}

        <Button
          onClick={handleRunLibrarian}
          disabled={runningLibrarian || isGenerating}
          variant={hasModules ? 'secondary' : 'primary'}
          size="sm"
        >
          {runningLibrarian || isGenerating
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing sources…</>
            : hasModules
            ? <><RotateCcw className="w-3.5 h-3.5" />Re-analyze</>
            : <><Sparkles className="w-3.5 h-3.5" />Analyze Sources</>}
        </Button>

        {/* Module list preview */}
        {hasModules && scripts.length > 0 && (
          <div className="mt-3 space-y-1">
            {scripts.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-indigo-400 font-bold">{i + 1}</span>
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
          For each module, GPT-4o writes a full presenter script with scene breakdowns and visual prompts.
        </p>

        <button
          onClick={() => setShowInstructions(v => !v)}
          className="text-xs text-slate-500 hover:text-indigo-400 transition-colors mb-3 flex items-center gap-1"
        >
          {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Special instructions (optional)
        </button>

        {showInstructions && (
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Use a friendly tone. Target audience: new employees. Keep each scene under 60 seconds."
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

        <Button
          onClick={handleRunScriptGenerator}
          disabled={runningScripts || isGenerating || !hasModules}
          variant={scripts.length > 0 ? 'secondary' : 'primary'}
          size="sm"
        >
          {runningScripts || isGenerating
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing scripts…</>
            : scripts.length > 0
            ? <><RotateCcw className="w-3.5 h-3.5" />Regenerate Scripts</>
            : <><Sparkles className="w-3.5 h-3.5" />Generate Scripts</>}
        </Button>
      </div>

      {/* ── Script list ── */}
      {loadingScripts ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : scripts.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-xs text-slate-400 uppercase tracking-widest">Review Scripts</h3>
          {scripts.map(script => {
            const badge = STATUS_BADGE[script.status] || { label: script.status, variant: 'default' }
            const isExpanded = expandedScript === script.id
            const sections = (() => {
              try { return JSON.parse(script.sections || '[]') } catch { return [] }
            })()
            const objectives = (() => {
              try { return JSON.parse(script.learningObjectives || '[]') } catch { return [] }
            })()

            return (
              <div key={script.id}
                className="rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedScript(isExpanded ? null : script.id)}
                >
                  <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{script.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ~{script.estimatedDurationMinutes} min · {sections.length} scenes
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-500" />
                      : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
                    {objectives.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Learning Objectives</p>
                        <ul className="space-y-1">
                          {objectives.map((o, i) => (
                            <li key={i} className="text-xs text-slate-300 flex gap-2">
                              <span className="text-indigo-400">•</span>{o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sections.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-2">Scenes ({sections.length})</p>
                        <div className="space-y-2">
                          {sections.map((scene, i) => (
                            <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-white/[0.04]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-indigo-400">{i + 1}</span>
                                <p className="text-xs font-medium text-white">{scene.title}</p>
                                {scene.duration_seconds && (
                                  <span className="text-xs text-slate-600">{scene.duration_seconds}s</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                                {scene.script_content}
                              </p>
                              {scene.visual_prompt && (
                                <p className="text-xs text-slate-600 mt-1 italic">
                                  Visual: {scene.visual_prompt}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {script.status !== 'approved' && (
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(script.id)}
                        disabled={approveMutation.isPending}
                        className="w-full"
                      >
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
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-300">
                  All scripts approved! Go to Stage 3 (Voice) to generate TTS audio.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
