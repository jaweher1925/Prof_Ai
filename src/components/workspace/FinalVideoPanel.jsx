/**
 * Stage 6 — Final Video.
 *
 * Play the finished video for each module and download it. Transitions and
 * per-module editing happen in Video Editing (stage 5); this is the last stop:
 * watch and finalize.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modulesService } from '@/services/modules'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import { Film, Download, CheckCircle, Loader2, Package, Sparkles } from 'lucide-react'
import StageHeader from '@/components/workspace/StageHeader'
import Spinner from '@/components/ui/Spinner'

export default function FinalVideoPanel({ project }) {
  const queryClient = useQueryClient()
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  // Compile the final video(s) right here — this is where the avatar is actually
  // rendered with lip-sync (HeyGen) for every scene, THEN the scenes are merged
  // into the module video. `busy` holds the id of the module being generated,
  // or 'all' while generating everything.
  const [busy, setBusy] = useState(null)
  const [genError, setGenError] = useState(null)
  const [genStatus, setGenStatus] = useState(null)
  // Fast preview = skip HeyGen lip-sync entirely and render slide + narration
  // (voice-only) with ffmpeg. A few seconds per clip instead of ~2 min, so you
  // can check layout/timing quickly. The real export keeps full lip-sync.
  const [fastPreview, setFastPreview] = useState(false)

  // Poll a HeyGen render job until it reports completed, FAILED, or times out.
  const pollUntilDone = (videoId, sceneId) => new Promise((resolve, reject) => {
    const MAX = 180 // ~15 min at 5s intervals
    const tick = async (n) => {
      if (n > MAX) return reject(new Error('avatar render timed out'))
      try {
        const r = await agentsService.pollHeyGen(videoId, sceneId)
        if (r?.completed) return resolve()
        // HeyGen can report the render FAILED — stop immediately instead of
        // hammering the same dead job for 15 minutes (the "takes too much time"
        // symptom: a failed intro clip was polled hundreds of times).
        if (r?.status === 'failed' || r?.status === 'error') {
          return reject(new Error('HeyGen could not render this scene (it may be too long, or the voice/avatar was rejected)'))
        }
        setTimeout(() => tick(n + 1), 5000)
      } catch (e) { reject(e) }
    }
    tick(0)
  })

  // Has this part already got a finished avatar video? If so we skip re-rendering
  // it (saves HeyGen credits + time on a re-run). A `heygen:` value is a still-
  // pending job, so it doesn't count as done.
  const isRendered = (v) => !!v && !String(v).startsWith('heygen:')

  const generate = async (ids, label) => {
    if (busy) return
    const useAvatar = !fastPreview
    // Lip-sync render needs a chosen presenter + voice. Fast preview is
    // voice-only, so it only needs a voice.
    if (useAvatar && (!project?.defaultAvatarId || !project?.defaultVoiceId)) {
      setGenError('Choose an avatar and a voice in Casting settings before generating.')
      return
    }
    if (!project?.defaultVoiceId) {
      setGenError('Choose a voice in Casting settings before generating.')
      return
    }
    setBusy(label); setGenError(null); setGenStatus(null)
    try {
      // Render per WHOLE SCENE (no segment_id). This is critical: passing a
      // segment_id puts the backend in single-part PREVIEW mode, which renders
      // the avatar but deliberately does NOT write Scene.avatarVideoUrl — so
      // mergeModuleVideo then finds no scene videos and bails. Rendering the
      // whole scene persists Scene.avatarVideoUrl, which is exactly what the
      // merge concatenates.
      // In fast-preview mode we always re-render (voice-only); in full mode we
      // skip scenes that already have a finished clip.
      const perModule = await Promise.all(ids.map(async (id) => {
        const scenes = await scenesService.listByModule(id).catch(() => [])
        const pend = scenes.filter(sc => fastPreview || !isRendered(sc.avatarVideoUrl))
        return { id, scenes: pend }
      }))

      const allScenes = perModule.flatMap(m => m.scenes)
      if (allScenes.length > 0) {
        // The SUBMIT step does a local ffmpeg slide render — running many at once
        // thrashes the one machine's CPU and makes each MUCH slower. So we cap
        // local renders to a couple at a time. The HeyGen render itself runs on
        // HeyGen's servers, so the moment a submit returns a job id we start
        // polling it immediately — those waits overlap fully and don't compete
        // for local CPU.
        const SUBMIT_CONCURRENCY = 2
        const pollPromises = []
        let submitted = 0, finished = 0, idx = 0
        const total = allScenes.length
        const bump = () => setGenStatus(
          fastPreview
            ? `Rendering preview ${submitted}/${total} (no lip-sync)…`
            : `Submitted ${submitted}/${total} · avatars rendered ${finished}/${total}…`
        )
        const worker = async () => {
          while (idx < allScenes.length) {
            const sc = allScenes[idx++]
            try {
              const r = await agentsService.runHeyGenAvatar(sc.id, project.defaultAvatarId, project.defaultVoiceId, useAvatar)
              submitted++; bump()
              if (r?.video_id) {
                pollPromises.push(
                  pollUntilDone(r.video_id, sc.id)
                    .then(() => { finished++; bump() })
                    .catch(e => console.error('poll failed', sc.id, e))
                )
              } else { finished++; bump() }
            } catch (e) { console.error('submit failed', sc.id, e); submitted++; bump() }
          }
        }
        // Run the throttled submit workers, then wait for every HeyGen poll.
        await Promise.all(Array.from({ length: Math.min(SUBMIT_CONCURRENCY, allScenes.length) }, worker))
        await Promise.all(pollPromises)
      }

      // 3) Stitch each module's rendered scenes into its final video and CHECK
      //    the result — a failed merge (e.g. a scene never rendered) used to be
      //    swallowed, leaving the module stuck on "Not generated yet" with no
      //    explanation. Surface exactly which module failed and why.
      setGenStatus('Compiling the module video…')
      const failures = []
      for (const id of ids) {
        try {
          const res = await agentsService.runMergeModuleVideo(id)
          if (!(res?.full_video_url || res?.fullVideoUrl)) {
            failures.push({ id, msg: res?.error || 'no video was produced' })
          }
        } catch (e) {
          failures.push({ id, msg: e?.response?.data?.error || e?.message || 'merge failed' })
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['modules', project?.id] })
      setGenStatus(null)
      if (failures.length) {
        const names = failures.map(f => modules.find(m => m.id === f.id)?.title || 'a module')
        setGenError(`Couldn't compile ${failures.length} module video${failures.length > 1 ? 's' : ''} (${names.join(', ')}): ${failures[0].msg}. Usually one scene has no rendered video yet — check that every scene has its voice generated, then try again.`)
      }
    } catch (e) {
      console.error('final generate failed', e)
      const msg = e?.message || (typeof e === 'string' ? e : '')
      setGenError(`Generation failed${msg ? ` — ${msg}` : ''}. Make sure each scene's voice was generated in the Voices step.`)
    } finally {
      setBusy(null)
    }
  }

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
      setExportError('Export failed — make sure every module has been generated in Video Editing.')
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>
  const ordered = [...modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  const allReady = ordered.length > 0 && ordered.every(m => !!m.fullVideoUrl)
  const anyMissing = ordered.some(m => !m.fullVideoUrl)

  return (
    <div className="p-6 w-full max-w-3xl mx-auto pa-page-enter space-y-5">
      <StageHeader icon={Film} title="Final Video" subtitle="Generate the finished video for each module, then play and download" />

      {ordered.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Fast preview toggle — voice-only render, seconds per clip, for
              checking layout & timing. The real export keeps full lip-sync. */}
          <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-slate-300">
            <button type="button" role="switch" aria-checked={fastPreview}
              onClick={() => setFastPreview(v => !v)} disabled={!!busy}
              className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${fastPreview ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'} disabled:opacity-50`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${fastPreview ? 'translate-x-4' : ''}`} />
            </button>
            <span><span className="font-medium">Fast preview</span> — voice-only, no lip-sync (seconds vs. ~2 min)</span>
          </label>
          {(fastPreview || anyMissing) && (
            <button onClick={() => generate((fastPreview ? ordered : ordered.filter(m => !m.fullVideoUrl)).map(m => m.id), 'all')}
              disabled={!!busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {fastPreview ? 'Preview all (fast)' : 'Generate all videos'}
            </button>
          )}
        </div>
      )}
      {genStatus && (
        <div className="px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> {genStatus}
        </div>
      )}
      {genError && <p className="text-[11px] text-red-500">{genError}</p>}

      {ordered.length === 0 ? (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400 text-center">
          No modules yet — generate scripts first.
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map((mod, i) => {
            const ready = !!mod.fullVideoUrl
            return (
              <div key={mod.id} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06]">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm font-bold flex-shrink-0">{i + 1}</div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex-1">{mod.title || `Module ${i + 1}`}</p>
                  {ready ? (
                    <a href={mod.fullVideoUrl} download target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex-shrink-0">
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  ) : (
                    <button onClick={() => generate([mod.id], mod.id)} disabled={!!busy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors flex-shrink-0">
                      {busy === mod.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {ready ? (
                    <video controls src={mod.fullVideoUrl} className="w-full rounded-xl bg-black aspect-video" />
                  ) : (
                    <div className="aspect-video rounded-xl border border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
                      {busy === mod.id || busy === 'all' ? (
                        <><Loader2 className="w-7 h-7 opacity-60 animate-spin" /><p className="text-xs">Generating this module's video…</p></>
                      ) : (
                        <><Film className="w-7 h-7 opacity-40" /><p className="text-xs">Not generated yet — press "Generate" to compile this module's video.</p></>
                      )}
                    </div>
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
              {allReady ? 'All modules are ready. Export the finished course package.' : 'Generate every module in Video Editing first.'}
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
    </div>
  )
}
