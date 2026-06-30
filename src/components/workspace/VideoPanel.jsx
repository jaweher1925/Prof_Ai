/**
 * Stage 5 — Video (last / most expensive)
 * Generates avatar videos per scene, then merges each module's scene
 * videos into one full module video.
 * Requires TTS audio to be generated first.
 */
import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { scenesService } from '@/services/scenes'
import { modulesService } from '@/services/modules'
import { agentsService } from '@/services/agents'
import { Video, Loader2, CheckCircle, Sparkles, ExternalLink, RefreshCw, User, UserX, Film, Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

// Always coerce a caught error into a plain string — never let an object
// (e.g. HeyGen's {code, message} payload) reach a render path.
function errorToString(e) {
  if (!e) return 'Video generation failed'
  if (typeof e === 'string') return e
  if (typeof e.message === 'string') return e.message
  if (e.message && typeof e.message === 'object') return e.message.message || JSON.stringify(e.message)
  try { return JSON.stringify(e) } catch { return 'Video generation failed' }
}

export default function VideoPanel({ project, onUpdate }) {
  const [generating, setGenerating] = useState({})
  const [polling, setPolling] = useState({})
  const [errors, setErrors] = useState({})
  const [useAvatar, setUseAvatar] = useState(true)

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const handleGenerateVideo = async (scene) => {
    if (!scene.ttsAudioUrl) {
      setErrors(prev => ({ ...prev, [scene.id]: 'Generate voice audio first (Stage 3)' }))
      return
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
        // Start polling automatically (avatar mode only — voice-only mode finishes immediately)
        handlePoll(scene.id, result.video_id)
      }
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [scene.id]: errorToString(e) }))
    } finally {
      setGenerating(prev => ({ ...prev, [scene.id]: false }))
    }
  }

  const handlePoll = async (sceneId, videoId) => {
    setPolling(prev => ({ ...prev, [sceneId]: true }))
    try {
      const result = await agentsService.pollHeyGen(videoId, sceneId)
      if (!result?.completed) {
        // Poll again in 5 seconds
        setTimeout(() => handlePoll(sceneId, videoId), 5000)
      } else {
        onUpdate?.()
        setPolling(prev => ({ ...prev, [sceneId]: false }))
      }
    } catch (e) {
      setPolling(prev => ({ ...prev, [sceneId]: false }))
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <Video className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-slate-500 dark:text-slate-400">No scripts yet. Complete previous stages first.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <Video className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
        <h2 className="text-lg font-medium text-slate-900 dark:text-white tracking-wide">Video Generation</h2>
        <Badge variant="yellow">Expensive API</Badge>
      </div>

      {/* Avatar on/off toggle */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] mb-6">
        <button
          onClick={() => setUseAvatar(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            useAvatar ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <User className="w-3.5 h-3.5" /> With avatar presenter
        </button>
        <button
          onClick={() => setUseAvatar(false)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            !useAvatar ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <UserX className="w-3.5 h-3.5" /> Voice only (no avatar)
        </button>
      </div>

      {scripts.map(script => (
        <ModuleVideoCard
          key={script.id}
          title={script.title}
          moduleId={script.moduleId}
          generating={generating}
          polling={polling}
          errors={errors}
          onGenerate={handleGenerateVideo}
          onPoll={handlePoll}
        />
      ))}
    </div>
  )
}

function ModuleVideoCard({ title, moduleId, generating, polling, errors, onGenerate, onPoll }) {
  const queryClient = useQueryClient()
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState(null)

  // Was raw fetch('/api/...') here instead of the apiClient-backed service
  // layer used everywhere else — that bypassed apiClient's response
  // interceptor (204 handling, non-JSON/HTML-fallback guard, 401/403
  // redirect), so a transient backend hiccup during the 5s poll could throw
  // an unhandled promise rejection on every refetch instead of surfacing a
  // normal query error. Using the service layer keeps this consistent with
  // the rest of the app and is the safer fix for "can't click anything" here.
  const { data: scenes = [], isLoading: scenesLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn: () => moduleId ? scenesService.listByModule(moduleId) : Promise.resolve([]),
    enabled: !!moduleId,
    refetchInterval: 5000,
  })

  const { data: moduleData } = useQuery({
    queryKey: ['module', moduleId],
    queryFn: () => modulesService.get(moduleId),
    enabled: !!moduleId,
  })

  const sceneHasVideo = (scene) => !!scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:')
  const allScenesReady = scenes.length > 0 && scenes.every(sceneHasVideo)
  const fullVideoUrl = moduleData?.fullVideoUrl

  const handleMerge = async () => {
    setMerging(true)
    setMergeError(null)
    try {
      await agentsService.runMergeModuleVideo(moduleId)
      queryClient.invalidateQueries({ queryKey: ['module', moduleId] })
    } catch (e) {
      setMergeError(errorToString(e))
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-950/40 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-900/40">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">{title}</h3>
        <Button
          size="sm"
          variant={fullVideoUrl ? 'secondary' : 'primary'}
          disabled={!allScenesReady || merging}
          onClick={handleMerge}
        >
          {merging
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Merging…</>
            : fullVideoUrl
              ? <><RefreshCw className="w-3.5 h-3.5" />Regenerate full video</>
              : <><Film className="w-3.5 h-3.5" />Generate full module video</>}
        </Button>
      </div>

      {mergeError && <p className="text-xs text-red-500 dark:text-red-400 px-4 pt-2">{mergeError}</p>}
      {!allScenesReady && (
        <p className="text-xs text-slate-500 px-4 pt-2">
          Generate every scene's video below, then merge them into one full module video.
        </p>
      )}

      {fullVideoUrl && (
        <div className="px-4 pt-3">
          <video src={fullVideoUrl} controls className="w-full rounded-lg bg-black" style={{ maxHeight: 280 }} />
          <a
            href={fullVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 mt-2"
          >
            <Download className="w-3.5 h-3.5" /> Download full module video
          </a>
        </div>
      )}

      <div className="p-4">
        {scenesLoading ? (
          <div className="flex justify-center py-4"><Spinner size="sm" /></div>
        ) : !scenes.length ? (
          <p className="text-slate-400 dark:text-slate-600 text-sm">No scenes.</p>
        ) : (
          <SceneVideoList
            scenes={scenes}
            generating={generating}
            polling={polling}
            errors={errors}
            onGenerate={onGenerate}
            onPoll={onPoll}
          />
        )}
      </div>
    </div>
  )
}

function SceneVideoList({ scenes, generating, polling, errors, onGenerate, onPoll }) {
  return (
    <div className="space-y-4">
      {scenes.map((scene, i) => {
        const isGen = generating[scene.id]
        const isPoll = polling[scene.id] || scene.status === 'rendering'
        const hasVideo = !!scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:')
        const isRendering = scene.status === 'rendering'
        const rawErr = errors[scene.id]
        // Defense in depth: even if something upstream slips an object through,
        // never hand it to JSX directly.
        const err = rawErr && typeof rawErr === 'object' ? (rawErr.message || JSON.stringify(rawErr)) : rawErr
        const heygenVideoId = scene.avatarVideoUrl?.startsWith('heygen:')
          ? scene.avatarVideoUrl.replace('heygen:', '')
          : null

        return (
          <div key={scene.id}
            className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] overflow-hidden">

            {/* Video preview */}
            {hasVideo && (
              <video
                src={scene.avatarVideoUrl}
                controls
                className="w-full rounded-t-xl bg-black"
                style={{ maxHeight: 200 }}
              />
            )}

            <div className="flex items-center gap-4 p-4">
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">{i + 1}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{scene.scriptContent?.slice(0, 80)}…</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs ${scene.ttsAudioUrl ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`}>
                    {scene.ttsAudioUrl ? '✓ Audio ready' : '✗ No audio'}
                  </span>
                  <span className={`text-xs ${scene.visualAssetUrl ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`}>
                    {scene.visualAssetUrl ? '✓ Visual ready' : '✗ No visual'}
                  </span>
                </div>
                {err && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{String(err)}</p>}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {hasVideo && (
                  <a href={scene.avatarVideoUrl} target="_blank" rel="noopener noreferrer"
                    className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {hasVideo ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isGen}
                      onClick={() => onGenerate(scene)}
                      title="Regenerate this scene's video"
                    >
                      {isGen
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                ) : isRendering || isPoll ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="yellow">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />Rendering…
                    </Badge>
                    {heygenVideoId && (
                      <Button size="sm" variant="ghost" onClick={() => onPoll(scene.id, heygenVideoId)}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={isGen || !scene.ttsAudioUrl}
                    onClick={() => onGenerate(scene)}
                  >
                    {isGen
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Starting…</>
                      : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
