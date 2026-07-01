/**
 * Stage 3 — Voice
 * Converts each scene's script text to audio via ElevenLabs.
 *
 * Features:
 * - Voice Settings panel (sliders with clear labels + Test Voice preview)
 * - Generate All button → sequential generation across all modules
 * - Per-module "Generate module" button with scene counter
 * - Individual scene edit + generate
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import {
  Mic2, Play, Square, Loader2, CheckCircle, Sparkles, Edit2, X,
  ArrowRight, Image, SlidersHorizontal, ChevronDown, ChevronUp,
  Volume2, RotateCcw, Wand2
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

export default function VoicePanel({ project, onUpdate, onContinue, regenStatus }) {
  const queryClient = useQueryClient()
  const [playingUrl, setPlayingUrl]   = useState(null)
  const [audioEl,    setAudioEl]      = useState(null)
  const [generating, setGenerating]   = useState({})
  const [errors,     setErrors]       = useState({})
  const [voiceSettings, setVoiceSettings] = useState({
    stability: 0.5, similarity_boost: 0.8, style: 0.3,
    use_speaker_boost: true, speed: 1.0,
  })
  const [showSettings,       setShowSettings]       = useState(false)
  const [previewing,         setPreviewing]         = useState(false)
  const [previewError,       setPreviewError]       = useState(null)
  const [previewAudioEl,     setPreviewAudioEl]     = useState(null)
  const [generateAllTrigger, setGenerateAllTrigger] = useState(0)
  const [generatingAll,      setGeneratingAll]      = useState(false)
  // Modules are collapsed by default — clicking a module's name expands it so
  // you see only that module's scenes instead of scrolling through every
  // module's full scene list stacked one after another.
  const [expandedModules,    setExpandedModules]    = useState({})

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ['scripts', project?.id],
    queryFn:  () => scriptsService.listByProject(project.id),
    enabled:  !!project?.id,
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
      const msg = typeof e?.message === 'string' ? e.message
        : e?.message ? JSON.stringify(e.message)
        : 'Audio generation failed'
      setErrors(prev => ({ ...prev, [sceneId]: msg }))
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
    setPlayingUrl(url); setAudioEl(a)
  }

  // ── Test Voice preview ─────────────────────────────────────────────────────
  const handlePreview = async () => {
    // If already playing, stop and return — don't restart a new preview
    if (previewAudioEl) {
      previewAudioEl.pause()
      setPreviewAudioEl(null)
      return
    }
    setPreviewing(true); setPreviewError(null)
    try {
      const res = await fetch('/api/previewTTS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project?.id,
          voice_id: project?.defaultVoiceId || undefined,
          voice_settings: voiceSettings,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        setPreviewError(err.error || 'Preview failed'); return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const el   = new Audio(url)
      el.play().catch(e => setPreviewError('Could not play audio: ' + e.message))
      el.onended = () => { URL.revokeObjectURL(url); setPreviewAudioEl(null) }
      setPreviewAudioEl(el)
    } catch (e) { setPreviewError(e.message || 'Preview failed') }
    finally { setPreviewing(false) }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Spinner /></div>

  if (!scripts.length) return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <Mic2 className="w-10 h-10 text-slate-700 mb-3" />
      <p className="text-slate-400">No scripts yet. Complete the Script stage first.</p>
    </div>
  )

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Mic2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-medium text-white tracking-wide">Voice Generation</h2>
        </div>
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
        Generate audio for each scene. Click <strong className="text-slate-300">Edit</strong> to change
        the text before generating. Choose your voice in{' '}
        <strong className="text-slate-300">Casting Settings</strong> (gear icon, top right).
      </p>

      {/* Background voice regeneration banner — fires when Casting Settings
          regenerates existing scenes' audio with a newly chosen voice in the
          background (non-blocking), e.g. right after the casting popup gate. */}
      {regenStatus && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          Updating audio with your new casting voice — {regenStatus.done}/{regenStatus.total} scenes done…
        </div>
      )}

      {/* Voice Settings */}
      <div className="mb-4">
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
                { key:'stability',        label:'Stability',          min:0,   max:1,   step:0.05, left:'More expressive',  right:'More consistent' },
                { key:'similarity_boost', label:'Clarity',            min:0,   max:1,   step:0.05, left:'More creative',    right:'Closer to original' },
                { key:'style',            label:'Style Exaggeration', min:0,   max:1,   step:0.05, left:'Neutral',          right:'Exaggerated' },
                { key:'speed',            label:'Speed',              min:0.7, max:1.3, step:0.05, left:'0.7× slower',      right:'1.3× faster' },
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

              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={voiceSettings.use_speaker_boost}
                  onChange={e => setVoiceSettings(s => ({ ...s, use_speaker_boost: e.target.checked }))}
                  className="accent-indigo-500 w-4 h-4 rounded flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Speaker Boost</p>
                  <p className="text-[10px] text-slate-600">Enhances voice similarity — recommended on</p>
                </div>
              </label>

              <div className="flex items-center gap-3 pt-2 border-t border-white/[0.04]">
                <button onClick={handlePreview} disabled={previewing}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    previewing
                      ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}>
                  {previewing
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                    : previewAudioEl
                    ? <><Square className="w-4 h-4" />Stop</>
                    : <><Volume2 className="w-4 h-4" />Test Voice</>}
                </button>
                <button
                  onClick={() => setVoiceSettings({ stability:0.5, similarity_boost:0.8, style:0.3, use_speaker_boost:true, speed:1.0 })}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset defaults
                </button>
              </div>
              {previewError && (
                <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{previewError}</p>
              )}
              {!previewError && (
                <p className="text-[10px] text-slate-600">
                  Adjust a slider then click <strong className="text-slate-400">Test Voice</strong> — plays a short sample instantly, no scenes modified.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Script modules */}
      {scripts.map((script, vi) => {
        const isExpanded = !!expandedModules[script.id]
        return (
          <div key={script.id} className="mb-8">
            <button
              onClick={() => setExpandedModules(p => ({ ...p, [script.id]: !p[script.id] }))}
              className="w-full flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.06] text-left hover:opacity-80 transition-opacity"
            >
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-indigo-400">{vi + 1}</span>
              </div>
              <h3 className="text-sm font-medium text-white flex-1">{script.title}</h3>
              <Badge variant={script.status === 'approved' ? 'green' : 'yellow'}>{script.status}</Badge>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {/* Kept mounted (display:none when collapsed) rather than unmounted —
                Generate All must still reach every module's scene list even
                while it's visually collapsed. */}
            <div style={{ display: isExpanded ? 'block' : 'none' }}>
              <SceneVoiceList
                moduleId={script.moduleId}
                generating={generating}
                errors={errors}
                playingUrl={playingUrl}
                onGenerate={handleGenerateTTS}
                onPlay={handlePlay}
                generateAllTrigger={generateAllTrigger}
                onModuleDone={() => {
                  if (vi === scripts.length - 1) setGeneratingAll(false)
                }}
              />
            </div>
          </div>
        )
      })}

      {/* Continue */}
      <div className="mt-4 p-4 rounded-xl bg-slate-900/40 border border-white/[0.06]">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Ready to design your slides?</p>
          <button
            onClick={() => onContinue?.('avatar-studio')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Continue to Avatar Studio
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Per-module scene list ────────────────────────────────────────────────────

function SceneVoiceList({ moduleId, generating, errors, playingUrl, onGenerate, onPlay, generateAllTrigger, onModuleDone }) {
  const [editingId,    setEditingId]    = useState(null)
  const [editText,     setEditText]     = useState('')
  const [moduleGenAll, setModuleGenAll] = useState(false)

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn:  () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.json())
      : Promise.resolve([]),
    enabled:  !!moduleId,
    refetchInterval: (data) =>
      Array.isArray(data) && data.some(s => s.status === 'assets_generating') ? 3000 : false,
  })

  const runGenerateAll = useCallback(async (sceneList) => {
    const pending = sceneList.filter(s => !s.ttsAudioUrl)
    if (!pending.length) { onModuleDone?.(); return }
    setModuleGenAll(true)
    for (const s of pending) { await onGenerate(s.id) }
    setModuleGenAll(false)
    onModuleDone?.()
  }, [onGenerate, onModuleDone])

  const prevTrigger = useRef(0)
  useEffect(() => {
    if (generateAllTrigger > 0 && generateAllTrigger !== prevTrigger.current && scenes.length) {
      prevTrigger.current = generateAllTrigger
      runGenerateAll(scenes)
    }
  }, [generateAllTrigger, scenes, runGenerateAll])

  if (isLoading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (!scenes.length) return <p className="text-slate-600 text-sm py-2">No scenes found.</p>

  const allDone   = scenes.every(s => !!s.ttsAudioUrl)
  const doneCount = scenes.filter(s => !!s.ttsAudioUrl).length

  return (
    <div>
      {/* Module header row */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {doneCount}/{scenes.length} scenes generated
          {allDone && <span className="ml-2 text-emerald-400">✓ Complete</span>}
        </p>
        {!allDone && (
          <button onClick={() => runGenerateAll(scenes)} disabled={moduleGenAll}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              moduleGenAll
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-indigo-600/20 hover:text-indigo-300 text-slate-300 border border-white/[0.06]'
            }`}>
            {moduleGenAll
              ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
              : <><Sparkles className="w-3 h-3" />Generate module</>}
          </button>
        )}
      </div>

      {/* Scene cards */}
      <div className="space-y-2">
        {scenes.map((scene, i) => {
          const isGen     = generating[scene.id] || scene.status === 'assets_generating' || moduleGenAll
          const hasAudio  = !!scene.ttsAudioUrl
          const err       = errors[scene.id]
          const isEditing = editingId === scene.id

          return (
            <div key={scene.id} className="rounded-xl bg-slate-900/40 border border-white/[0.06] p-3">
              <div className="flex items-start gap-3">
                <span className="text-xs text-indigo-400 font-bold w-5 flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <textarea value={editText} onChange={e => setEditText(e.target.value)}
                      className="w-full bg-slate-800/80 border border-indigo-500/40 rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500 mb-2"
                      rows={5} autoFocus />
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
                  <button onClick={() => { setEditingId(scene.id); setEditText(scene.scriptContent || '') }}
                    className="flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10">
                    <Edit2 className="w-3 h-3" /> Edit text
                  </button>
                ) : (
                  <>
                    <button onClick={() => { onGenerate(scene.id, editText); setEditingId(null) }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                      <Sparkles className="w-3 h-3" /> Generate with this text
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg transition-colors">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </>
                )}

                <div className="flex-1" />

                {hasAudio && !isEditing && (
                  <button onClick={() => onPlay(scene.ttsAudioUrl)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      playingUrl === scene.ttsAudioUrl ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-indigo-600'
                    }`} title={playingUrl === scene.ttsAudioUrl ? 'Stop' : 'Play audio'}>
                    {playingUrl === scene.ttsAudioUrl
                      ? <Square className="w-3 h-3 text-white" />
                      : <Play className="w-3 h-3 text-white ml-0.5" />}
                  </button>
                )}

                {!isEditing && (
                  hasAudio
                    ? <div className="flex items-center gap-2">
                        <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Done</Badge>
                        <button
                          onClick={() => onGenerate(scene.id)}
                          disabled={isGen}
                          title="Regenerate with the current casting voice"
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                        >
                          {isGen ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Regenerate
                        </button>
                      </div>
                    : <Button size="sm" variant="secondary" disabled={isGen} onClick={() => onGenerate(scene.id)}>
                        {isGen ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : <><Sparkles className="w-3.5 h-3.5" />Generate</>}
                      </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
