/**
 * Stage 3 — Voice
 * Converts each scene's script text to audio using ElevenLabs TTS.
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Mic2, Play, Square, Loader2, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { scenesService } from '@/services/scenes'

export default function VoicePanel({ project, onUpdate }) {
  const queryClient = useQueryClient()
  const [playingUrl, setPlayingUrl] = useState(null)
  const [audioEl, setAudioEl] = useState(null)
  const [generating, setGenerating] = useState({})
  const [errors, setErrors] = useState({})

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const handleGenerateTTS = async (sceneId) => {
    setGenerating(prev => ({ ...prev, [sceneId]: true }))
    setErrors(prev => ({ ...prev, [sceneId]: null }))
    try {
      await agentsService.runGenerateTTS(sceneId, project?.defaultVoiceId)
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [sceneId]: e.message || 'TTS generation failed' }))
    } finally {
      setGenerating(prev => ({ ...prev, [sceneId]: false }))
    }
  }

  const handlePlay = (url) => {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
    if (playingUrl === url) { setPlayingUrl(null); setAudioEl(null); return }
    const a = new Audio(url)
    a.play()
    a.onended = () => { setPlayingUrl(null); setAudioEl(null) }
    setPlayingUrl(url)
    setAudioEl(a)
  }

  const handleGenerateAll = async () => {
    for (const script of scripts) {
      const sections = (() => { try { return JSON.parse(script.sections || '[]') } catch { return [] } })()
      // We need to get scenes for each module
    }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <Mic2 className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-400">No scripts yet. Go to the Script stage first.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Mic2 className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-medium text-white tracking-wide">Voice Generation</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Convert each scene's script to audio using ElevenLabs.
        Set your preferred voice in Casting Settings first.
      </p>

      {scripts.map(script => {
        const sections = (() => { try { return JSON.parse(script.sections || '[]') } catch { return [] } })()
        return (
          <div key={script.id} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium text-white">{script.title}</h3>
              <Badge variant={script.status === 'approved' ? 'green' : 'yellow'}>
                {script.status}
              </Badge>
            </div>

            <SceneVoiceList
              projectId={project.id}
              moduleId={script.moduleId}
              generating={generating}
              errors={errors}
              playingUrl={playingUrl}
              onGenerate={handleGenerateTTS}
              onPlay={handlePlay}
            />
          </div>
        )
      })}
    </div>
  )
}

function SceneVoiceList({ projectId, moduleId, generating, errors, playingUrl, onGenerate, onPlay }) {
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn: () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!moduleId,
    refetchInterval: (data) =>
      Array.isArray(data) && data.some(s => s.status === 'assets_generating') ? 3000 : false,
  })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!scenes.length) return <p className="text-slate-600 text-sm">No scenes in this module.</p>

  return (
    <div className="space-y-3">
      {scenes.map((scene, i) => {
        const isGenerating = generating[scene.id] || scene.status === 'assets_generating'
        const hasAudio = !!scene.ttsAudioUrl
        const err = errors[scene.id]

        return (
          <div key={scene.id}
            className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-900/40 border border-white/[0.06]">
            <span className="text-xs text-indigo-400 font-bold w-5 flex-shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate">{scene.scriptContent?.slice(0, 80)}…</p>
              {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {hasAudio && (
                <button
                  onClick={() => onPlay(scene.ttsAudioUrl)}
                  className="w-8 h-8 rounded-full bg-slate-700 hover:bg-indigo-600 flex items-center justify-center transition-colors"
                >
                  {playingUrl === scene.ttsAudioUrl
                    ? <Square className="w-3 h-3 text-white" />
                    : <Play className="w-3 h-3 text-white" />}
                </button>
              )}

              {hasAudio
                ? <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                : <Button
                    size="sm"
                    variant="secondary"
                    disabled={isGenerating}
                    onClick={() => onGenerate(scene.id)}
                  >
                    {isGenerating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                      : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                  </Button>
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}
