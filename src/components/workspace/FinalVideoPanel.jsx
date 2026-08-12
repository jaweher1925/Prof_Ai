/**
 * Stage 6 — Final Video.
 *
 * This is now where all avatar generation actually happens (Module Editing is
 * transitions + approval only). Clicking "Generate" on a module opens a modal
 * listing every scene in that module — scenes are rendered ONE AT A TIME, by
 * hand, so a run never hammers HeyGen with a big batch at once (that's what was
 * triggering "Insufficient credit" / rate-limit style failures before). Once
 * every scene in the modal has a rendered clip, "Generate module video" merges
 * them into the module's final video, which can then be downloaded.
 */
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/services/modules'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import { Film, Download, CheckCircle, Loader2, Package, Sparkles, AlertCircle, RefreshCw, X, Info, Lock } from 'lucide-react'
import StageHeader from '@/components/workspace/StageHeader'
import Spinner from '@/components/ui/Spinner'

function errorToString(e) {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  try { return JSON.stringify(e) } catch { return 'Something went wrong' }
}

// Has this scene already got a finished avatar video? If so it's skipped by
// default (saves HeyGen credits + time on a re-run). A `heygen:` value is a
// still-pending job, so it doesn't count as done.
const isRendered = (v) => !!v && !String(v).startsWith('heygen:')

// mm:ss for the live elapsed-time readout — HeyGen render time varies a lot
// (a few minutes to 8+ for a long, multi-part scene), so a live "how long
// this is taking so far" counter is more honest than a fixed ETA guess.
function formatElapsed(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Small reusable "helper text + progress bar" block — used inside the modal so
// the user always sees what's currently happening, not just a bare spinner.
function StepProgress({ label, sublabel }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> {label}
      </span>
      {sublabel && <p className="text-[10px] text-slate-400 dark:text-slate-500">{sublabel}</p>}
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div className="h-full w-1/3 bg-indigo-500 animate-pulse" />
      </div>
    </div>
  )
}

// The per-module modal: lists every scene, generates them one at a time on
// request, then merges once they're all done.
function GenerateModuleModal({ module, project, onClose }) {
  const queryClient = useQueryClient()
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', module.id],
    queryFn: () => scenesService.listByModule(module.id),
    enabled: !!module.id,
  })
  const ordered = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))

  // { [sceneId]: { status: 'busy'|'done'|'warning'|'error', message } } — a
  // scene not in this map yet falls back to whatever the backend already has
  // (isRendered(scene.avatarVideoUrl)), so previously-rendered scenes show as
  // done immediately without needing a click.
  const [sceneStates, setSceneStates] = useState({})
  const [activeSceneId, setActiveSceneId] = useState(null) // one at a time, by design
  const [autoRunning, setAutoRunning] = useState(false) // true while "Generate scenes" is chaining through all of them
  const [autoError, setAutoError] = useState(null)

  const statusOf = (scene) => sceneStates[scene.id]?.status
    || (isRendered(scene.avatarVideoUrl) ? 'done' : 'idle')
  const messageOf = (scene) => sceneStates[scene.id]?.message

  // Live "how long has this scene been rendering" counter — HeyGen's own
  // render time isn't something we control or can predict precisely (it
  // ranged from ~2 to ~8+ minutes across recent runs), so a ticking elapsed
  // clock is a more honest signal than a made-up ETA.
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!activeSceneId) { setElapsedSec(0); return }
    const start = Date.now()
    setElapsedSec(0)
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [activeSceneId])

  const doneCount = ordered.filter(sc => statusOf(sc) === 'done' || statusOf(sc) === 'warning').length
  const total = ordered.length
  const allDone = total > 0 && doneCount === total

  const pollScene = (sceneId, videoId) => new Promise((resolve) => {
    const tick = async (n) => {
      if (n > 180) return resolve({ status: 'error', message: 'Timed out waiting on HeyGen (~15 min).' })
      try {
        const r = await agentsService.pollHeyGen(videoId, sceneId)
        if (r?.completed) return resolve({ status: r?.avatar_warning ? 'warning' : 'done', message: r?.avatar_warning })
        if (r?.status === 'failed' || r?.status === 'error') {
          return resolve({ status: 'error', message: r?.error || 'HeyGen could not render this scene.' })
        }
        setTimeout(() => tick(n + 1), 5000)
      } catch (e) { resolve({ status: 'error', message: errorToString(e) }) }
    }
    tick(0)
  })

  const generateScene = async (sceneId) => {
    if (activeSceneId) return // one at a time
    if (!project?.defaultAvatarId || !project?.defaultVoiceId) {
      setSceneStates(prev => ({ ...prev, [sceneId]: { status: 'error', message: 'Choose an avatar and a voice in Casting settings first.' } }))
      return
    }
    setActiveSceneId(sceneId)
    setSceneStates(prev => ({ ...prev, [sceneId]: { status: 'busy', message: 'Rendering the slide and submitting to HeyGen…' } }))
    try {
      const r = await agentsService.runHeyGenAvatar(sceneId, project.defaultAvatarId, project.defaultVoiceId, true)
      if (r?.video_id) {
        setSceneStates(prev => ({ ...prev, [sceneId]: { status: 'busy', message: 'HeyGen is rendering the talking avatar (usually 1–2 min)…' } }))
        const outcome = await pollScene(sceneId, r.video_id)
        setSceneStates(prev => ({ ...prev, [sceneId]: outcome }))
      } else {
        setSceneStates(prev => ({ ...prev, [sceneId]: r?.avatar_warning ? { status: 'warning', message: r.avatar_warning } : { status: 'done' } }))
      }
    } catch (e) {
      setSceneStates(prev => ({ ...prev, [sceneId]: { status: 'error', message: errorToString(e) } }))
    } finally {
      setActiveSceneId(null)
      queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
    }
  }

  // Fallback path — generate every not-yet-done scene in order, one at a
  // time (still one HeyGen job in flight at once, same pacing as clicking
  // each scene by hand, just automated). A scene that already has a video
  // (or one you regenerate individually below) is skipped. Kept as a manual
  // fallback under the primary batch button below — slower (one HeyGen job
  // per scene) but each scene succeeds/fails independently, which the
  // all-or-nothing batch below doesn't offer.
  const generateAllScenes = async (force = false) => {
    if (autoRunning || activeSceneId || batchRunning) return
    if (!project?.defaultAvatarId || !project?.defaultVoiceId) {
      setAutoError('Choose an avatar and a voice in Casting settings first.')
      return
    }
    setAutoRunning(true); setAutoError(null)
    for (const scene of ordered) {
      const st = statusOf(scene)
      // force=true is passed when every scene is already done ("Regenerate
      // all scenes" was clicked) — without it, every scene would just skip
      // itself as already-done and the button would silently do nothing.
      if (!force && (st === 'done' || st === 'warning')) continue
      await generateScene(scene.id)
    }
    setAutoRunning(false)
  }
  const activeIndex = ordered.findIndex(s => s.id === activeSceneId)

  // Primary action (#46) — bundle every not-yet-done scene's narration into
  // ONE HeyGen job instead of one job per scene, cutting total fixed
  // per-job overhead (see generateModuleAvatarBatch.ts's docs). All-or-
  // nothing: every scene in the batch finishes together when the one job
  // lands, rather than showing individual progress as each completes —
  // that trade-off is why generateAllScenes above is kept as a fallback.
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchError, setBatchError] = useState(null)
  const [batchElapsedSec, setBatchElapsedSec] = useState(0)
  useEffect(() => {
    if (!batchRunning) { setBatchElapsedSec(0); return }
    const start = Date.now()
    setBatchElapsedSec(0)
    const id = setInterval(() => setBatchElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [batchRunning])

  const pollBatch = (videoId) => new Promise((resolve) => {
    const tick = async (n) => {
      if (n > 180) return resolve({ status: 'error', message: 'Timed out waiting on HeyGen (~15 min).' })
      try {
        const r = await agentsService.pollHeyGen(videoId)
        if (r?.completed) return resolve({ status: 'done' })
        if (r?.status === 'failed' || r?.status === 'error') {
          return resolve({ status: 'error', message: r?.error || 'HeyGen could not render this batch.' })
        }
        setTimeout(() => tick(n + 1), 5000)
      } catch (e) { resolve({ status: 'error', message: errorToString(e) }) }
    }
    tick(0)
  })

  const generateBatch = async (force = false) => {
    if (batchRunning || autoRunning || activeSceneId) return
    if (!project?.defaultAvatarId || !project?.defaultVoiceId) {
      setBatchError('Choose an avatar and a voice in Casting settings first.')
      return
    }
    const targets = force ? ordered : ordered.filter((sc) => {
      const st = statusOf(sc)
      return st !== 'done' && st !== 'warning'
    })
    if (!targets.length) return
    setBatchRunning(true); setBatchError(null)
    setSceneStates((prev) => {
      const next = { ...prev }
      targets.forEach((sc) => { next[sc.id] = { status: 'busy', message: 'Batched into one HeyGen job with the rest of this module…' } })
      return next
    })
    try {
      const r = await agentsService.runGenerateModuleAvatarBatch(module.id, targets.map((sc) => sc.id))
      if (r?.status === 'completed') {
        setSceneStates((prev) => {
          const next = { ...prev }
          targets.forEach((sc) => { next[sc.id] = { status: 'done' } })
          return next
        })
      } else if (r?.video_id) {
        const outcome = await pollBatch(r.video_id)
        setSceneStates((prev) => {
          const next = { ...prev }
          targets.forEach((sc) => {
            next[sc.id] = outcome.status === 'done' ? { status: 'done' } : { status: 'error', message: outcome.message }
          })
          return next
        })
        if (outcome.status === 'error') setBatchError(outcome.message)
      } else {
        setBatchError(r?.error || 'Batch generation failed.')
        setSceneStates((prev) => {
          const next = { ...prev }
          targets.forEach((sc) => { next[sc.id] = { status: 'error', message: r?.error } })
          return next
        })
      }
    } catch (e) {
      const msg = e?.response?.data?.error || errorToString(e)
      setBatchError(msg)
      setSceneStates((prev) => {
        const next = { ...prev }
        targets.forEach((sc) => { next[sc.id] = { status: 'error', message: msg } })
        return next
      })
    } finally {
      setBatchRunning(false)
      queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
    }
  }

  // Merge — only meaningful once scenes have rendered clips to stitch together.
  const [mergeStatus, setMergeStatus] = useState(null) // null | 'busy' | 'done' | 'error'
  const [mergeError, setMergeError] = useState(null)
  const [mergeUrl, setMergeUrl] = useState(module.fullVideoUrl || null)

  const generateModuleVideo = async () => {
    if (mergeStatus === 'busy') return
    setMergeStatus('busy'); setMergeError(null)
    try {
      // Module Editing's per-scene-boundary transition choice + project-wide
      // pause length (VideoEditingPanel.jsx) — both only lived in
      // localStorage before, never actually reaching the merge, so it always
      // did a fixed hold+cut regardless of what was picked there.
      let transitions
      try {
        const picked = JSON.parse(localStorage.getItem(`pa-scene-transitions-${project?.id}`) || '{}')
        // Pause length lives PER scene boundary now (same picker as the
        // transition style in Module Editing) — keyed by sceneId, defaults
        // to 3s for any boundary that never got its own value saved.
        const pauseSecs = JSON.parse(localStorage.getItem(`pa-scene-pause-${project?.id}`) || '{}')
        transitions = Object.fromEntries(
          Object.entries(picked).map(([sceneId, type]) => [sceneId, { type, pauseSec: pauseSecs[sceneId] ?? 3 }])
        )
      } catch { /* fall back to server defaults */ }
      const res = await agentsService.runMergeModuleVideo(module.id, transitions)
      const url = res?.full_video_url || res?.fullVideoUrl
      if (url) {
        setMergeStatus('done'); setMergeUrl(url)
        queryClient.invalidateQueries({ queryKey: ['modules', project?.id] })
      } else {
        setMergeStatus('error'); setMergeError(res?.error || 'No video was produced — check every scene above has a rendered clip.')
      }
    } catch (e) {
      setMergeStatus('error')
      setMergeError(e?.response?.data?.error || e?.message || 'Merge failed.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl my-auto flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{module.title || 'Module'}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Generate each scene, then merge into the final video</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Helper text — explains the flow up front, every time. */}
        <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
            Generate each scene below, then "Generate module video" merges them.
          </p>
        </div>

        {/* Primary action — per-scene (switched back from batched after a
            real 20+min batch run on a 9-scene module — see FinalVideoPanel
            docs / heygenFinalize.ts's module-batch section for the
            trade-off). Batch is now the fallback, not removed — still useful
            for smaller modules or once its timing is better understood. */}
        <div className="mx-5 mt-3 flex-shrink-0">
          <button onClick={() => generateAllScenes(allDone)} disabled={autoRunning || !!activeSceneId || batchRunning || total === 0}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
            {autoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {autoRunning
              ? `Generating scene ${activeIndex >= 0 ? activeIndex + 1 : ''} of ${total}… (${formatElapsed(elapsedSec)} elapsed)`
              : allDone ? 'Regenerate all scenes' : 'Generate scenes'}
          </button>
          {autoError && <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">{autoError}</p>}
          {!batchRunning && !autoRunning && !activeSceneId && (
            <button onClick={() => generateBatch(allDone)}
              className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 underline transition-colors">
              …or batch it into one HeyGen job instead (can be faster, but all-or-nothing and unpredictable for large modules)
            </button>
          )}
          {batchRunning && (
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Rendering {total} scene{total === 1 ? '' : 's'} in one batch… ({formatElapsed(batchElapsedSec)} elapsed)
            </p>
          )}
          {batchError && <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">{batchError}</p>}
        </div>

        {/* Overall progress */}
        <div className="mx-5 mt-3 flex-shrink-0">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <span>{doneCount} of {total} scene{total === 1 ? '' : 's'} generated</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }} />
          </div>
        </div>

        {/* Scene grid — each scene is its own framed thumbnail card so you can
            see at a glance what's generated. Not-yet-generated tiles pulse
            (waiting its turn); a finished tile is a normal, static thumbnail.
            No inner scrollbar here — the whole modal is the one scroll
            surface (only kicks in if the modal is taller than the viewport),
            so every scene is visible together instead of hidden in a box. */}
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="py-6 flex justify-center"><Spinner size="sm" /></div>
          ) : ordered.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No scenes in this module.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {ordered.map((scene, i) => {
                const status = statusOf(scene)
                const message = messageOf(scene)
                const busy = status === 'busy'
                const thumb = scene.visualAssetUrl
                const sceneTitle = scene.slideComposition?.title || (scene.sceneKind === 'welcome' ? 'Intro' : scene.sceneKind === 'quiz' ? 'Quiz' : 'Scene')
                return (
                  <div key={scene.id} title={message ? `${sceneTitle}: ${message}` : sceneTitle}
                    className={`relative aspect-video rounded-xl border overflow-hidden bg-slate-100 dark:bg-slate-800 ${
                      status === 'done' ? 'border-emerald-500/40'
                        : status === 'warning' ? 'border-amber-500/40'
                        : status === 'error' ? 'border-red-500/40'
                        : busy ? 'border-indigo-500/40'
                        : 'border-slate-200 dark:border-white/10'
                    }`}>
                    {thumb ? (
                      <img src={thumb} alt="" className={`absolute inset-0 w-full h-full object-cover ${status === 'idle' ? 'opacity-45' : ''}`} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 text-base font-bold">{i + 1}</div>
                    )}
                    {/* Not generated yet — a gentle pulse marks it as still waiting its turn */}
                    {status === 'idle' && <div className="absolute inset-0 bg-slate-400/10 animate-pulse" />}
                    <span className="absolute top-1 left-1 w-5 h-5 rounded bg-black/45 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      status === 'done' ? 'bg-emerald-500/90' : status === 'warning' ? 'bg-amber-500/90' : status === 'error' ? 'bg-red-500/90' : busy ? 'bg-indigo-500/90' : 'bg-black/35'
                    }`}>
                      {busy ? <Loader2 className="w-3 h-3 animate-spin text-white" />
                        : status === 'done' ? <CheckCircle className="w-3 h-3 text-white" />
                        : (status === 'warning' || status === 'error') ? <AlertCircle className="w-3 h-3 text-white" />
                        : null}
                    </div>
                    {busy && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/55 text-white text-[9px] font-medium">
                        {formatElapsed(batchRunning ? batchElapsedSec : elapsedSec)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — merge action */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 space-y-2.5">
          {mergeStatus === 'busy' && <StepProgress label="Merging scenes into the module video…" sublabel="Stitching every rendered clip together in order" />}
          {mergeStatus === 'error' && (
            <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 dark:text-red-400 flex-1">{mergeError}</p>
            </div>
          )}
          {mergeStatus === 'done' && mergeUrl && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300"><CheckCircle className="w-3.5 h-3.5" /> Module video ready.</span>
              <a href={mergeUrl} download target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex-shrink-0">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {allDone ? 'Every scene is generated — ready to merge.' : `${total - doneCount} scene${total - doneCount === 1 ? '' : 's'} left to generate.`}
            </p>
            <button onClick={generateModuleVideo} disabled={mergeStatus === 'busy' || total === 0}
              title={!allDone ? 'You can still merge, but scenes without a rendered clip will be skipped' : undefined}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex-shrink-0">
              {mergeStatus === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              Generate module video
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FinalVideoPanel({ project }) {
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const [openModuleId, setOpenModuleId] = useState(null)

  // A module unlocks here only once it's approved in Module Editing — same
  // "pa-module-approved" localStorage VideoEditingPanel.jsx already writes to
  // (Module Editing's approval isn't a backend field, so this is the one
  // shared source of truth both stages can read).
  const [approvedInEditing, setApprovedInEditing] = useState({})
  useEffect(() => {
    if (!project?.id) return
    try { setApprovedInEditing(JSON.parse(localStorage.getItem(`pa-module-approved-${project.id}`) || '{}')) } catch {}
  }, [project?.id])

  const [exporting, setExporting] = useState(false)
  const [exportUrl, setExportUrl] = useState(null)
  const [exportError, setExportError] = useState(null)
  const finalize = async () => {
    if (exporting) return
    setExporting(true); setExportError(null)
    try {
      const res = await agentsService.exportSCORM(project.id)
      setExportUrl(res?.url || res?.download_url || res?.scorm_url || null)
    } catch (e) {
      setExportError('Export failed — make sure every module has been generated in Module Editing.')
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  const ordered = [...modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  const readyCount = ordered.filter(m => !!m.fullVideoUrl).length
  const allReady = ordered.length > 0 && readyCount === ordered.length
  const openModule = ordered.find(m => m.id === openModuleId) || null

  return (
    <div className="p-6 w-full max-w-3xl mx-auto pa-page-enter space-y-5">
      <StageHeader icon={Film} title="Final Video" subtitle="Generate the finished video for each module, then play and download" compact />

      {ordered.length > 0 && (
        <>
          {/* Helper — explains the flow now that generation lives entirely here. */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
              Press "Generate" on a module to open its scene list — render each scene's talking avatar one at a time, then merge into the module's final video.
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg text-xs border ${
            allReady
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
            {readyCount} of {ordered.length} module{ordered.length > 1 ? 's' : ''} ready.
            {allReady ? ' Every module is generated.' : ' Generate the remaining modules below.'}
          </div>
        </>
      )}

      {ordered.length === 0 ? (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400 text-center">
          No modules yet — generate scripts first.
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map((mod, i) => {
            const ready = !!mod.fullVideoUrl
            const unlocked = approvedInEditing[mod.id] === true
            return (
              <div key={mod.id} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${unlocked ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                    {unlocked ? i + 1 : <Lock className="w-3.5 h-3.5" />}
                  </div>
                  <p className={`text-sm font-semibold truncate flex-1 ${unlocked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{mod.title || `Module ${i + 1}`}</p>
                  {!unlocked ? (
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex-shrink-0">Locked</span>
                  ) : ready ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a href={mod.fullVideoUrl} download target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                      <button onClick={() => setOpenModuleId(mod.id)}
                        title="Open this module's scenes to regenerate or re-merge"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex-shrink-0">Not generated</span>
                  )}
                </div>
                <div className="p-4">
                  {!unlocked ? (
                    <div className="w-full aspect-video rounded-xl bg-slate-100 dark:bg-slate-800/60 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                      <Lock className="w-7 h-7" />
                      <p className="text-sm font-semibold">Locked</p>
                      <p className="text-[11px] text-center px-8">Approve this module in Module Editing first</p>
                    </div>
                  ) : ready ? (
                    <video controls src={mod.fullVideoUrl} className="w-full rounded-xl bg-black aspect-video" />
                  ) : (
                    // The whole card body IS the primary action now — clicking it
                    // opens the generate modal directly, same as pressing Generate.
                    <button onClick={() => setOpenModuleId(mod.id)}
                      className="w-full aspect-video rounded-xl bg-indigo-600 hover:bg-indigo-500 flex flex-col items-center justify-center text-white gap-2.5 transition-colors shadow-sm">
                      <Sparkles className="w-8 h-8" />
                      <p className="text-sm font-semibold">Generate this module</p>
                      <p className="text-[11px] text-indigo-100">Opens the scene-by-scene generator</p>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Finalize — package the whole course for export */}
      {ordered.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              Finalize course {allReady && <CheckCircle className="w-4 h-4 text-emerald-500" />}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {allReady ? 'All modules are ready. Export the finished course package.' : 'Generate every module above first.'}
            </p>
            {exportError && <p className="text-[11px] text-red-500 mt-1">{exportError}</p>}
            {exportUrl && <a href={exportUrl} download className="text-[11px] text-indigo-600 dark:text-indigo-400 underline mt-1 inline-block">Download course package</a>}
          </div>
          <button onClick={finalize} disabled={exporting || !allReady}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex-shrink-0">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Finalize &amp; export
          </button>
        </div>
      )}

      {openModule && (
        <GenerateModuleModal module={openModule} project={project} onClose={() => setOpenModuleId(null)} />
      )}
    </div>
  )
}
