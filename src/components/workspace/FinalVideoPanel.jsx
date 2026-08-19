/**
 * Stage 6 — Final Video.
 *
 * This is now where all avatar generation actually happens (Module Editing is
 * transitions + approval only). Clicking "Generate" on a module opens a modal
 * listing every PART of every scene in that module (one row per segment for a
 * multi-part scene, matching Visual Design's numbering exactly — see the
 * flattening logic in GenerateModuleModal below) — rendered ONE AT A TIME, by
 * hand, so a run never hammers HeyGen with several jobs at once (that's what
 * was triggering "Insufficient credit" / rate-limit style failures, and also
 * why a multi-part scene used to fire off all its segments simultaneously —
 * removed by request). Once every part in the modal has a rendered clip
 * (multi-part scenes auto-stitch into one scene video once all their parts
 * are done — see heygenFinalize.ts's stitchSceneFromSegments), "Generate
 * module video" merges every scene into the module's final video, which can
 * then be downloaded.
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/services/modules'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import { Film, Download, CheckCircle, Loader2, Package, Sparkles, AlertCircle, RefreshCw, X, Info, Lock } from 'lucide-react'
import { toast } from 'sonner'
import StageHeader from '@/components/workspace/StageHeader'
import Spinner from '@/components/ui/Spinner'

function errorToString(e) {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  try { return JSON.stringify(e) } catch { return 'Something went wrong' }
}

// Has this part already got a finished avatar video? If so it's skipped by
// default (saves HeyGen credits + time on a re-run). A `heygen:` value is a
// still-pending job, so it doesn't count as done.
const isRendered = (v) => !!v && !String(v).startsWith('heygen:')
// Backend sentinel for "submitted, HeyGen hasn't finished yet" — see
// generateHeyGenAvatar.ts, which writes `avatarVideoUrl: heygen:<videoId>`
// the moment a job is accepted. Recognizing this lets the UI tell a
// still-rendering part apart from one that was never started, INCLUDING
// right after the generate modal is closed and reopened — otherwise a part
// that's actually mid-render on HeyGen's side looked identical to an
// untouched one, and was still clickable, risking a second HeyGen job being
// fired for the same part (reported 2026-08-13: "if i close that window
// when i open it again can i see it again and still running").
const isPending = (v) => !!v && String(v).startsWith('heygen:')
const pendingVideoId = (v) => String(v).slice('heygen:'.length)

// Submission marker (2026-08-18, "i click on sceen 3 and start loading i
// close the pop up and go back i can't see it loading ... and in hygen
// server i can find both and are the same sceen") — isPending above only
// works AFTER the backend has written the `heygen:<id>` sentinel, which only
// happens once agentsService.runHeyGenAvatar's request actually resolves. If
// the popup gets closed (and the modal unmounts) WHILE that first request is
// still in flight — a very plausible window since it's the request that also
// renders the slide server-side — there's a real gap where nothing in the DB
// says this row is busy yet. Reopening then correctly shows 'idle' (nothing
// was stale, there was just genuinely nothing to see yet), so it's still
// clickable, and clicking again submits a SECOND HeyGen job for the same
// part. This marker closes that gap: written to localStorage the INSTANT a
// generate click happens (before the network call), independent of the
// modal's mount state or the request ever resolving, so a reopened modal
// knows "something was submitted here, don't let this be clicked again"
// even if the server hasn't caught up yet.
const SUBMIT_MARKER_MAX_AGE_MS = 3 * 60 * 1000 // generous for a slow slide render + submit round-trip
const submitMarkerKey = (moduleId, rowKey) => `pa-submitting-${moduleId}:${rowKey}`
const markSubmitting = (moduleId, rowKey) => {
  try { localStorage.setItem(submitMarkerKey(moduleId, rowKey), String(Date.now())) } catch { /* ignore */ }
}
const clearSubmitting = (moduleId, rowKey) => {
  try { localStorage.removeItem(submitMarkerKey(moduleId, rowKey)) } catch { /* ignore */ }
}
const isSubmitting = (moduleId, rowKey) => {
  try {
    const raw = localStorage.getItem(submitMarkerKey(moduleId, rowKey))
    if (!raw) return false
    if (Date.now() - Number(raw) > SUBMIT_MARKER_MAX_AGE_MS) {
      localStorage.removeItem(submitMarkerKey(moduleId, rowKey))
      return false
    }
    return true
  } catch { return false }
}

// mm:ss for the live elapsed-time readout — HeyGen render time varies a lot
// (a few minutes to well over 15+ depending on account concurrency/queueing),
// so a live "how long this is taking so far" counter is more honest than a
// fixed ETA guess.
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

// The per-module modal: lists every PART (segment) of every scene, generates
// them one at a time on request, then merges once every scene is done.
function GenerateModuleModal({ module, project, onClose }) {
  const queryClient = useQueryClient()
  // refetchOnMount: 'always' (2026-08-18, "close the popup by mistake... open
  // it again it stop loading") — the global QueryClient default is a 1-minute
  // staleTime, so reopening this modal within a minute of first opening it
  // served the STALE cached `scenes` list instead of refetching — meaning a
  // job submitted right before the modal was closed (which writes the
  // `heygen:<id>` pending sentinel straight to the DB, see isPending above)
  // wouldn't show up yet, and every row looked 'idle' instead of 'busy' even
  // though the render was genuinely still running server-side. The HeyGen job
  // itself was never affected by closing the modal — only this modal's own
  // stale view of it was. Forcing a fresh fetch on every mount fixes that;
  // resumeRow (below) then picks the still-pending row back up exactly as
  // designed.
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', module.id],
    queryFn: () => scenesService.listByModule(module.id),
    enabled: !!module.id,
    refetchOnMount: 'always',
  })
  const orderedScenes = [...scenes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))

  // Flatten scenes into one row PER SEGMENT — mirrors VisualDesignerPanel's
  // menu exactly (same rule: a scene's rows are its segments, or a single
  // implicit row if it has none; one running counter numbers every row
  // across the WHOLE module, not restarting per scene), so "part 3" here
  // means the same thing it does in Visual Design.
  //
  // A scene with MORE THAN ONE segment renders and tracks completion PER
  // SEGMENT — each part is its own HeyGen job, its own click, its own
  // SceneSegment.avatarVideoUrl, auto-stitched into the scene's real video
  // once every sibling part is also done (heygenFinalize.ts's
  // stitchSceneFromSegments — no more auto-firing every part at once).
  // A scene with exactly one segment (or none — legacy single-slide scenes)
  // still renders/tracks at the SCENE level (Scene.avatarVideoUrl), same as
  // before — it's still just one row, one click, one job either way.
  let rowNumber = 0
  const rows = orderedScenes.flatMap((scene) => {
    const segs = (scene.segments && scene.segments.length > 0) ? scene.segments : [null]
    const multiPart = segs.length > 1
    return segs.map((seg) => {
      rowNumber += 1
      return {
        key: seg ? seg.id : scene.id,
        displayNumber: rowNumber,
        scene,
        // Only pass segment_id to the backend when it actually changes
        // behavior (a true multi-part scene) — for a single-segment scene
        // the backend treats it as a normal whole-scene render regardless.
        segmentId: multiPart ? seg?.id : null,
        renderedUrl: multiPart ? seg?.avatarVideoUrl : scene.avatarVideoUrl,
        thumb: seg?.visualAssetUrl || scene.visualAssetUrl,
        label: seg?.segmentType
          ? seg.segmentType.charAt(0).toUpperCase() + seg.segmentType.slice(1)
          : (scene.sceneKind === 'welcome' ? 'Intro' : scene.sceneKind === 'quiz' ? 'Quiz' : 'Scene'),
      }
    })
  })

  // { [rowKey]: { status: 'busy'|'done'|'warning'|'error', message } } — a
  // row not in this map yet falls back to whatever the backend already has
  // (isRendered(row.renderedUrl)), so previously-rendered parts show as
  // done immediately without needing a click.
  const [rowStates, setRowStates] = useState({})
  const [activeRowKey, setActiveRowKey] = useState(null) // one at a time, by design — set by whichever tile was clicked
  // Which row's rendered clip is currently open in the preview player. Stored
  // as just the key (not the row object) so it stays fresh across re-renders
  // — e.g. after a regenerate, `rows` is recomputed with a new renderedUrl
  // and the preview should show the NEW clip, not a stale snapshot.
  const [previewKey, setPreviewKey] = useState(null)

  // Server-known pending state (isPending) is checked even when this row has
  // no LOCAL rowStates entry yet — that's exactly the case right after the
  // modal is reopened, before the resume effect below has had a chance to
  // attach its own 'busy' state. isSubmitting (the localStorage marker) is
  // checked LAST, only when the server doesn't already show pending/done —
  // it's a fallback for the narrow window before the server even knows a job
  // was submitted, not meant to override real server state once it arrives.
  const statusOf = (row) => rowStates[row.key]?.status
    || (isPending(row.renderedUrl) ? 'busy'
      : isRendered(row.renderedUrl) ? 'done'
      : isSubmitting(module.id, row.key) ? 'busy' : 'idle')
  const messageOf = (row) => rowStates[row.key]?.message
    || (isPending(row.renderedUrl) && !rowStates[row.key] ? 'Still rendering on HeyGen…'
      : (!isPending(row.renderedUrl) && !isRendered(row.renderedUrl) && isSubmitting(module.id, row.key))
        ? 'Submitting to HeyGen — reopened before this could be confirmed, syncing…' : undefined)

  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!activeRowKey) { setElapsedSec(0); return }
    const start = Date.now()
    setElapsedSec(0)
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [activeRowKey])

  const doneCount = rows.filter(row => statusOf(row) === 'done' || statusOf(row) === 'warning').length
  const total = rows.length
  const allDone = total > 0 && doneCount === total

  const pollScene = (sceneId, videoId) => new Promise((resolve) => {
    const tick = async (n) => {
      if (n > 180) return resolve({ status: 'error', message: 'Timed out waiting on HeyGen (~15 min).' })
      try {
        const r = await agentsService.pollHeyGen(videoId, sceneId)
        if (r?.completed) return resolve({ status: r?.avatar_warning ? 'warning' : 'done', message: r?.avatar_warning })
        if (r?.status === 'failed' || r?.status === 'error') {
          return resolve({ status: 'error', message: r?.error || 'HeyGen could not render this part.' })
        }
        setTimeout(() => tick(n + 1), 5000)
      } catch (e) { resolve({ status: 'error', message: errorToString(e) }) }
    }
    tick(0)
  })

  const anyPending = rows.some(row => isPending(row.renderedUrl))
  // Blocks a second click on ANY row currently mid-submission, even right
  // after reopening the modal before the server has confirmed it — see the
  // isSubmitting marker comment above.
  const anySubmitting = rows.some(row => isSubmitting(module.id, row.key))

  const generateRow = async (row) => {
    if (activeRowKey || anyPending || anySubmitting) return // one at a time
    if (!project?.defaultAvatarId || !project?.defaultVoiceId) {
      setRowStates(prev => ({ ...prev, [row.key]: { status: 'error', message: 'Choose an avatar and a voice in Casting settings first.' } }))
      return
    }
    // Written BEFORE the network call, synchronously — survives the modal
    // being closed while runHeyGenAvatar is still in flight, unlike
    // activeRowKey/rowStates (plain component state, lost on unmount).
    markSubmitting(module.id, row.key)
    setActiveRowKey(row.key)
    setRowStates(prev => ({ ...prev, [row.key]: { status: 'busy', message: 'Rendering the slide and submitting to HeyGen…' } }))
    try {
      const r = await agentsService.runHeyGenAvatar(row.scene.id, project.defaultAvatarId, project.defaultVoiceId, true, row.segmentId || undefined)
      if (r?.video_id) {
        setRowStates(prev => ({ ...prev, [row.key]: { status: 'busy', message: 'HeyGen is rendering the talking avatar (usually 1–2 min)…' } }))
        const outcome = await pollScene(row.scene.id, r.video_id)
        setRowStates(prev => ({ ...prev, [row.key]: outcome }))
        notifyRowOutcome(row, outcome)
      } else {
        const outcome = r?.avatar_warning ? { status: 'warning', message: r.avatar_warning } : { status: 'done' }
        setRowStates(prev => ({ ...prev, [row.key]: outcome }))
        notifyRowOutcome(row, outcome)
      }
    } catch (e) {
      const outcome = { status: 'error', message: errorToString(e) }
      setRowStates(prev => ({ ...prev, [row.key]: outcome }))
      notifyRowOutcome(row, outcome)
    } finally {
      clearSubmitting(module.id, row.key)
      setActiveRowKey(null)
      queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
    }
  }

  // Picks a still-rendering part back up after this modal is closed and
  // reopened (or the page is refreshed) mid-render. generateRow() submits
  // the job AND polls it in one call, but a fresh mount of this modal only
  // knows what's in the `scenes` query — it never called generateRow itself,
  // so there's no polling loop running for that part anymore. The HeyGen job
  // itself is unaffected (it's a backend job, not tied to this component
  // being mounted), so all that's missing is watching for its completion —
  // resumeRow() re-attaches exactly that, using the videoId embedded in the
  // `heygen:<id>` sentinel (see isPending/pendingVideoId above) instead of
  // resubmitting a brand new job.
  const resumeRow = (row) => {
    const videoId = pendingVideoId(row.renderedUrl)
    setActiveRowKey(row.key)
    setRowStates(prev => ({ ...prev, [row.key]: { status: 'busy', message: 'Still rendering on HeyGen — picked back up after reopening…' } }))
    pollScene(row.scene.id, videoId).then((outcome) => {
      setRowStates(prev => ({ ...prev, [row.key]: outcome }))
      notifyRowOutcome(row, outcome)
    }).finally(() => {
      setActiveRowKey(null)
      queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
    })
  }

  // Toast so a render's outcome is visible even if the user closed this
  // modal (or switched tabs/panels) while it was running — "go for lunch
  // break he can find the work done and notification" (2026-08-18). Fires
  // from both a fresh generateRow() and a resumeRow() pickup, so it's the
  // same regardless of whether the modal stayed open the whole time.
  const notifyRowOutcome = (row, outcome) => {
    const label = `${module.title || 'Module'} — ${row.label} (part ${row.displayNumber})`
    if (outcome.status === 'done') toast.success(`${label} finished rendering`)
    else if (outcome.status === 'warning') toast.warning(`${label} finished with a warning`, { description: outcome.message })
    else if (outcome.status === 'error') toast.error(`${label} failed to render`, { description: outcome.message })
  }

  // Runs on every render (cheap — just an array scan) but is self-limiting:
  // resumeRow() sets a rowStates entry for that key synchronously via
  // setState, so the very next render's `.find()` no longer matches it,
  // and activeRowKey being set blocks starting a second resume in parallel.
  useEffect(() => {
    if (activeRowKey || isLoading) return
    const orphaned = rows.find(row => isPending(row.renderedUrl) && !rowStates[row.key])
    if (orphaned) resumeRow(orphaned)
  })

  // While any row has an unresolved submission marker (isSubmitting but the
  // server doesn't show a real `heygen:` sentinel yet — the exact gap this
  // marker exists to cover), keep refetching `scenes` every few seconds so
  // the UI transitions to properly-confirmed 'busy' (and the orphan-resume
  // effect above picks it up) as soon as the server catches up, without the
  // user needing to do anything. Stops on its own once nothing is submitting.
  useEffect(() => {
    if (!anySubmitting) return
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['scenes', module.id] })
    }, 3000)
    return () => clearInterval(id)
  }, [anySubmitting, module.id])

  // No auto-chain "generate everything" action (removed by request) and no
  // auto parallel multi-segment fan-out either — every row (scene OR
  // segment) only ever starts on its own explicit click, one at a time.
  const activeIndex = rows.findIndex(row => row.key === activeRowKey)
  const previewRow = rows.find(row => row.key === previewKey) || null

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
        toast.success(`"${module.title || 'Module'}" final video is ready`)
      } else {
        const msg = res?.error || 'No video was produced — check every scene above has a rendered clip.'
        setMergeStatus('error'); setMergeError(msg)
        toast.error(`"${module.title || 'Module'}" merge failed`, { description: msg })
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Merge failed.'
      setMergeStatus('error')
      setMergeError(msg)
      toast.error(`"${module.title || 'Module'}" merge failed`, { description: msg })
    }
  }

  // Both overlays below are portaled straight to document.body. The panel
  // this modal is opened from (FinalVideoPanel's root div) carries the
  // shared `pa-page-enter` entrance-animation class, whose CSS animation
  // ends on `transform: translateY(0) scale(1)` with fill-mode "both" — that
  // final transform value NEVER clears (fill-mode keeps it applied forever
  // after the animation finishes), and ANY transform on an ancestor — even
  // an identity one — turns it into the containing block for descendant
  // `position: fixed` elements per the CSS spec. Left un-portaled, both
  // "fixed inset-0" overlays here would size/position themselves against
  // that narrow max-w-3xl panel div instead of the real viewport (this is
  // the same bug already worked around this way elsewhere, see
  // VisualDesignerPanel.jsx's createPortal modals).
  return (
    <>
    {createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{module.title || 'Module'}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Generate each part, then merge into the final video</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Helper text — explains the flow up front, every time. */}
        <div className="mx-5 mt-3 flex-shrink-0 flex items-start gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
            Click a part below to generate it — numbered the same way as in Visual Design. Once it's done, click it again to preview the clip before moving on to the next part.
          </p>
        </div>

        {/* No "generate all"/auto-chain button, and no auto parallel
            multi-segment fan-out (both removed by request — a multi-part
            scene used to fire ALL its segments as simultaneous HeyGen jobs
            from one click). Every row now only starts when its own tile
            below is clicked — see generateRow() above and the grid's
            onClick just below. */}
        {activeRowKey && (
          <div className="mx-5 mt-3 flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin flex-shrink-0" />
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300">Rendering part {activeIndex >= 0 ? activeIndex + 1 : ''}… ({formatElapsed(elapsedSec)} elapsed)</p>
          </div>
        )}

        {/* Overall progress */}
        <div className="mx-5 mt-3 flex-shrink-0">
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            <span>{doneCount} of {total} part{total === 1 ? '' : 's'} generated</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }} />
          </div>
        </div>

        {/* Part grid — each segment (or whole scene, if it has none) is its
            own framed thumbnail card, numbered to match Visual Design, so you
            can see at a glance what's generated. Not-yet-generated tiles
            pulse (waiting for a click); a finished tile is a normal, static
            thumbnail. This is the modal's ONE scroll surface (capped by the
            card's max-h-[90vh] above) — header, progress bar and footer stay
            put so the whole popup always fits on screen without the page
            itself needing to scroll to reach it. */}
        <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="py-6 flex justify-center"><Spinner size="sm" /></div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No scenes in this module.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {rows.map((row) => {
                const status = statusOf(row)
                const message = messageOf(row)
                const busy = status === 'busy'
                // A rendered part opens a PREVIEW on click (see previewKey
                // above) instead of immediately re-rendering — regenerating
                // costs a real HeyGen job, so it now needs its own explicit
                // click (the small refresh icon below), not an accidental
                // click meant to just check the clip. Not-yet-rendered /
                // errored parts still generate on click, same as before.
                const isDoneish = status === 'done' || status === 'warning'
                const canGenerate = !activeRowKey && !anyPending && !anySubmitting
                const clickable = isDoneish || canGenerate
                const handleTileClick = () => {
                  if (isDoneish) { setPreviewKey(row.key); return }
                  if (canGenerate) generateRow(row)
                }
                // Plain div, not <button> — it now contains its own nested
                // regenerate button (invalid HTML to nest <button> inside
                // <button>), with role="button" to keep it keyboard/AT
                // accessible.
                return (
                  <div key={row.key} role="button" tabIndex={clickable ? 0 : -1}
                    onClick={handleTileClick}
                    onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleTileClick() } }}
                    aria-disabled={!clickable}
                    title={
                      message ? `${row.label}: ${message}`
                        : isDoneish ? `${row.label} — click to preview`
                        : `${row.label} — click to generate`
                    }
                    className={`relative aspect-video rounded-xl border overflow-hidden bg-slate-100 dark:bg-slate-800 text-left transition-all ${
                      status === 'done' ? 'border-emerald-500/40'
                        : status === 'warning' ? 'border-amber-500/40'
                        : status === 'error' ? 'border-red-500/40'
                        : busy ? 'border-indigo-500/40'
                        : 'border-slate-200 dark:border-white/10'
                    } ${clickable ? 'hover:ring-2 hover:ring-indigo-400/50 cursor-pointer' : 'cursor-default opacity-60'}`}>
                    {row.thumb ? (
                      <img src={row.thumb} alt="" className={`absolute inset-0 w-full h-full object-cover ${status === 'idle' ? 'opacity-45' : ''}`} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500 text-base font-bold">{row.displayNumber}</div>
                    )}
                    {/* Not generated yet — a gentle pulse marks it as waiting for a click */}
                    {status === 'idle' && <div className="absolute inset-0 bg-slate-400/10 animate-pulse" />}
                    <span className="absolute top-1 left-1 w-5 h-5 rounded bg-black/45 text-white text-[10px] font-bold flex items-center justify-center">{row.displayNumber}</span>
                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      status === 'done' ? 'bg-emerald-500/90' : status === 'warning' ? 'bg-amber-500/90' : status === 'error' ? 'bg-red-500/90' : busy ? 'bg-indigo-500/90' : 'bg-black/35'
                    }`}>
                      {busy ? <Loader2 className="w-3 h-3 animate-spin text-white" />
                        : status === 'done' ? <CheckCircle className="w-3 h-3 text-white" />
                        : (status === 'warning' || status === 'error') ? <AlertCircle className="w-3 h-3 text-white" />
                        : null}
                    </div>
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/45 text-white text-[9px] font-medium max-w-[80%] truncate">
                      {row.label}
                    </span>
                    {busy && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/55 text-white text-[9px] font-medium">
                        {formatElapsed(elapsedSec)}
                      </span>
                    )}
                    {isDoneish && !busy && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); if (canGenerate) generateRow(row) }}
                        disabled={!canGenerate}
                        title={`Regenerate ${row.label} (uses another HeyGen render)`}
                        className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/55 hover:bg-black/75 disabled:opacity-40 flex items-center justify-center text-white transition-colors">
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — merge action */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 space-y-2">
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
              {allDone ? 'Every part is generated — ready to merge.' : `${total - doneCount} part${total - doneCount === 1 ? '' : 's'} left to generate.`}
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
    </div>,
    document.body
    )}

    {/* Preview overlay — opened by clicking an already-rendered tile above.
        Lets you check the clip (avatar, audio, lipsync) BEFORE moving on to
        generate the next part, so a bad take gets caught and redone early
        instead of only being noticed after the whole module is merged.
        Portaled for the same containing-block reason as the modal above. */}
    {previewRow && createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={() => setPreviewKey(null)}>
        <div onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
          <video controls autoPlay src={previewRow.renderedUrl} className="w-full aspect-video bg-black" />
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                Part {previewRow.displayNumber} — {previewRow.label}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                If this is good, close and generate the next part. Otherwise, regenerate it now.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button type="button"
                onClick={() => { setPreviewKey(null); generateRow(previewRow) }}
                disabled={!!activeRowKey || anyPending || anySubmitting}
                title="Regenerate this part (uses another HeyGen render)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </button>
              <button type="button" onClick={() => setPreviewKey(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                Looks good
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
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
              Press "Generate" on a module to open its part list — render each talking avatar part one at a time, then merge into the module's final video.
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
                      <p className="text-[11px] text-indigo-100">Opens the part-by-part generator</p>
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
