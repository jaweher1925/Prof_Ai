/**
 * Stage 5 — Video Editing (Module-Level Editor with Unified Timeline)
 * 
 * Enhanced unified design:
 * - Left: Scene storyboard with drag-reorder, numbered, + generation indicators
 * - Center: Full canvas preview with timeline sync (avatar holder maintained)
 * - Bottom: Pro Remotion timeline showing ALL scenes in module as merged
 * - Video generation integrated per-scene with avatar support
 * - Avatar placeholder visible and adjustable across entire timeline
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { scenesService } from '@/services/scenes'
import { modulesService } from '@/services/modules'
import { agentsService } from '@/services/agents'
import { mediaService } from '@/services/media'
import { Video, Loader2, CheckCircle, Sparkles, Download, Lock, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'
import SceneTimelineEditor from '@/components/workspace/SceneTimelineEditor'
import { SlidePlaybackPreview } from '@/components/workspace/VisualDesignerPanel'

function errorToString(e) {
  if (!e) return 'Video generation failed'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  if (e.message && typeof e.message === 'object') return e.message.message || JSON.stringify(e.message)
  try { return JSON.stringify(e) } catch { return 'Video generation failed' }
}

export default function VideoPanel({ project, onUpdate }) {
  const [selectedModule, setSelectedModule] = useState(null)
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [generating, setGenerating] = useState({})
  const [polling, setPolling] = useState({})
  const [errors, setErrors] = useState({})
  const [useAvatar, setUseAvatar] = useState(true)
  // Video Editing = one preview (above) + the remotion timeline/timing. Shown
  // by default; collapsible to reduce scroll when you just want to watch.
  const [showTimeline, setShowTimeline] = useState(true)
  // True while the timeline is playing back — we hide the static center preview
  // then, so the ONLY preview on screen is the timeline's reveal simulation
  // (which actually reflects your edited element timing).
  const [timelinePlaying, setTimelinePlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  // Composition + element timing lifted up from the timeline editor so the ONE
  // top preview can render the play/reveal itself (no second preview appears).
  const [timelineData, setTimelineData] = useState({ composition: null, elements: [] })
  const [approving, setApproving] = useState(false)

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

  // Presenter avatar photo, so the preview shows the real avatar instead of an
  // empty placeholder box ("i can't see the avatar"). Cached + seeded from
  // localStorage so it paints instantly, same as Visual Design.
  const { data: avatarsRes } = useQuery({
    queryKey: ['heygen-avatars'],
    queryFn: () => mediaService.listAvatars(),
    enabled: !!project?.defaultAvatarId,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: () => mediaService.cachedAvatars(),
    initialDataUpdatedAt: 0,
  })
  const avatarImageUrl = avatarsRes?.avatars?.find(a => a.avatar_id === project?.defaultAvatarId)?.preview_image_url || null

  // Fetch ALL scenes from ALL modules (for module selector counting)
  const { data: allScenes = [], isLoading: allScenesLoading } = useQuery({
    queryKey: ['allScenes', project?.id],
    queryFn: async () => {
      if (!project?.id || !modules.length) return []
      const allResults = []
      for (const mod of modules) {
        try {
          const modScenes = await scenesService.listByModule(mod.id)
          allResults.push(...modScenes)
        } catch (err) {
          console.error(`Failed to fetch scenes for module ${mod.id}:`, err)
        }
      }
      return allResults
    },
    enabled: !!project?.id && modules.length > 0,
    staleTime: 0,
    refetchOnMount: 'stale',
  })

  // Fetch scenes for SELECTED module
  const { data: scenes = [], isLoading: scenesLoading } = useQuery({
    queryKey: ['scenes', selectedModule?.id],
    queryFn: () => selectedModule?.id ? scenesService.listByModule(selectedModule.id) : Promise.resolve([]),
    enabled: !!selectedModule?.id,
    refetchOnMount: 'stale',
    staleTime: 0,
    refetchInterval: 5000,
  })

  const isLoading = modulesLoading || allScenesLoading || scenesLoading

  // Initialize scene order from current scene order
  useEffect(() => {
    if (scenes.length > 0) {
      if (!selectedSceneId && scenes.length > 0) {
        setSelectedSceneId(scenes[0].id)
      }
    }
  }, [scenes, selectedSceneId])

  const handleGenerateVideo = async (scene) => {
    if (scene.segments && scene.segments.length > 0) {
      const missingSegments = scene.segments.filter(s => !s.ttsAudioUrl)
      if (missingSegments.length > 0) {
        setErrors(prev => ({
          ...prev,
          [scene.id]: `${missingSegments.length} segments missing audio`
        }))
        return
      }
    } else {
      if (!scene.ttsAudioUrl) {
        setErrors(prev => ({ ...prev, [scene.id]: 'Generate voice audio first' }))
        return
      }
    }
    
    setGenerating(prev => ({ ...prev, [scene.id]: true }))
    setErrors(prev => ({ ...prev, [scene.id]: null }))
    try {
      const result = await agentsService.runHeyGenAvatar(
        scene.id,
        project?.defaultAvatarId,
        project?.defaultVoiceId,
        useAvatar
      )
      if (result?.video_id) {
        handlePoll(scene.id, result.video_id, 0)
      }
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [scene.id]: errorToString(e) }))
    } finally {
      setGenerating(prev => ({ ...prev, [scene.id]: false }))
    }
  }

  const handlePoll = async (sceneId, videoId, attemptNumber = 0) => {
    const MAX_POLL_ATTEMPTS = 180
    if (attemptNumber > MAX_POLL_ATTEMPTS) {
      setPolling(prev => ({ ...prev, [sceneId]: false }))
      setErrors(prev => ({
        ...prev,
        [sceneId]: 'Video generation timed out'
      }))
      return
    }
    
    setPolling(prev => ({ ...prev, [sceneId]: true }))
    try {
      const result = await agentsService.pollHeyGen(videoId, sceneId)
      if (!result?.completed) {
        setTimeout(() => handlePoll(sceneId, videoId, attemptNumber + 1), 5000)
      } else {
        onUpdate?.()
        setPolling(prev => ({ ...prev, [sceneId]: false }))
      }
    } catch (e) {
      setPolling(prev => ({ ...prev, [sceneId]: false }))
      setErrors(prev => ({ ...prev, [sceneId]: errorToString(e) }))
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (!modules.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <Video className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-slate-500 dark:text-slate-400">No modules yet. Complete previous stages first.</p>
      </div>
    )
  }

  if (!selectedModule) {
    return (
      <div className="p-6 max-w-4xl">
        <StageHeader
          icon={Video}
          title="5. Video Editing"
          subtitle="Edit entire module with timeline and video generation"
          complete={false}
        />
        
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Select a module to edit:</p>
          {modules.map((mod) => {
            const modScenes = allScenes.filter(s => s.moduleId === mod.id)
            const modSceneCount = modScenes.length
            // A scene counts as "ready" for Video Editing if it's been designed
            // (has a slide image) OR already has a generated video. Generating a
            // scene sets avatarVideoUrl, not necessarily visualAssetUrl, so
            // checking only the design left a just-generated scene looking
            // "not ready" and could keep the whole module locked — the exact
            // "I generated a scene but Video Editing is still locked" symptom.
            const isReady = (s) =>
              !!s.visualAssetUrl ||
              (!!s.avatarVideoUrl && !s.avatarVideoUrl.startsWith('heygen:'))
            const designedCount = modScenes.filter(isReady).length
            // Openable as soon as AT LEAST ONE scene is ready, so the user can
            // work through a module scene-by-scene instead of waiting for every
            // scene to be finished first. A module with zero ready scenes stays
            // locked (nothing to edit yet).
            const isFullyDesigned = modSceneCount > 0 && designedCount === modSceneCount
            const isOpenable = designedCount > 0
            return (
              <button
                key={mod.id}
                onClick={() => { if (isOpenable) setSelectedModule(mod) }}
                disabled={!isOpenable}
                title={isOpenable ? undefined : 'Design at least one scene in Visual Design first'}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  isOpenable
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer'
                    : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-white/[0.06] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900 dark:text-white">{mod.title}</div>
                  {isFullyDesigned ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> Designed
                    </span>
                  ) : isOpenable ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> {designedCount}/{modSceneCount} ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {modSceneCount} {modSceneCount === 1 ? 'scene' : 'scenes'}
                  {isOpenable && !isFullyDesigned && ` · ${designedCount}/${modSceneCount} designed — open to work scene by scene`}
                  {!isOpenable && modSceneCount > 0 && ' · design a scene in Visual Design first'}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const selectedScene = scenes.find(s => s.id === selectedSceneId) || scenes[0]
  const selApproved = !!selectedScene?.approvedAt

  // Approve / lock the whole scene's video edit (timing + design). Toggling
  // again reopens it. Scene-level here since Video Editing works on the
  // assembled scene, not its individual parts.
  const handleApproveScene = async () => {
    if (!selectedScene?.id || approving) return
    setApproving(true)
    try {
      if (selApproved) {
        await scenesService.update(selectedScene.id, { approved_at: null })
      } else {
        await scenesService.approve(selectedScene.id)
      }
      onUpdate?.()
    } catch (e) {
      console.error('Approve scene failed', e)
    } finally {
      setApproving(false)
    }
  }

  const scHasVideo = (s) => !!s?.avatarVideoUrl && !s.avatarVideoUrl.startsWith('heygen:')
  const selBusy = generating[selectedScene?.id] || polling[selectedScene?.id]
  const selHasVideo = scHasVideo(selectedScene)
  // Avatar placement MUST come from the same place Visual Design saves it —
  // the primary segment's slideDesign (avatarX/Y/Width) — not slideComposition,
  // which is a separate seed and doesn't reflect the user's drag. Defaults
  // match Visual Design's DEFAULT_AVATAR so an un-positioned scene lines up too.
  // The primary part's FULL design JSON — used to render the play preview with
  // Visual Design's own renderer so it looks identical to the real design.
  const selDesign = (() => {
    try { return JSON.parse(selectedScene?.segments?.[0]?.slideDesign || '{}') } catch { return {} }
  })()
  const avX = selDesign.avatarX ?? 84, avY = selDesign.avatarY ?? 68, avW = selDesign.avatarWidth ?? 19
  // How many content points should be visible at the current playback time —
  // drives the point-by-point reveal on the real design during Play.
  const revealCount = timelinePlaying
    ? (timelineData.elements || []).filter(e => e.type === 'content' && (e.startTime ?? 0) <= playbackTime).length
    : null

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header — mirrors Visual Design's stage header for a consistent feel */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSelectedModule(null)}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title="Back to modules">←</button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> Video Editing
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{selectedModule.title} · {scenes.length} scenes</p>
          </div>
        </div>
        {/* Avatar / Voice-only toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button onClick={() => setUseAvatar(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${useAvatar ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
            With Avatar
          </button>
          <button onClick={() => setUseAvatar(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!useAvatar ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
            Voice Only
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Left: scene rail (same layout as Visual Design's scene menu) ── */}
        <div className="w-60 flex-shrink-0 border-r border-slate-200 dark:border-gray-700 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          {scenes.map((scene, idx) => {
            const isSel = scene.id === selectedSceneId
            const generated = scHasVideo(scene)
            const busy = generating[scene.id] || polling[scene.id] || scene.avatarVideoUrl?.startsWith('heygen:')
            return (
              <button key={scene.id} onClick={() => setSelectedSceneId(scene.id)}
                className={`group w-full text-left border-b border-slate-100 dark:border-gray-800 transition-all ${
                  isSel ? 'bg-indigo-500/15 border-l-2 border-l-indigo-500' : 'hover:bg-slate-100 dark:hover:bg-white/[0.02]'
                }`}>
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <span className="w-4 flex-shrink-0 text-center text-[10px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">{idx + 1}</span>
                  <div className="w-14 flex-shrink-0 aspect-video rounded-md overflow-hidden border border-black/5 dark:border-white/10 bg-slate-900">
                    {scene.visualAssetUrl
                      ? <img src={scene.visualAssetUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500">—</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{scene.slideComposition?.title || 'Scene'}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {generated ? '✓ Generated' : busy ? 'Generating…' : scene.visualAssetUrl ? 'Designed' : 'Draft'}
                    </p>
                  </div>
                  {busy && <Loader2 className="w-3 h-3 text-indigo-500 dark:text-indigo-400 animate-spin flex-shrink-0" />}
                  {generated && !busy && <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Center: preview + actions + timeline ── */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-slate-100 dark:bg-slate-950">
          {selectedScene ? (
            <div className="max-w-4xl mx-auto w-full p-4 space-y-3">

              {/* Big scene preview — real video (avatar baked in) if generated,
                  otherwise the designed slide with the presenter overlaid so
                  the avatar is always visible. */}
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-200 dark:border-white/10 shadow-sm">
                {timelinePlaying ? (
                  // Play happens RIGHT HERE, on the SAME design — rendered with
                  // Visual Design's OWN renderer (SlidePlaybackPreview), so it
                  // looks identical to the first preview / Visual Design. Each
                  // content point appears at the timing you set. Avatar stays put.
                  <SlidePlaybackPreview
                    design={selDesign}
                    revealCount={revealCount}
                    avatarImageUrl={avatarImageUrl}
                    useAvatar={useAvatar}
                  />
                ) : selHasVideo ? (
                  <video key={selectedScene.avatarVideoUrl} controls className="w-full h-full object-contain bg-black" src={selectedScene.avatarVideoUrl} />
                ) : selectedScene.visualAssetUrl ? (
                  <>
                    <img src={selectedScene.visualAssetUrl} alt="Scene" className="w-full h-full object-contain" />
                    {useAvatar && avatarImageUrl && (
                      <div className="absolute rounded-lg overflow-hidden border border-white/30 shadow-lg"
                        style={{
                          left: `${avX}%`, top: `${avY}%`,
                          width: `${avW}%`, aspectRatio: '9/16',
                          transform: 'translate(-50%, -50%)', background: '#0f172a',
                        }}>
                        <img src={avatarImageUrl} alt="Presenter" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Video className="w-8 h-8 opacity-40" />
                    <p className="text-xs">Design this scene in Visual Design first</p>
                  </div>
                )}
                {busyOverlay(selBusy)}
              </div>

              {/* Action toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {selHasVideo ? (
                  <>
                    <a href={selectedScene.avatarVideoUrl} download target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <button onClick={() => handleGenerateVideo(selectedScene)} disabled={selBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 transition-colors">
                      {selBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Regenerate
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleGenerateVideo(selectedScene)}
                    disabled={selBusy || !selectedScene.ttsAudioUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
                    {generating[selectedScene.id] ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                      : polling[selectedScene.id] ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Rendering…</>
                      : <><Sparkles className="w-3.5 h-3.5" />Generate video</>}
                  </button>
                )}
                {!selectedScene.ttsAudioUrl && !selHasVideo && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Generate this scene's voice first.</span>
                )}
                <div className="flex-1" />
                {/* Approve — lock this scene's video edit once the timing looks
                    right. Green when approved; click again to reopen. */}
                <button onClick={handleApproveScene} disabled={approving}
                  title={selApproved ? 'Approved — locked. Click to reopen.' : 'Approve this scene\'s video edit'}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                    selApproved
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}>
                  {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {selApproved ? 'Approved' : 'Approve'}
                </button>
                <button onClick={() => setShowTimeline(t => !t)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                  {showTimeline ? 'Hide timeline' : 'Show timeline'}
                </button>
              </div>

              {errors[selectedScene.id] && (
                <p className="text-[11px] text-red-600 dark:text-red-400">{errors[selectedScene.id]}</p>
              )}

              {/* Status chips */}
              <div className="flex items-center gap-2 text-[11px]">
                {[['Voice', !!selectedScene.ttsAudioUrl], ['Design', !!selectedScene.visualAssetUrl], ['Video', selHasVideo]].map(([label, on]) => (
                  <span key={label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${on ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-400 dark:text-slate-500'}`}>
                    {on ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}{label}
                  </span>
                ))}
                <span className="text-slate-400 dark:text-slate-600 ml-1">
                  {selectedScene.segments?.length || 0} parts · {(selectedScene.segments?.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) || 0).toFixed(1)}s
                </span>
              </div>

              {/* Timeline / timing (the "remotion" strip) — collapsible so it
                  doesn't force a lot of scrolling when you just want to watch. */}
              {showTimeline && (
                <div className="mt-1 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08]">
                  {/* hidePreview → only the remotion timeline + timing here, so
                      the preview above is the single presentation. */}
                  <SceneTimelineEditor scene={selectedScene} onUpdate={() => onUpdate?.()} useAvatar={useAvatar} avatarImageUrl={avatarImageUrl} hidePreview
                    onPlayingChange={setTimelinePlaying} onTick={setPlaybackTime} onTimelineReady={setTimelineData} />
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Select a scene from the left.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Small dark "working" overlay shown on the preview while a render is in flight.
function busyOverlay(busy) {
  if (!busy) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs">
        <Loader2 className="w-4 h-4 animate-spin" /> Rendering…
      </div>
    </div>
  )
}
