/**
 * Stage 3 — Voice
 * Converts each scene's script text to audio.
 */
import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Mic2, Play, Square, Loader2, CheckCircle, Sparkles, Edit2, X, ArrowRight, Image, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

export default function VoicePanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()
  const [playingUrl, setPlayingUrl] = useState(null)
  const [audioEl, setAudioEl] = useState(null)
  const [generating, setGenerating] = useState({})
  const [errors, setErrors] = useState({})
  const [voiceSettings, setVoiceSettings] = useState({
    stability: 0.5,
    similarity_boost: 0.8,
    style: 0.3,
    use_speaker_boost: true,
    speed: 1.0,
  })
  const [showSettings, setShowSettings] = useState(false)

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  const handleGenerateTTS = async (sceneId, overrideText) => {
    setGenerating(prev => ({ ...prev, [sceneId]: true }))
    setErrors(prev => ({ ...prev, [sceneId]: null }))
    try {
      await agentsService.runGenerateTTS(sceneId, project?.defaultVoiceId, overrideText, voiceSettings)
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      onUpdate?.()
    } catch (e) {
      setErrors(prev => ({ ...prev, [sceneId]: e.message || 'Audio generation failed' }))
    } finally {
      setGenerating(prev => ({ ...prev, [sceneId]: false }))
    }
  }

  const handlePlay = (url) => {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
    if (playingUrl === url) { setPlayingUrl(null); setAudioEl(null); return }
    const a = new Audio(url)
    a.play().catch(err => console.error('Audio play failed:', err))
    a.onended = () => { setPlayingUrl(null); setAudioEl(null) }
    setPlayingUrl(url)
    setAudioEl(a)
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center">
        <Mic2 className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-400">No scripts yet. Complete the Script stage first.</p>
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
        Generate audio for each scene. Click <strong className="text-slate-300">Edit</strong> to change the text before generating.
        Choose your voice in <strong className="text-slate-300">Casting Settings</strong> (gear icon, top right).
      </p>

      {/* Voice Settings */}
      <div className="mb-4">
        {/* Slider panel */}
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <button onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-white">Voice Settings</span>
              <span className="text-xs text-slate-500">stability · style · speed</span>
            </div>
            {showSettings ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">
              {[
                { key: 'stability', label: 'Stability', desc: 'Low = expressive · High = consistent', min: 0, max: 1, step: 0.05 },
                { key: 'similarity_boost', label: 'Clarity', desc: 'How closely to match the original voice', min: 0, max: 1, step: 0.05 },
                { key: 'style', label: 'Style Exaggeration', desc: 'Amplifies speaking style — use sparingly', min: 0, max: 1, step: 0.05 },
                { key: 'speed', label: 'Speed', desc: '0.7 = slow · 1.0 = normal · 1.3 = fast', min: 0.7, max: 1.3, step: 0.05 },
              ].map(({ key, label, desc, min, max, step }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">{label}</label>
                    <span className="text-xs text-indigo-400 font-mono">{voiceSettings[key]?.toFixed(2)}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={voiceSettings[key]}
                    onChange={e => setVoiceSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-indigo-500 cursor-pointer" />
                  <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
                </div>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={voiceSettings.use_speaker_boost}
                  onChange={e => setVoiceSettings(s => ({ ...s, use_speaker_boost: e.target.checked }))}
                  className="accent-indigo-500 w-4 h-4 rounded" />
                <div>
                  <p className="text-xs font-medium text-slate-300">Speaker Boost</p>
                  <p className="text-[10px] text-slate-600">Enhances similarity to the target voice</p>
                </div>
              </label>
              <button onClick={() => setVoiceSettings({ stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 })}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                Reset to defaults
              </button>
            </div>
          )}
        </div>

      </div>

      {scripts.map((script, vi) => (
        <div key={script.id} className="mb-8">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.06]">
            <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
              <span className="text-xs font-bold text-indigo-400">{vi + 1}</span>
            </div>
            <h3 className="text-sm font-medium text-white">{script.title}</h3>
            <Badge variant={script.status === 'approved' ? 'green' : 'yellow'}>{script.status}</Badge>
          </div>
          <SceneVoiceList
            moduleId={script.moduleId}
            generating={generating}
            errors={errors}
            playingUrl={playingUrl}
            onGenerate={handleGenerateTTS}
            onPlay={handlePlay}
          />
        </div>
      ))}

      <div className="mt-4 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Ready to design your slides?</p>
          <button
            onClick={() => onContinue?.('visual-designer')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Image className="w-4 h-4" />
            Continue to Visual Designer
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SceneVoiceList({ moduleId, generating, errors, playingUrl, onGenerate, onPlay }) {
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

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
  if (!scenes.length) return <p className="text-slate-600 text-sm py-2">No scenes found.</p>

  return (
    <div className="space-y-2">
      {scenes.map((scene, i) => {
        const isGen = generating[scene.id] || scene.status === 'assets_generating'
        const hasAudio = !!scene.ttsAudioUrl
        const err = errors[scene.id]
        const isEditing = editingId === scene.id

        return (
          <div key={scene.id} className="rounded-xl bg-slate-900/40 border border-white/[0.06] p-3">
            <div className="flex items-start gap-3">
              <span className="text-xs text-indigo-400 font-bold w-5 flex-shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="w-full bg-slate-800/80 border border-indigo-500/40 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500 mb-2"
                    rows={5}
                    autoFocus
                  />
                ) : (
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    {scene.scriptContent?.slice(0, 150)}{scene.scriptContent?.length > 150 ? '...' : ''}
                  </p>
                    )}
                {err && <p className="text-xs text-red-400">{err}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2 ml-8">
              {!isEditing ? (
                <button
                  onClick={() => { setEditingId(scene.id); setEditText(scene.scriptContent || '') }}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                >
                  <Edit2 className="w-3 h-3" /> Edit text
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { onGenerate(scene.id, editText); setEditingId(null) }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3 h-3" /> Generate with this text
                  </button>
                  <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg transition-colors">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </>
              )}

              <div className="flex-1" />

              {hasAudio && !isEditing && (
                <button
                  onClick={() => onPlay(scene.ttsAudioUrl)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${playingUrl === scene.ttsAudioUrl ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-indigo-600'}`}
                  title={playingUrl === scene.ttsAudioUrl ? 'Stop' : 'Play audio'}
                >
                  {playingUrl === scene.ttsAudioUrl
                    ? <Square className="w-3 h-3 text-white" />
                    : <Play className="w-3 h-3 text-white ml-0.5" />}
                </button>
              )}

              {!isEditing && (
                hasAudio
                  ? <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                  : <Button size="sm" variant="secondary" disabled={isGen} onClick={() => onGenerate(scene.id)}>
                      {isGen ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                    </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
