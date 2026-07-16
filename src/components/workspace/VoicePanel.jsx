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
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import {
  Mic2, Play, Square, Loader2, CheckCircle, Sparkles, Edit2, X,
  ArrowRight, Volume2, RotateCcw, SlidersHorizontal, ChevronUp, ChevronDown
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import StageHeader from '@/components/workspace/StageHeader'

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
  // Per-module voice-generation progress, reported up by each SceneVoiceList
  // so the module header shows "X/Y generated" / a green "done" badge even
  // while collapsed — previously that state only existed inside the
  // (collapsed-by-default) scene list, so there was no visible progress or
  // completion indicator on the header itself.
  const [moduleVoiceStatus,  setModuleVoiceStatus]  = useState({}) // moduleId -> { done, total }

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

  const handleDeleteVoice = async (sceneId) => {
    setGenerating(prev => ({ ...prev, [sceneId]: true }))
    setErrors(prev => ({ ...prev, [sceneId]: null }))
    try {
      const res = await fetch(`/api/scenes/${sceneId}/delete-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || 'Failed to delete voice')
      }
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      queryClient.invalidateQueries({ queryKey: ['scripts', project.id] })
      onUpdate?.()
    } catch (e) {
      const msg = typeof e?.message === 'string' ? e.message : 'Delete failed'
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
      <p className="text-slate-500 dark:text-slate-400">No scripts yet. Complete the Script stage first.</p>
    </div>
  )

  // Overall voice-generation completion across every module — mirrors the
  // same "green header + Continue button" treatment used on Library/Scripts.
  // Requires every module to have reported status AND have 100% of its
  // scenes voiced (so it stays neutral until generation has actually run).
  const allVoicesComplete = scripts.length > 0 && scripts.every(s => {
    const status = moduleVoiceStatus[s.moduleId]
    return status && status.total > 0 && status.done === status.total
  })

  return (
    <div className="p-6 max-w-4xl">
      <StageHeader
        icon={Mic2}
        title="3. Voice"
        subtitle="Choose your voice talent and generate TTS audio for every scene."
        complete={allVoicesComplete}
        onContinue={() => onContinue?.('visual-design')}
        continueLabel="Continue to Visual Design"
      />

      <div className="mb-8">
        {/* Control Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Generate Audio for Each Scene</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Choose your voice in Casting Settings, then generate</p>
          </div>
          <button
            onClick={() => { setGeneratingAll(true); setGenerateAllTrigger(t => t + 1) }}
            disabled={generatingAll}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
              generatingAll
                ? 'bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-lg'
            }`}
          >
            {generatingAll
              ? <><Loader2 className="w-4 h-4 animate-spin" />Generating all…</>
              : <><Sparkles className="w-4 h-4" />Generate All Scenes</>}
          </button>
        </div>
      </div>

      {/* Background voice regeneration banner — fires when Casting Settings
          regenerates existing scenes' audio with a newly chosen voice in the
          background (non-blocking), e.g. right after the casting popup gate. */}
      {regenStatus && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          Updating audio with your new casting voice — {regenStatus.done}/{regenStatus.total} scenes done…
        </div>
      )}

      {/* Voice Settings */}
      <div className="mb-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
          <button onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Voice Settings</span>
              <span className="text-xs text-slate-500">stability · style · speed</span>
            </div>
            {showSettings ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>

          {showSettings && (
            <div className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-white/[0.06]">
              {[
                { key:'stability',        label:'Stability',          min:0,   max:1,   step:0.05, left:'More expressive',  right:'More consistent' },
                { key:'similarity_boost', label:'Clarity',            min:0,   max:1,   step:0.05, left:'More creative',    right:'Closer to original' },
                { key:'style',            label:'Style Exaggeration', min:0,   max:1,   step:0.05, left:'Neutral',          right:'Exaggerated' },
                { key:'speed',            label:'Speed',              min:0.7, max:1.3, step:0.05, left:'0.7× slower',      right:'1.3× faster' },
              ].map(({ key, label, min, max, step, left, right }) => (
                <div key={key} className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</label>
                    <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-md">
                      {voiceSettings[key]?.toFixed(2)}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={voiceSettings[key]}
                    onChange={e => setVoiceSettings(s => ({ ...s, [key]: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-indigo-500 cursor-pointer" />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">{left}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">{right}</span>
                  </div>
                </div>
              ))}

              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input type="checkbox" checked={voiceSettings.use_speaker_boost}
                  onChange={e => setVoiceSettings(s => ({ ...s, use_speaker_boost: e.target.checked }))}
                  className="accent-indigo-500 w-4 h-4 rounded flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Speaker Boost</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600">Enhances voice similarity — recommended on</p>
                </div>
              </label>

              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                <button onClick={handlePreview} disabled={previewing}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    previewing
                      ? 'bg-indigo-600/30 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 cursor-not-allowed'
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
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Reset defaults
                </button>
              </div>
              {previewError && (
                <p className="text-[10px] text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{previewError}</p>
              )}
              {!previewError && (
                <p className="text-[10px] text-slate-400 dark:text-slate-600">
                  Adjust a slider then click <strong className="text-slate-500 dark:text-slate-400">Test Voice</strong> — plays a short sample instantly, no scenes modified.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Script modules */}
      {scripts.map((script, vi) => {
        const isExpanded = !!expandedModules[script.id]
        const voiceStatus = moduleVoiceStatus[script.moduleId]
        const voiceComplete = voiceStatus && voiceStatus.total > 0 && voiceStatus.done === voiceStatus.total
        return (
          <div key={script.id} className="mb-8">
            <button
              onClick={() => setExpandedModules(p => ({ ...p, [script.id]: !p[script.id] }))}
              className="w-full flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-white/[0.06] text-left hover:opacity-80 transition-opacity"
            >
              <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400">{vi + 1}</span>
              </div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white flex-1 min-w-0 truncate">{script.title}</h3>
              {/* Voice generation progress/completion — visible even while
                  the module is collapsed, since that's the default state. */}
              {voiceComplete ? (
                <Badge variant="green"><CheckCircle className="w-3 h-3 mr-1" />Voices done</Badge>
              ) : voiceStatus && voiceStatus.total > 0 ? (
                <Badge variant="default">{voiceStatus.done}/{voiceStatus.total} voices</Badge>
              ) : null}
              <Badge variant={script.status === 'approved' ? 'green' : 'yellow'}>{script.status}</Badge>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
            </button>
            {/* Kept mounted (display:none when collapsed) rather than unmounted —
                Generate All must still reach every module's scene list even
                while it's visually collapsed, and status must keep reporting
                up to the header above. */}
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
                onStatusChange={(done, total) => {
                  setModuleVoiceStatus(prev => {
                    const existing = prev[script.moduleId]
                    if (existing && existing.done === done && existing.total === total) return prev
                    return { ...prev, [script.moduleId]: { done, total } }
                  })
                }}
                onDelete={handleDeleteVoice}
              />
            </div>
          </div>
        )
      })}

      {/* Continue or Back */}
      <div className="mt-4 p-4 rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <button
              onClick={() => onContinue?.('script')}
              className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
            >
              ← Back to Scripts
            </button>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="font-medium">3. Voices</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-slate-400 dark:text-slate-500">4. Visual Design</span>
          </div>
          <button
            onClick={() => onContinue?.('visual-design')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Per-module scene list ────────────────────────────────────────────────────

function SceneVoiceList({ moduleId, generating, errors, playingUrl, onGenerate, onPlay, generateAllTrigger, onModuleDone, onStatusChange, onDelete }) {
  const [editingId,    setEditingId]    = useState(null)
  const [editText,     setEditText]     = useState('')
  const [moduleGenAll, setModuleGenAll] = useState(false)

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes', moduleId],
    queryFn:  () => moduleId
      ? fetch(`/api/modules/${moduleId}/scenes`).then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      : Promise.resolve([]),
    enabled:  !!moduleId,
    // react-query v5: the callback receives the query object, not the data —
    // the old v4-style `(data) => …` never matched, so this poll never fired.
    refetchInterval: (query) =>
      Array.isArray(query.state.data) && query.state.data.some(s => s.status === 'assets_generating') ? 3000 : false,
  })

  // Report progress up to the module header (works even while this list is
  // display:none-collapsed, since it stays mounted — see VoicePanel above).
  useEffect(() => {
    if (!scenes.length) return
    const done = scenes.filter(s => !!s.ttsAudioUrl).length
    onStatusChange?.(done, scenes.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes])

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
  if (!scenes.length) return <p className="text-slate-400 dark:text-slate-600 text-sm py-2">No scenes found.</p>

  const allDone   = scenes.every(s => !!s.ttsAudioUrl)
  const doneCount = scenes.filter(s => !!s.ttsAudioUrl).length

  return (
    <div>
      {/* Module header row */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {doneCount}/{scenes.length} scenes generated
          {allDone && <span className="ml-2 text-emerald-600 dark:text-emerald-400">✓ Complete</span>}
        </p>
        {!allDone && (
          <button onClick={() => runGenerateAll(scenes)} disabled={moduleGenAll}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              moduleGenAll
                ? 'bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600/20 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
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
            <div key={scene.id} className="rounded-xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06] p-3">
              <div className="flex items-start gap-3">
                <span className="text-xs text-indigo-500 dark:text-indigo-400 font-bold w-5 flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <textarea value={editText} onChange={e => setEditText(e.target.value)}
                      className="w-full bg-slate-800/80 border border-indigo-500/40 rounded-lg p-2 text-xs text-slate-900 dark:text-white resize-none focus:outline-none focus:border-indigo-500 mb-2"
                      rows={5} autoFocus />
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                      {scene.scriptContent?.slice(0, 150)}{scene.scriptContent?.length > 150 ? '...' : ''}
                    </p>
                  )}
                  {err && <p className="text-xs text-red-500 dark:text-red-400">{err}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2 ml-8">
                {!isEditing ? (
                  <button onClick={() => { setEditingId(scene.id); setEditText(scene.scriptContent || '') }}
                    className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10">
                    <Edit2 className="w-3 h-3" /> Edit text
                  </button>
                ) : (
                  <>
                    <button onClick={() => { onGenerate(scene.id, editText); setEditingId(null) }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                      <Sparkles className="w-3 h-3" /> Generate with this text
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded-lg transition-colors">
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
                      ? <Square className="w-3 h-3 text-slate-900 dark:text-white" />
                      : <Play className="w-3 h-3 text-slate-900 dark:text-white ml-0.5" />}
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
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                        >
                          {isGen ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Regenerate
                        </button>
                        <button
                          onClick={() => onDelete?.(scene.id)}
                          disabled={isGen}
                          title="Delete voice audio and timing data"
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                        >
                          <X className="w-3 h-3" />
                          Delete
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
