
import React, { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { mediaService } from '@/services/media'
import {
  User, Search, Play, Square, CheckCircle, Pencil, Loader2, Save,
  ArrowRight, Sparkles, Mic2, Wand2, ChevronDown, ChevronRight, Ban, Circle as CircleIcon,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818' // HeyGen's free default avatar — always available

// "Motion Engine" — HeyGen's own avatar_style param, sent straight to their

const MOTION_ENGINES = [
  { id: 'normal',  label: 'Standard',  desc: 'Natural framing & motion' },
  { id: 'closeUp', label: 'Close Up',  desc: 'Tighter, face-forward crop' },
]

const BACKGROUND_PRESETS = [
  { value: '#1E293B', label: 'Slate' },
  { value: '#020C1B', label: 'Midnight' },
  { value: '#3B2F1E', label: 'Espresso' },
  { value: '#1E3A2F', label: 'Forest' },
  { value: '#3B1E2E', label: 'Wine' },
  { value: '#0F1F3D', label: 'Navy' },
]

const AVATARS_QUERY = { 
  queryKey: ['heygen-avatars'], 
  queryFn: () => mediaService.listAvatars(),
  staleTime: 30 * 60 * 1000, // 30 minutes (increased from 10 - reduces API calls)
  refetchInterval: 60 * 60 * 1000, // Refetch every 60 minutes
  retry: 1, // Only retry once on failure
  retryDelay: 2000, // Wait 2s before retry
  gcTime: 60 * 60 * 1000, // Keep in cache for 60 minutes
}
const VOICES_QUERY  = { 
  queryKey: ['elevenlabs-voices'], 
  queryFn: () => mediaService.listVoices(),
  staleTime: 30 * 60 * 1000, // 30 minutes (increased from 10 - reduces API calls)
  refetchInterval: 60 * 60 * 1000, // Refetch every 60 minutes
  retry: 1, // Only retry once on failure
  retryDelay: 2000, // Wait 2s before retry
  gcTime: 60 * 60 * 1000, // Keep in cache for 60 minutes
}

function normGender(raw) {
  const g = (raw || '').toString().toLowerCase()
  if (g.startsWith('m')) return 'male'
  if (g.startsWith('f')) return 'female'
  return null
}

function safeParseJson(str, fallback) {
  if (!str) return fallback
  try { return { ...fallback, ...JSON.parse(str) } } catch { return fallback }
}

// ─── Avatar grid ──────────────────────────────────────────────────────────────
function AvatarGrid({ value, onChange, avatars, loading, error }) {
  const [query, setQuery] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState(value || '')

  const filtered = avatars.filter(a => (a.avatar_name || '').toLowerCase().includes(query.toLowerCase()))

  if (manualMode) {
    return (
      <div className="flex gap-2">
        <input
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          onBlur={() => onChange(manualValue.trim() || null)}
          placeholder="Paste a HeyGen avatar_id"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-teal-500/40"
        />
        <button
          onClick={() => setManualMode(false)}
          className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Browse grid
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search avatars…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-teal-500/40"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : (
        <>
          {error && <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">{error}</p>}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
            {/* Free default avatar — always pinned first */}
            <button
              onClick={() => onChange(DEFAULT_AVATAR_ID, 'Daisy (default)', 'female')}
              className={`relative aspect-square rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center gap-1 transition-all ${
                value === DEFAULT_AVATAR_ID ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
              } bg-slate-100 dark:bg-slate-800/60`}
            >
              <User className="w-7 h-7 text-slate-400 dark:text-slate-400" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Daisy (default)</span>
              {value === DEFAULT_AVATAR_ID && (
                <CheckCircle className="w-4 h-4 text-teal-500 dark:text-teal-400 absolute top-1.5 right-1.5" />
              )}
            </button>

            {filtered.map(a => (
              <button
                key={a.avatar_id}
                onClick={() => onChange(a.avatar_id, a.avatar_name, normGender(a.gender))}
                className={`relative aspect-square rounded-xl border-2 overflow-hidden transition-all ${
                  a.avatar_id === value ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
                }`}
                title={a.avatar_name}
              >
                {a.preview_image_url
                  ? <img src={a.preview_image_url} className="w-full h-full object-cover" alt={a.avatar_name} />
                  : <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><User className="w-7 h-7 text-slate-400 dark:text-slate-500" /></div>}
                <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-1">
                  <span className="text-[10px] text-white truncate block">{a.avatar_name}</span>
                </div>
                {a.avatar_id === value && (
                  <CheckCircle className="w-4 h-4 text-teal-400 absolute top-1.5 right-1.5" />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setManualMode(true) }}
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mt-3"
          >
            <Pencil className="w-3 h-3" /> Enter avatar ID manually
          </button>
        </>
      )}
    </div>
  )
}

// ─── Voice list + fine-tune sliders ──────────────────────────────────────────

function VoiceList({ value, onChange, genderHint, voices, loading, error }) {
  const [playingId, setPlayingId] = useState(null)
  const [showAllGenders, setShowAllGenders] = useState(false)
  const audioRef = useRef(null)

  const matching = genderHint ? voices.filter(v => normGender(v.labels?.gender) === genderHint) : voices
  const list = (genderHint && !showAllGenders && matching.length > 0) ? matching : voices

  const handlePreview = (e, voice) => {
    e.stopPropagation()
    if (playingId === voice.voice_id) { audioRef.current?.pause(); setPlayingId(null); return }
    audioRef.current?.pause()
    const audio = new Audio(voice.preview_url)
    audioRef.current = audio
    audio.play()
    setPlayingId(voice.voice_id)
    audio.onended = () => setPlayingId(null)
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner size="sm" /></div>
  if (error) return <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
  if (!voices.length) return <p className="text-xs text-slate-500">No voices found — check your voice API key in Integrations.</p>

  return (
    <div>
      {genderHint && matching.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-white/[0.06]">
          <span className="text-[11px] text-slate-500 dark:text-slate-500">
            {showAllGenders ? 'Showing all voices' : `Showing ${genderHint} voices to match avatar`}
          </span>
          <button
            onClick={() => setShowAllGenders(v => !v)}
            className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
          >
            {showAllGenders ? 'Filter to match' : 'Show all'}
          </button>
        </div>
      )}
      <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04] rounded-xl border border-slate-200 dark:border-white/10">
        {list.map(v => (
          <li key={v.voice_id}
            onClick={() => onChange(v.voice_id)}
            className={`flex items-center justify-between gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${v.voice_id === value ? 'bg-teal-50 dark:bg-teal-500/10' : ''}`}
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-900 dark:text-white">{v.name}</p>
              {v.labels?.accent && <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{v.labels.accent} · {v.labels.gender}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {v.voice_id === value && <CheckCircle className="w-4 h-4 text-teal-500 dark:text-teal-400" />}
              {v.preview_url && (
                <button
                  onClick={(e) => handlePreview(e, v)}
                  className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-teal-600 flex items-center justify-center transition-colors group"
                >
                  {playingId === v.voice_id ? <Square className="w-2.5 h-2.5 text-slate-600 dark:text-white group-hover:text-white" /> : <Play className="w-2.5 h-2.5 text-slate-600 dark:text-white group-hover:text-white" />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.05, hint, format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</label>
        <span className="text-xs text-slate-400 dark:text-slate-500">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-teal-500"
      />
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">{hint}</p>}
    </div>
  )
}

// ─── HeyGen-style collapsible summary card ───────────────────────────────────

function SummaryCard({ icon: thumb, title, subtitle, expanded, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {thumb}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500 truncate">{subtitle}</p>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {expanded && <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-white/[0.06]">{children}</div>}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function AvatarStudioPanel({ project, onUpdate, onContinue }) {
  const queryClient = useQueryClient()

  const [avatarId, setAvatarId] = useState(project?.defaultAvatarId || '')
  const [voiceId, setVoiceId] = useState(project?.defaultVoiceId || '')
  const [avatarName, setAvatarName] = useState('')
  const [avatarThumb, setAvatarThumb] = useState(null)
  const [avatarGender, setAvatarGender] = useState(null)
  const [motionEngine, setMotionEngine] = useState(
    project?.avatarStyle === 'closeUp' ? 'closeUp' : 'normal'
  )
  const [background, setBackground] = useState(() => safeParseJson(project?.avatarBackground, {
    type: 'color', value: '#1E293B', layout: 'original', radius: 100,
  }))
  const [voiceSettings, setVoiceSettings] = useState(() => safeParseJson(project?.voiceSettings, {
    stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 1.0,
  }))
  const [saved, setSaved] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // Re-sync if the project prop changes underneath us (same fix CastingSettings uses).
  useEffect(() => {
    setAvatarId(project?.defaultAvatarId || '')
    setVoiceId(project?.defaultVoiceId || '')
    setMotionEngine(project?.avatarStyle === 'closeUp' ? 'closeUp' : 'normal')
    setBackground(safeParseJson(project?.avatarBackground, { type: 'color', value: '#1E293B', layout: 'original', radius: 100 }))
    setVoiceSettings(safeParseJson(project?.voiceSettings, { stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 1.0 }))
  }, [project?.id])

  const { data: avatarsRes, isLoading: avatarsLoading, error: avatarsErr } = useQuery(AVATARS_QUERY)
  const { data: voicesRes, isLoading: voicesLoading, error: voicesErr } = useQuery(VOICES_QUERY)
  const avatars = avatarsRes?.avatars || []
  const voices = voicesRes?.voices || []

  // Look up the saved avatar's gender/name/thumbnail (e.g. when reopening
  // this panel later) so the summary card and voice tab are correct even
  // before re-selecting anything.
  useEffect(() => {
    if (!avatarId) return
    if (avatarId === DEFAULT_AVATAR_ID) {
      setAvatarName('Daisy (default)'); setAvatarThumb(null); setAvatarGender(prev => prev || 'female')
      return
    }
    const a = avatars.find(a => a.avatar_id === avatarId)
    if (a) {
      setAvatarName(a.avatar_name || avatarId)
      setAvatarThumb(a.preview_image_url || null)
      setAvatarGender(prev => prev || normGender(a.gender))
    } else {
      setAvatarName(avatarId)
    }
  }, [avatarId, avatars])

  const selectedVoice = voices.find(v => v.voice_id === voiceId)

  const avatarsError = avatarsErr
    ? (avatarsErr?.message || 'Failed to load avatars. Check HEYGEN_API_KEY in api/.env.')
    : (!avatarsLoading && avatars.length === 0
        ? 'Your HeyGen account has no listed avatars (common on free/trial keys). Use the free default avatar, or enter an avatar ID manually.'
        : null)
  const voicesError = voicesErr ? 'Failed to load voices. Check your voice API key.' : null

  const saveMutation = useMutation({
    mutationFn: () => projectsService.update(project.id, {
      default_avatar_id: avatarId || null,
      default_voice_id: voiceId || null,
      avatar_style: motionEngine,
      avatar_background: background,
      voice_settings: voiceSettings,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      onUpdate?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    },
  })

  const handleRenderScene = async () => {
    await saveMutation.mutateAsync()
    onContinue?.()
  }

  const isCircle = background.layout === 'circle'
  const radiusPx = Math.round(((background.radius ?? 100) / 100) * 120) // cosmetic px readout, ~half the PiP box

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-1">
        <Wand2 className="w-5 h-5 text-teal-500 dark:text-teal-400" />
        <h2 className="text-lg font-medium text-slate-900 dark:text-white tracking-wide">Avatar Studio</h2>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Choose your presenter, fine-tune their voice, and set the look — applied to every scene's video.
      </p>

      <div className="space-y-4">
        {/* ── Avatar card ───────────────────────────────────────────────── */}
        <SummaryCard
          title={avatarName || 'Choose an avatar'}
          subtitle={avatarGender ? `${avatarGender[0].toUpperCase()}${avatarGender.slice(1)} presenter` : 'Tap to browse'}
          expanded={avatarOpen}
          onToggle={() => setAvatarOpen(v => !v)}
          icon={avatarThumb
            ? <img src={avatarThumb} className="w-full h-full object-cover" alt="" />
            : <User className="w-5 h-5 text-slate-400" />}
        >
          <AvatarGrid
            value={avatarId}
            onChange={(id, name, gender) => { setAvatarId(id); setAvatarName(name); setAvatarGender(gender) }}
            avatars={avatars} loading={avatarsLoading} error={avatarsError}
          />
        </SummaryCard>

        {/* ── Voice card ────────────────────────────────────────────────── */}
        <SummaryCard
          title={selectedVoice?.name || 'Choose a voice'}
          subtitle={selectedVoice?.labels?.accent ? `${selectedVoice.labels.accent} · ${selectedVoice.labels.gender}` : 'Tap to browse'}
          expanded={voiceOpen}
          onToggle={() => setVoiceOpen(v => !v)}
          icon={<Mic2 className="w-5 h-5 text-slate-400" />}
        >
          <div className="space-y-5">
            <VoiceList value={voiceId} onChange={setVoiceId} genderHint={avatarGender} voices={voices} loading={voicesLoading} error={voicesError} />
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-white/[0.06]">
              <Slider label="Stability" value={voiceSettings.stability}
                onChange={v => setVoiceSettings(s => ({ ...s, stability: v }))}
                hint="Higher = more consistent, less expressive" />
              <Slider label="Similarity" value={voiceSettings.similarity_boost}
                onChange={v => setVoiceSettings(s => ({ ...s, similarity_boost: v }))}
                hint="Higher = closer to the original voice" />
              <Slider label="Style exaggeration" value={voiceSettings.style}
                onChange={v => setVoiceSettings(s => ({ ...s, style: v }))} />
              <Slider label="Speed" value={voiceSettings.speed} min={0.7} max={1.3}
                onChange={v => setVoiceSettings(s => ({ ...s, speed: v }))} />
            </div>
          </div>
        </SummaryCard>

        {/* ── Motion Engine ────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 tracking-wide font-medium">MOTION ENGINE</label>
          <div className="relative">
            <select
              value={motionEngine}
              onChange={e => setMotionEngine(e.target.value)}
              className="w-full appearance-none px-3 py-2.5 pr-9 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500/40"
            >
              {MOTION_ENGINES.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* ── Avatar Background ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-3 tracking-wide font-medium">AVATAR BACKGROUND</label>
          <div className="grid grid-cols-4 gap-2.5">
            {/* Customize — opens the color input */}
            <label
              className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                background.type === 'color' ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
              }`}
              style={background.type === 'color' ? { backgroundColor: background.value } : {}}
            >
              <input
                type="color"
                value={background.value || '#1E293B'}
                onChange={e => setBackground(b => ({ ...b, type: 'color', value: e.target.value }))}
                className="opacity-0 w-0 h-0 absolute"
              />
              <Pencil className={`w-4 h-4 ${background.type === 'color' ? 'text-white' : 'text-slate-400'}`} />
              <span className={`text-[10px] ${background.type === 'color' ? 'text-white' : 'text-slate-500'}`}>Customize</span>
              {background.type === 'color' && <CheckCircle className="w-3.5 h-3.5 text-white absolute top-1 right-1" />}
            </label>

            {/* Remove — transparent background */}
            <button
              onClick={() => setBackground(b => ({ ...b, type: 'transparent', value: null }))}
              className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all bg-slate-100 dark:bg-slate-800/60 ${
                background.type === 'transparent' ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
              }`}
            >
              <Ban className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] text-slate-500">Remove</span>
              {background.type === 'transparent' && <CheckCircle className="w-3.5 h-3.5 text-teal-500 absolute top-1 right-1" />}
            </button>

            {/* Color — current preset swatch */}
            <button
              onClick={() => setBackground(b => ({ ...b, type: 'color', value: b.value || '#1E293B' }))}
              className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                background.type === 'color' ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
              }`}
              style={{ backgroundColor: background.value || '#1E293B' }}
            >
              <span className="text-[10px] text-white drop-shadow">Color</span>
              {background.type === 'color' && <CheckCircle className="w-3.5 h-3.5 text-white absolute top-1 right-1" />}
            </button>

            {/* Original — default slate, the studio's own backdrop */}
            <button
              onClick={() => setBackground(b => ({ ...b, type: 'color', value: '#1E293B' }))}
              className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                background.type === 'color' && background.value === '#1E293B' ? 'border-teal-500' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
              }`}
              style={{ backgroundColor: '#1E293B' }}
            >
              <span className="text-[10px] text-white">Original</span>
              {background.type === 'color' && background.value === '#1E293B' && <CheckCircle className="w-3.5 h-3.5 text-white absolute top-1 right-1" />}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {BACKGROUND_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setBackground(b => ({ ...b, type: 'color', value: p.value }))}
                title={p.label}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  background.value === p.value ? 'border-teal-400 scale-110' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/30'
                }`}
                style={{ backgroundColor: p.value }}
              />
            ))}
          </div>
        </div>

        {/* ── Layout (Original / Circle) ───────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-3 tracking-wide font-medium">LAYOUT</label>
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/[0.06] w-fit">
            <button
              onClick={() => setBackground(b => ({ ...b, layout: 'original' }))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                !isCircle ? 'bg-teal-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Square className="w-3.5 h-3.5" /> Original
            </button>
            <button
              onClick={() => setBackground(b => ({ ...b, layout: 'circle', radius: b.radius ?? 100 }))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                isCircle ? 'bg-teal-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CircleIcon className="w-3.5 h-3.5" /> Circle
            </button>
          </div>

          {isCircle && (
            <div className="mt-4">
              <Slider
                label="Radius"
                value={background.radius ?? 100}
                min={20} max={100} step={1}
                onChange={v => setBackground(b => ({ ...b, radius: v }))}
                format={() => `${radiusPx}px`}
                hint="How much of the presenter box the circle fills"
              />
            </div>
          )}
        </div>

        {/* ── Live preview ─────────────────────────────────────────────── */}
        {/* Shows, on a stand-in slide frame, exactly where + how the presenter
            will be composited — same corner box (right 1.5%, bottom 2%,
            width 22%, height 38% of the frame) and the same circle-crop math
            (radius = % of the box's half-width) that compositeAvatarOverlay
            in ffmpegVideo.ts actually uses, so Background/Layout/Radius
            changes are visible immediately instead of only as abstract
            swatches and a toggle. */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-3 tracking-wide font-medium">PREVIEW</label>
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border border-slate-700/60">
            <div className="absolute inset-x-6 top-6 flex flex-col gap-1.5 opacity-30">
              <div className="h-2 w-2/5 rounded bg-slate-400" />
              <div className="h-1.5 w-1/3 rounded bg-slate-500" />
            </div>
            <div
              className="absolute flex items-center justify-center"
              style={{
                right: '1.5%', bottom: '2%', width: '22%', height: '38%',
                backgroundColor: background.type === 'transparent' ? 'transparent' : (background.value || '#1E293B'),
                clipPath: isCircle ? `circle(${background.radius ?? 100}% at 50% 50%)` : 'none',
                outline: background.type === 'transparent' ? '1px dashed rgba(255,255,255,0.35)' : 'none',
                overflow: 'hidden',
              }}
            >
              {avatarThumb
                ? <img src={avatarThumb} className="w-full h-full object-cover" alt="" />
                : <User className="w-6 h-6 text-slate-300" />}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-2">
            Roughly how your presenter will sit over every scene's slide — {isCircle ? `circular, ${radiusPx}px radius` : 'square'},{' '}
            {background.type === 'transparent' ? 'transparent background' : `on ${background.value}`}.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-8">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} variant="secondary">
          {saveMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : saved
            ? <><CheckCircle className="w-4 h-4" />Saved</>
            : <><Save className="w-4 h-4" />Save settings</>}
        </Button>
        <Button onClick={handleRenderScene} disabled={saveMutation.isPending}>
          <Sparkles className="w-4 h-4" />Render Scene<ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      {saveMutation.isError && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-3">{saveMutation.error?.message}</p>
      )}
    </div>
  )
}
