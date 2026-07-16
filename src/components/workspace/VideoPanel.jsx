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
import { Video, Loader2, CheckCircle, Sparkles, Download, Lock, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'
import SceneTimelineEditor from '@/components/workspace/SceneTimelineEditor'

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

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['modules', project?.id],
    queryFn: () => modulesService.listByProject(project.id),
    enabled: !!project?.id,
  })

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
            const designedCount = modScenes.filter(s => !!s.visualAssetUrl).length
            // Designed = every scene in this module has a generated slide
            // image. Modules that aren't designed yet are locked here —
            // opening one used to show an empty/placeholder timeline that
            // looked like broken output instead of "finish Visual Design
            // first."
            const isDesigned = modSceneCount > 0 && designedCount === modSceneCount
            return (
              <button
                key={mod.id}
                onClick={() => { if (isDesigned) setSelectedModule(mod) }}
                disabled={!isDesigned}
                title={isDesigned ? undefined : 'Generate this module’s slides in Visual Design first'}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  isDesigned
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/[0.08] hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer'
                    : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-white/[0.06] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-slate-900 dark:text-white">{mod.title}</div>
                  {isDesigned ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                      <CheckCircle className="w-3 h-3" /> Designed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {modSceneCount} {modSceneCount === 1 ? 'scene' : 'scenes'}
                  {!isDesigned && modSceneCount > 0 && ` · ${designedCount}/${modSceneCount} slides generated — finish in Visual Design`}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const selectedScene = scenes.find(s => s.id === selectedSceneId) || scenes[0]

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-4 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <StageHeader
              icon={Video}
              title="5. Video Editing"
              subtitle={`${selectedModule.title} — ${scenes.length} scenes`}
              complete={false}
            />
          </div>
          <button
            onClick={() => setSelectedModule(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
          >
            ← Back
          </button>
        </div>

        {/* Avatar Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseAvatar(true)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              useAvatar ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            With Avatar
          </button>
          <button
            onClick={() => setUseAvatar(false)}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              !useAvatar ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            Voice Only
          </button>
        </div>
      </div>

      {/* Main Content: Storyboard + Timeline Editor */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Top: Scene Timeline Editor with Visual Preview + Timeline */}
        <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
          {/* Left: Scene Storyboard Thumbnails */}
          <div className="w-40 flex-shrink-0 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-y-auto flex flex-col">
            <div className="p-2 space-y-2 flex-1 overflow-y-auto">
              {scenes.map((scene, idx) => {
                const isSelected = scene.id === selectedSceneId
                const hasVideo = !!scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:')
                
                return (
                  <button
                    key={scene.id}
                    onClick={() => setSelectedSceneId(scene.id)}
                    className={`w-full p-2 rounded-lg text-left transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/50'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center text-xs text-white font-bold">
                        {idx + 1}
                      </div>
                      {hasVideo && <CheckCircle className="w-3 h-3 text-green-500" />}
                    </div>
                    {/* Real generated slide thumbnail — same image shown in
                        the main preview, so the storyboard matches what was
                        actually designed instead of just a title label. */}
                    {scene.visualAssetUrl ? (
                      <div className="w-full aspect-video rounded overflow-hidden border border-slate-200 dark:border-white/10 mb-1 bg-slate-900">
                        <img src={scene.visualAssetUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-full aspect-video rounded border border-dashed border-slate-300 dark:border-slate-700 mb-1 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-[9px] text-slate-400 dark:text-slate-500">Not designed</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">
                      {scene.slideComposition?.title || 'Scene'}
                    </p>
                  </button>
                )
              })}
            </div>

            {/* Controls at Bottom of Storyboard */}
            <div className="p-2 border-t border-slate-200 dark:border-white/[0.06] space-y-2">
              {selectedScene?.avatarVideoUrl && !selectedScene?.avatarVideoUrl?.startsWith('heygen:') ? (
                // Video is ready — "Download" used to just relabel the same
                // button that actually re-ran generation, so clicking it
                // never gave you a file, just a fresh (wasted) render. Now
                // it's a real download link, with regenerate split out as
                // its own explicit secondary action.
                <div className="flex gap-1.5">
                  <a
                    href={selectedScene.avatarVideoUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />Download
                  </a>
                  <button
                    onClick={() => handleGenerateVideo(selectedScene)}
                    disabled={generating[selectedScene?.id] || polling[selectedScene?.id]}
                    title="Regenerate this scene's video"
                    className="flex-shrink-0 inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {generating[selectedScene?.id] || polling[selectedScene?.id]
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={generating[selectedScene?.id] || polling[selectedScene?.id] || !selectedScene?.ttsAudioUrl}
                  onClick={() => handleGenerateVideo(selectedScene)}
                >
                  {generating[selectedScene?.id] ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Gen…</>
                  ) : polling[selectedScene?.id] ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Poll…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" />Generate</>
                  )}
                </Button>
              )}
              {errors[selectedScene?.id] && (
                <p className="text-[10px] text-red-600 dark:text-red-400 px-1">
                  {errors[selectedScene?.id]}
                </p>
              )}
            </div>
          </div>

          {/* Right: Scene Timeline Editor (Canvas + Timeline for Sync) */}
          <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-white/[0.08] p-4 overflow-y-auto flex flex-col">
            {selectedScene ? (
              <>
                <SceneTimelineEditor
                  scene={selectedScene}
                  onUpdate={() => onUpdate?.()}
                  useAvatar={useAvatar}
                />

                {/* Generated video player — plays the actual rendered
                    output right here once it's ready, so "Download" isn't
                    the only way to see it; the file was already sitting
                    there unwatchable before this. */}
                {selectedScene.avatarVideoUrl && !selectedScene.avatarVideoUrl?.startsWith('heygen:') && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.06]">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Generated Video</div>
                    <video
                      key={selectedScene.avatarVideoUrl}
                      controls
                      className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-black aspect-video"
                      src={selectedScene.avatarVideoUrl}
                    />
                  </div>
                )}

                {/* Scene Info */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/[0.06] text-xs">
                  <div className="text-slate-600 dark:text-slate-400 mb-2 font-medium">Scene Status</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className={selectedScene.ttsAudioUrl ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}>
                      ✓ Voice
                    </div>
                    <div className={selectedScene.visualAssetUrl ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}>
                      ✓ Visual
                    </div>
                    <div className={selectedScene.avatarVideoUrl && !selectedScene.avatarVideoUrl?.startsWith('heygen:') ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}>
                      ✓ Video
                    </div>
                  </div>
                  <div className="mt-2 text-slate-500 dark:text-slate-400">
                    {selectedScene.segments?.length || 0} segments — {(selectedScene.segments?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0).toFixed(1)}s
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No scene selected</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
