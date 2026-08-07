/**
 * Stage 5 — Video Editing.
 *
 * Modules are shown one at a time (collapsible, first open). Each open module is
 * a filmstrip of its SCENES with a "+" between each pair of scenes — click it to
 * pick the transition. Each module has an Approve toggle, and "Generate all
 * modules" compiles every module's video. Transitions + approvals save per project.
 */
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/services/modules'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import { Video, CheckCircle, Loader2, Sparkles, ChevronDown, ArrowLeftRight, ArrowRight, Lock, RefreshCw, AlertCircle } from 'lucide-react'
import StageHeader from '@/components/workspace/StageHeader'
import Spinner from '@/components/ui/Spinner'

function errorToString(e) {
  if (!e) return 'Video generation failed'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  if (e.message && typeof e.message === 'object') return e.message.message || JSON.stringify(e.message)
  try { return JSON.stringify(e) } catch { return 'Video generation failed' }
}

const TRANSITIONS = [
  { id: 'none',     label: 'Cut',      anim: 'pa-tr-cut' },
  { id: 'fade',     label: 'Fade',     anim: 'pa-tr-fade' },
  { id: 'dissolve', label: 'Dissolve', anim: 'pa-tr-dissolve' },
  { id: 'slide',    label: 'Slide',    anim: 'pa-tr-slide' },
]

function ModuleRow({ module, index, defaultOpen, transitions, setTransition, approved, onToggleApprove, onReady, project }) {
  const queryClient = useQueryClient()
  // Fetch scenes up-front so we know if this module is "generated" (its scenes
  // have been designed in Visual Design). A module that isn't ready can't be
  // opened or approved here.
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', module.id],
    queryFn: () => (module.id ? scenesService.listByModule(module.id) : Promise.resolve([])),
    enabled: !!module.id,
  })

  // Manual "test the talking avatar" trigger — this stage is otherwise just
  // transitions + approval (the real generate-and-merge pass lives in Final
  // Video), but there was no way here to confirm a scene's avatar actually
  // renders/matches its design without leaving to Final Video first. Reuses
  // the same submit+poll HeyGen flow and the same avatar-clip cache, so
  // testing here doesn't cost a duplicate render — Final Video just reuses
  // whatever's already cached when it does its own full pass.
  const [regenBusy, setRegenBusy] = useState(false)
  const [regenStatus, setRegenStatus] = useState(null)
  const [regenError, setRegenError] = useState(null)
  const [regenWarning, setRegenWarning] = useState(null)
  const [regenDone, setRegenDone] = useState(false)

  const pollSceneUntilDone = (sceneId, videoId) => new Promise((resolve) => {
    const tick = async (n) => {
      if (n > 180) { setRegenError('A scene timed out waiting on HeyGen.'); return resolve() }
      try {
        const result = await agentsService.pollHeyGen(videoId, sceneId)
        if (result?.completed) return resolve()
        setTimeout(() => tick(n + 1), 5000)
      } catch (e) {
        setRegenError(errorToString(e))
        resolve()
      }
    }
    tick(0)
  })

  const handleRegenerateModule = async (e) => {
    e.stopPropagation()
    if (regenBusy) return
    if (!project?.defaultAvatarId || !project?.defaultVoiceId) {
      setRegenError('Choose an avatar and a voice in Casting settings first.')
      return
    }
    // Regenerate EVERY scene in the module (matches Final Video's counting — it
    // renders per whole scene, not per narrated part/segment, so this count
    // matches what's shown in the module list). Previously this filtered down to
    // only scenes with ttsAudioUrl already set, which silently shrank the count
    // (e.g. "3/7" for a 13-scene module) with no explanation for the missing
    // ones. A scene with no narration audio isn't skipped anymore — HeyGen's
    // call for it just comes back with an avatar_warning ("No narration audio…
    // rendered voice-only") like any other avatar-render issue, so the user
    // sees why instead of the scene silently vanishing from the total.
    const eligible = scenes
    if (!eligible.length) {
      setRegenError('This module has no scenes yet.')
      return
    }
    setRegenBusy(true); setRegenError(null); setRegenWarning(null); setRegenDone(false)
    let done = 0
    setRegenStatus(`Regenerating 0/${eligible.length} scenes…`)
    const CONCURRENCY = 2
    let idx = 0
    const worker = async () => {
      while (idx < eligible.length) {
        const scene = eligible[idx++]
        try {
          const result = await agentsService.runHeyGenAvatar(scene.id, project.defaultAvatarId, project.defaultVoiceId, true)
          if (result?.avatar_warning) setRegenWarning(result.avatar_warning)
          if (result?.video_id) await pollSceneUntilDone(scene.id, result.video_id)
        } catch (err) {
          setRegenError(errorToString(err))
        }
        done++
        setRegenStatus(`Regenerating ${done}/${eligible.length} scenes…`)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, eligible.length) }, worker))
    setRegenStatus(null)
    setRegenBusy(false)
    setRegenDone(true)
    queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
  }
  const ordered = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  // Flatten each scene into its narrated PARTS (hook / content / recap, or one
  // per quiz question) — exactly the same rows the Visual Design menu shows, so
  // the scene count here matches. A scene with no segments stays a single part.
  const parts = ordered.flatMap((scene) => {
    const segs = (scene.segments && scene.segments.length)
      ? [...scene.segments].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      : [null]
    return segs.map((seg) => {
      let design = {}
      if (seg) { try { design = JSON.parse(seg.slideDesign || '{}') } catch {} }
      const assetUrl = seg ? (seg.visualAssetUrl || null) : (scene.visualAssetUrl || null)
      const title = seg
        ? (design.title || seg.slideTitle || scene.slideComposition?.title || 'Part')
        : (scene.slideComposition?.title || (scene.sceneKind === 'welcome' ? 'Intro' : scene.sceneKind === 'quiz' ? 'Quiz' : 'Scene'))
      return { key: seg ? seg.id : scene.id, assetUrl, title }
    })
  })
  const ready = parts.length > 0 && parts.some(p => !!p.assetUrl)

  const [collapsed, setCollapsed] = useState(!defaultOpen)
  // Never keep a not-ready module open.
  const open = ready && !collapsed
  useEffect(() => { onReady?.(module.id, ready) }, [ready, module.id, onReady])

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Module header — click to open/close (only if the module is generated) */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => ready && setCollapsed(c => !c)} disabled={!ready}
          className={`flex items-center gap-2 flex-1 min-w-0 text-left ${ready ? '' : 'cursor-not-allowed'}`}>
          {ready
            ? <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
            : <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${ready ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{index + 1}</div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${ready ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{module.title || `Module ${index + 1}`}</p>
            {!ready && <p className="text-[10px] text-slate-400 dark:text-slate-500">Not generated — design its scenes in Visual Design first</p>}
          </div>
        </button>
        {/* Test the real talking avatar for every scene in this module without
            leaving to Final Video — same cache Final Video reuses. */}
        <button onClick={handleRegenerateModule} disabled={!ready || regenBusy}
          title="Regenerate every scene's talking avatar in this module (to test design/casting)"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 disabled:opacity-50 ${
            !ready ? 'border-slate-200 dark:border-white/10 text-slate-400 cursor-not-allowed'
              : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}>
          {regenBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Regenerate
        </button>
        <button onClick={() => ready && onToggleApprove(module.id)} disabled={!ready}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
            !ready
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : approved
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
          <CheckCircle className="w-3.5 h-3.5" />{approved ? 'Approved' : 'Approve'}
        </button>
      </div>

      {(regenStatus || regenError || regenWarning || regenDone) && (
        <div className="px-4 pb-3 -mt-1 space-y-1.5">
          {regenStatus && (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-700 dark:text-indigo-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> {regenStatus}
            </div>
          )}
          {regenError && (
            <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 dark:text-red-400 flex-1">{regenError}</p>
              <button onClick={() => setRegenError(null)} className="text-red-500/70 hover:text-red-700 text-sm leading-none flex-shrink-0">×</button>
            </div>
          )}
          {regenWarning && (
            <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300 flex-1">{regenWarning}</p>
              <button onClick={() => setRegenWarning(null)} className="text-amber-500/70 hover:text-amber-700 dark:hover:text-amber-300 text-sm leading-none flex-shrink-0">×</button>
            </div>
          )}
          {/* Was unconditional on regenDone alone — so a run where one scene's
              avatar failed (shown above via regenWarning) still claimed
              "rendered for every scene", flatly contradicting the warning
              sitting right above it. Only claim full success when nothing
              fell back to voice-only during this run. */}
          {regenDone && !regenError && !regenWarning && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle className="w-3.5 h-3.5" /> Talking avatar rendered for every scene.
              </span>
              <button onClick={() => setRegenDone(false)} className="text-emerald-600/70 hover:text-emerald-700 dark:hover:text-emerald-300 text-sm leading-none flex-shrink-0">×</button>
            </div>
          )}
          {regenDone && !regenError && regenWarning && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-500/10 border border-slate-500/20">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <CheckCircle className="w-3.5 h-3.5" /> Regeneration finished — but see the warning above, at least one scene didn't get its avatar.
              </span>
              <button onClick={() => setRegenDone(false)} className="text-slate-500/70 hover:text-slate-700 dark:hover:text-slate-300 text-sm leading-none flex-shrink-0">×</button>
            </div>
          )}
        </div>
      )}

      {/* Scene filmstrip (only when open) */}
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-white/[0.06] pt-4 overflow-x-auto">
          {isLoading ? (
            <div className="py-6 flex justify-center"><Spinner size="sm" /></div>
          ) : parts.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No scenes in this module.</p>
          ) : (
            <div className="flex items-start gap-0 min-w-min">
              {parts.map((part, i) => {
                const transId = transitions[part.key] || 'fade'
                const transDef = TRANSITIONS.find(t => t.id === transId) || TRANSITIONS[1]
                return (
                  <div key={part.key} className="flex items-start">
                    {/* Part block — one per narrated part, matching Visual Design */}
                    <div className="w-32 flex-shrink-0 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors">
                      <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                        {part.assetUrl
                          ? <img src={part.assetUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          : <span className="text-white/70 text-lg font-bold">{i + 1}</span>}
                        <span className="absolute top-1 left-1 w-5 h-5 rounded bg-black/45 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      </div>
                      <p className="px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-300 truncate">
                        {part.title}
                      </p>
                    </div>

                    {/* Compact connector — HOVER it to reveal the transition
                        picker (grows in normal flow so nothing gets clipped). */}
                    {i < parts.length - 1 && (
                      <div className="group flex-shrink-0 flex flex-col items-center px-0.5 pt-8">
                        {/* Resting: just an icon (no name). Hover to reveal the
                            options — each with its OWN animated preview so they
                            visibly differ. */}
                        <div title="Transition — hover to change"
                          className={`w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                            transId === 'none'
                              ? 'border-slate-200 dark:border-white/10 text-slate-400'
                              : 'border-indigo-300 dark:border-indigo-500/40 text-indigo-500 dark:text-indigo-400'
                          } group-hover:border-indigo-400`}>
                          <ArrowLeftRight className="w-3 h-3" />
                        </div>
                        <div className="overflow-hidden max-h-0 opacity-0 group-hover:max-h-56 group-hover:opacity-100 transition-all duration-200 ease-out">
                          <div className="flex flex-col gap-1 mt-1.5 w-28 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-lg p-1.5">
                            {TRANSITIONS.map(t => (
                              <button key={t.id} onClick={() => setTransition(part.key, t.id)}
                                className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                                  transId === t.id
                                    ? 'bg-indigo-600 text-white border-transparent'
                                    : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                                }`}>
                                <span className="relative w-6 h-4 rounded-sm overflow-hidden border border-black/10 flex-shrink-0 bg-slate-300 dark:bg-slate-600">
                                  <span className="absolute inset-0 bg-indigo-400/90" />
                                  <span className="absolute inset-0 bg-emerald-400/90" style={{ animation: `${t.anim} 3.4s ease-in-out infinite` }} />
                                </span>
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function VideoEditingPanel({ project, onContinue, onApprovalsChange }) {
  const queryClient = useQueryClient()
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const trKey = `pa-scene-transitions-${project?.id}`
  const apKey = `pa-module-approved-${project?.id}`
  const [transitions, setTransitions] = useState({})
  const [approvedMods, setApprovedMods] = useState({})
  useEffect(() => {
    try { setTransitions(JSON.parse(localStorage.getItem(trKey) || '{}')) } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem(apKey) || '{}')
      setApprovedMods(saved)
      onApprovalsChange?.(saved)
    } catch {}
  }, [trKey, apKey])

  const setTransition = (sceneId, val) => setTransitions(prev => {
    const next = { ...prev, [sceneId]: val }
    try { localStorage.setItem(trKey, JSON.stringify(next)) } catch {}
    return next
  })
  const toggleApprove = (moduleId) => {
    const next = { ...approvedMods, [moduleId]: !approvedMods[moduleId] }
    setApprovedMods(next)
    try { localStorage.setItem(apKey, JSON.stringify(next)) } catch {}
    // Tell the parent so the left-nav "Video Editing" step turns green the
    // instant every module is approved.
    onApprovalsChange?.(next)
  }

  // Bulk-approve every module in one click. The actual avatar render + video
  // compile happens in the FINAL VIDEO step, so this stage is only about setting
  // transitions and approving — no video compile here.
  const [genDone, setGenDone] = useState(false)
  const [genStatus, setGenStatus] = useState(null)
  const approveAll = () => {
    if (!modules.length) return
    const next = Object.fromEntries(modules.map(m => [m.id, true]))
    setApprovedMods(next)
    try { localStorage.setItem(apKey, JSON.stringify(next)) } catch {}
    onApprovalsChange?.(next)
    setGenStatus('All modules approved — continue to the Final Video step to render and download.')
    setGenDone(true)
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  const ordered = [...modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  const approvedCount = ordered.filter(m => approvedMods[m.id]).length
  // Continue (and the green nav tick) only once EVERY module is approved —
  // same "all approved" gate the Scripts step uses.
  const canContinue = ordered.length > 0 && approvedCount === ordered.length

  return (
    <div className="p-6 w-full max-w-5xl mx-auto pa-page-enter space-y-5">
      {/* Continue is only offered once at least one module is approved. */}
      <StageHeader icon={Video} title="Module Editing"
        subtitle="Set the transition between scenes and approve each module"
        onContinue={canContinue ? () => onContinue?.('final-video') : undefined}
        continueLabel="Continue to Final Video" compact />
      <div className="flex justify-end">
        <button onClick={approveAll} disabled={ordered.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
          <CheckCircle className="w-4 h-4" />
          Approve all modules
        </button>
      </div>

      {genStatus && (
        <div className="px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between gap-3">
          <span>{genStatus}</span>
          {genDone && (
            <button onClick={() => onContinue?.('final-video')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex-shrink-0 transition-colors">
              Go to Final Video <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {ordered.length > 0 && (
        <div className={`px-4 py-2 rounded-lg text-xs border ${
          canContinue
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
          {approvedCount} of {ordered.length} module{ordered.length > 1 ? 's' : ''} approved.
          {canContinue ? ' You can continue to Final Video.' : ' Approve all modules to continue.'}
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400 text-center">
          No modules yet — generate scripts first.
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((mod, i) => (
            <ModuleRow key={mod.id} module={mod} index={i} defaultOpen={i === 0}
              transitions={transitions} setTransition={setTransition}
              approved={!!approvedMods[mod.id]} onToggleApprove={toggleApprove}
              project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
