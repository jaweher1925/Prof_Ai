/**
 * Stage 3 — Voice
 * Converts each scene's script text to audio.
 */
import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Mic2, Play, Square, Loader2, CheckCircle, Sparkles, Edit2, X, ArrowRight, Image, SlidersHorizontal, ChevronDown, ChevronUp, Volume2, RotateCcw } from 'lucide-react'
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
  const [showSettings,   setShowSettings]   = useState(false)
  const [previewing,     setPreviewing]     = useState(false)
  const [previewError,   setPreviewError]   = useState(null)
  const [previewAudioEl, setPreviewAudioEl] = useState(null)
  const [generateAllTrigger, setGenerateAllTrigger] = useState(0)
  const [generatingAll,      setGeneratingAll]      = useState(false)

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn: () => scriptsService.listByProject(project.id),
    enabled: !!project?.id,
  })

  // ── Live preview: calls /api/previewTTS, plays the binary audio immediately ──
  const handlePreview = async () => {
    if (previewAudioEl) { previewAudioEl.pause(); setPreviewAudioEl(null) }
    setPreviewing(true); setPreviewError(null)
    try {
      const res = await fetch('/api/previewTTS', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:     project?.id,
          voice_settings: voiceSettings,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        setPreviewError(err.error || 'Preview failed')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const el   = new Audio(url)
      el.play().catch(e => setPreviewError('Could not play audio: ' + e.message))
      el.onended = () => { URL.revokeObjectURL(url); setPreviewAudioEl(null) }
      setPreviewAudioEl(el)
    } catch (e) {
      setPreviewError(e.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

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
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Mic2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-medium text-white tracking-wide">Voice Generation</h2>
        </div>
        {/* ── Generate All button ── */}
        <button
          onClick={() => { setGeneratingAll(true); setGenerateAllTrigger(t => t + 1) }}
          disabled={generatingAll}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
            generatingAll
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {generatingAll
            ? <><Loader2 className="w-4 h-4 animate-spin" />Generating all…</>
            : <><Sparkles className="w-4 h-4" />Generate All</>}
        </button>
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

              {/* Sliders — each shows left/right endpoint labels */}
              {[
                { key:'stability',        label:'Stability',           min:0,   max:1,   step:0.05, left:'More expressive',  right:'More consistent' },
                { key:'similarity_boost', label:'Clarity',             min:0,   max:1,   step:0.05, left:'More creative',    right:'Closer to original' },
                { key:'style',            label:'Style Exaggeration',  min:0,   max:1,   step:0.05, left:'Neutral',          right:'Exaggerated' },
                { key:'speed',            label:'Speed',               min:0.7, max:1.3, step:0.05, left:'0.7× slower',      right:'1.3× faster' },
              ].map(({ key, label, min, max, step, left, right }) => (
                <div key={key} className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-200">{label}</label>
                    <span className="text-xs font-mono text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md">
                      {voiceSettings[key]?.toFixed(2)}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={voiceSettings[key]}
                    onChange={e => setVoiceSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-indigo-500 cursor-pointer" />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-600">{left}</span>
                    <span className="text-[10px] text-slate-600">{right}</span>
                  </div>
                </div>
              ))}

              {/* Speaker Boost */}
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={voiceSettings.use_speaker_boost}
                  onChange={e => setVoiceSettings(s => ({ ...s, use_speaker_boost: e.target.checked }))}
                  className="accent-indigo-500 w-4 h-4 rounded flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Speaker Boost</p>
                  <p className="text-[10px] text-slate-600">Enhances voice similarity — recommended on</p>
                </div>
              </label>

              {/* Test Voice + Reset */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
                <button
                  onClick={handlePreview}
                  disabled={previewing}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    previewing
                      ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {previewing
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                    : previewAudioEl
                    ? <><Square className="w-4 h-4" />Playing…</>
                    : <><Volume2 className="w-4 h-4" />Test Voice</>}
                </button>
                <button
                  onClick={() => setVoiceSettings({ stability:0.5, similarity_boost:0.8, style:0.3, use_speaker_boost:true, speed:1.0 })}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset defaults
                </button>
              </div>

              {/* Helper / error */}
              {previewError
                ? <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{previewError}</p>
                : <p className="text-[10px] text-slate-600">
                    Adjust a slider then click <strong className="text-slate-400">Test Voice</strong> — plays a short sample instantly, no scenes modified.
                  </p>
              }
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
            <h3 className="text-sm font-medium text-white flex-1">{script.title}</h3>
            <Badge variant={script.status === 'approved' ? 'green' : 'yellow'}>{script.status}</Badge>
          </div>
          <SceneVoiceList
            moduleId={script.moduleId}
            generating={generating}
            errors={errors}
            playingUrl={playingUrl}
            onGenerate={handleGenerateTTS}
            onPlay={handlePlay}
            generateAllTrigger={generateAllTrigger}
            onModuleDone={() => {
              // When last module finishes, clear generatingAll
              if (vi === scripts.length - 1) setGeneratingAll(false)
            }}
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

function SceneVoiceList({ moduleId, generating, errors, playingUrl, onGenerate, onPlay, generateAllTrigger, onModuleDone }) {
  const [editingId,      setEditingId]      = useState(null)
  const [editText,       setEditText]       = useState('')
  const [moduleGenAll,   setModuleGenAll]   = useState(false)

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn: () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!moduleId,
    refetchInterval: (data) =>
      Array.isArray(data) && data.some(s => s.status === 'assets_generating') ? 3000 : false,
  })

  // ── Generate All (triggered globally or per-module) ──────────────────────
  const runGenerateAll = React.useCallback(async (sceneList) => {
    const pending = sceneList.filter(s => !s.ttsAudioUrl)
    if (!pending.length) { onModuleDone?.(); return }
    setModuleGenAll(true)
    for (const s of pending) {
      await onGenerate(s.id)
    }
    setModuleGenAll(false)
    onModuleDone?.()
  }, [onGenerate, onModuleDone])

  // React when the parent clicks "Generate All"
  const prevTrigger = React.useRef(0)
  React.useEffect(() => {
    if (generateAllTrigger > 0 && generateAllTrigger !== prevTrigger.current && scenes.length) {
      prevTrigger.current = generateAllTrigger
      runGenerateAll(scenes)
    }
  }, [generateAllTrigger, scenes, runGenerateAll])

  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!scenes.length) return <p className="text-slate-600 text-sm py-2">No scenes found.</p>

  const allDone    = scenes.length > 0 && scenes.every(s => !!s.ttsAudioUrl)
  const doneCount  = scenes.filter(s => !!s.ttsAudioUrl).length

  return (
    <div>
      {/* Per-module header bar */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {doneCount}/{scenes.length} scenes generated
          {allDone && <span className="ml-2 text-emerald-400">✓ Complete</span>}
        </p>
        {!allDone && (
          <button
            onClick={() => runGenerateAll(scenes)}
            disabled={moduleGenAll}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              moduleGenAll
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-indigo-600/20 hover:text-indigo-300 text-slate-300 border border-white/[0.06]'
            }`}
          >
