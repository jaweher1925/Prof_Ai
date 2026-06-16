/**
 * Stage 5 — Video (last / most expensive)
 * Generates avatar videos per scene.
 * Requires TTS audio to be generated first.
 */
import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Video, Loader2, CheckCircle, Sparkles, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

export default function VideoPanel({ project, onUpdate }) {
  const [generating, setGenerating] = useState({})
  const [polling, setPolling] = useState({})
  const [errors, setErrors] = useState({})

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
        project?.defaultVoiceId
      )
      if (result?.video_id) {
        // Start polling automatically
        handlePoll(scene.id, result.video_id)
      }
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [scene.id]: e.message || 'Video generation failed' }))
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
        <Video className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-400">No scripts yet. Complete previous stages first.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Video className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Video Generation</h2>
        <Badge variant="yellow">Expensive API</Badge>
      </div>
      <p className="text-sm text-slate-500 mb-2">
        Generate avatar videos for each scene.
        Requires voice audio from Stage 3.
      </p>
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-6">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300">
          Each video uses your configured avatar and voice. Make sure your avatar and voice are set in
          Casting Settings before generating. Videos take 1–3 minutes to render.
        </p>
      </div>

      {scripts.map(script => (
        <div key={script.id} className="mb-8">
          <h3 className="text-sm font-medium text-white mb-3">{script.title}</h3>
          <SceneVideoList
            moduleId={script.moduleId}
            generating={generating}
            polling={polling}
            errors={errors}
            onGenerate={handleGenerateVideo}
            onPoll={handlePoll}
          />
        </div>
      ))}
    </div>
  )
}

function SceneVideoList({ moduleId, generating, polling, errors, onGenerate, onPoll }) {
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn: () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!moduleId,
    refetchInterval: 5000,
  })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!scenes.length) return <p className="text-slate-600 text-sm">No scenes.</p>

  return (
    <div className="space-y-4">
      {scenes.map((scene, i) => {
        const isGen = generating[scene.id]
        const isPoll = polling[scene.id] || scene.status === 'rendering'
        const hasVideo = !!scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:')
        const isRendering = scene.status === 'rendering'
        const err = errors[scene.id]
        const heygenVideoId = scene.avatarVideoUrl?.startsWith('heygen:')
          ? scene.avatarVideoUrl.replace('heygen:', '')
          : null

        return (
          <div key={scene.id}
            className="rounded-xl bg-slate-900/40 border border-white/[0.06] overflow-hidden">

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
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-indigo-400">{i + 1}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 truncate">{scene.scriptContent?.slice(0, 80)}…</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs ${scene.ttsAudioUrl ? 'text-green-400' : 'text-slate-600'}`}>
                    {scene.ttsAudioUrl ? '✓ Audio ready' : '✗ No audio'}
                  </span>
                  <span className={`text-xs ${scene.visualAssetUrl ? 'text-green-400' : 'text-slate-600'}`}>
                    {scene.visualAssetUrl ? '✓ Visual ready' : '✗ No visual'}
                  </span>
                </div>
                {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {hasVideo && (
                  <a href={scene.avatarVideoUrl} target="_blank" rel="noopener noreferrer"
                    className="text-slate-500 hover:text-indigo-400 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {hasVideo ? (
                  <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
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
