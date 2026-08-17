/**
 * Casting Settings — gear button panel (not a pipeline stage)
 * Choose default avatar and voice for the project.
 * Sits outside the main pipeline because External API listing may incur costs.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { mediaService } from '@/services/media'
import { scriptsService } from '@/services/scripts'
import { agentsService } from '@/services/agents'
import { Settings, User, Play, Square, ChevronDown, Loader2, Save, X, CheckCircle, Pencil, RefreshCw, AlertCircle, Mic2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// Skeleton loader for a list of items
function SkeletonLoader({ count = 3 }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
      ))}
    </div>
  )
}

const DEFAULT_AVATAR_ID = 'Daisy-inskirt-20220818' // HeyGen's free default avatar — always available

// Normalize whatever gender-ish field HeyGen/ElevenLabs return ('male',
// 'man', 'Female', etc.) down to 'male' | 'female' | null so the avatar and
// voice can be compared directly.
function normGender(raw) {
  const g = (raw || '').toString().toLowerCase()
  if (g.startsWith('m')) return 'male'
  if (g.startsWith('f')) return 'female'
  return null
}

// Shared react-query keys/options — same ones used in VisualDesignerPanel's
// SceneEditor so the avatar/voice catalogs are fetched once per project
// session and reused everywhere (this is what fixes the slow "select avatar"
// load — every picker after the first hits the cache, and the backend itself
// now also caches the external API call for 10 minutes).
const AVATARS_QUERY = { queryKey: ['heygen-avatars'], queryFn: () => mediaService.listAvatars(), staleTime: 10 * 60 * 1000, initialData: () => mediaService.cachedAvatars(), initialDataUpdatedAt: 0 }
const VOICES_QUERY  = { queryKey: ['elevenlabs-voices'], queryFn: () => mediaService.listVoices(),  staleTime: 10 * 60 * 1000 }

// How much of the presenter each avatar shows. HeyGen bakes framing into the
// avatar itself — its v3 API has NO framing parameter (v2's closeUp/normal was
// dropped), so a chest-up avatar renders chest-up no matter what the slide
// overlay does. Filtering here is the only way to actually get a fuller shot.
// Labels come from api/src/functions/media.ts's classifyAvatarFraming().
const FRAMING_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'full-body',  label: 'Full body' },
  { id: 'half-body',  label: 'Half body' },
  { id: 'close-up',   label: 'Close-up' },
]
const FRAMING_LABELS = {
  'full-body': 'Full body',
  'half-body': 'Half body',
  'close-up':  'Close-up',
}

// ─── Avatar Picker ────────────────────────────────────────────────────────────
function AvatarPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState(value || '')
  const [refreshing, setRefreshing] = useState(false)
  const [framing, setFraming] = useState('all')
  const ref = useRef(null)
  const queryClient = useQueryClient()

  const { data, isLoading: loading, error: queryError, isFetching } = useQuery(AVATARS_QUERY)
  const allAvatars = data?.avatars || []
  const avatars = framing === 'all'
    ? allAvatars
    : allAvatars.filter(a => a.framing === framing)
  // Counts drive both the chip badges and the "nothing matched" copy below,
  // so a filter that would come up empty is visibly empty BEFORE it's clicked.
  const framingCounts = allAvatars.reduce((acc, a) => {
    acc[a.framing || 'unknown'] = (acc[a.framing || 'unknown'] || 0) + 1
    return acc
  }, {})
  // Checks allAvatars, not the filtered view — otherwise a framing filter
  // that simply matches nothing would claim the whole HeyGen account is empty.
  const error = queryError
    ? (queryError?.message || 'Failed to load avatars. Check HEYGEN_API_KEY in api/.env.')
    : (!loading && allAvatars.length === 0
        ? 'Your HeyGen account has no listed avatars (common on free/trial keys). Use "Enter avatar ID manually" below, or try the free default avatar.'
        : null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRefresh = async (e) => {
    e.stopPropagation()
    setRefreshing(true)
    try {
      // Force invalidate cache and refetch
      await queryClient.refetchQueries({ queryKey: AVATARS_QUERY.queryKey, type: 'active' })
    } finally {
      setRefreshing(false)
    }
  }

  // Resolved against the UNFILTERED list on purpose — the chosen avatar's
  // name/thumbnail must keep showing on the closed button even when the
  // active framing filter happens to exclude it.
  const selected = allAvatars.find(a => a.avatar_id === value)

  if (manualMode) {
    return (
      <div className="flex gap-2">
        <input
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          onBlur={() => onChange(manualValue.trim() || null)}
          placeholder="Paste a HeyGen avatar_id"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/40"
        />
        <button
          onClick={() => setManualMode(false)}
          className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Browse
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:text-slate-900 dark:hover:text-white transition-all"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected?.preview_image_url
            ? <img src={selected.preview_image_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
            : <User className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />}
          <span className="truncate">{selected?.avatar_name || (value ? `Avatar: ${value.slice(0,16)}...` : 'Select avatar')}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {loading && !data
            ? <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin" />
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white">Fetching avatars from HeyGen</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">This takes 2-5 seconds on first load</p>
                  </div>
                </div>
                <SkeletonLoader count={5} />
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { onChange(DEFAULT_AVATAR_ID, 'Daisy (default)', 'female'); setOpen(false) }}
                    className="flex-1 px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200 dark:border-white/10"
                  >
                    Use default avatar
                  </button>
                </div>
              </div>
            : <>
                {error && <p className="text-xs text-amber-600 dark:text-amber-400 p-3 border-b border-slate-100 dark:border-white/[0.06] flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}</p>}

                {/* Framing filter — the ONLY real control over how much of the
                    presenter appears, since HeyGen's API exposes no framing
                    option and the shot is fixed by the avatar's own footage. */}
                {allAvatars.length > 0 && (
                  <div className="px-2.5 pt-2.5 pb-2 border-b border-slate-100 dark:border-white/[0.06]">
                    <div className="flex flex-wrap gap-1">
                      {FRAMING_FILTERS.map(f => {
                        const count = f.id === 'all' ? allAvatars.length : (framingCounts[f.id] || 0)
                        const active = framing === f.id
                        return (
                          <button key={f.id} type="button"
                            onClick={(e) => { e.stopPropagation(); setFraming(f.id) }}
                            disabled={count === 0}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              active
                                ? 'bg-indigo-600 text-white border-transparent'
                                : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                            }`}>
                            {f.label} <span className={active ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'}>{count}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">
                      Framing is fixed by the avatar itself — HeyGen can't zoom out. Labels are read from avatar names, so check the preview.
                    </p>
                  </div>
                )}

                {avatars.length === 0 && allAvatars.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 p-3">
                    No avatars matched this framing. Most of HeyGen's catalog is unlabelled — try “All” and check previews.
                  </p>
                )}
                {avatars.length > 0 && (
                  <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {avatars.map((a, idx) => (
                      <li key={`${a.avatar_id}-${idx}`}
                        onClick={() => { onChange(a.avatar_id, a.avatar_name, normGender(a.gender)); setOpen(false) }}
                        className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${a.avatar_id === value ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}
                      >
                        {a.preview_image_url
                          ? <img src={a.preview_image_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                          : <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            </div>}
                        <div className="min-w-0">
                          <p className="text-sm text-slate-900 dark:text-white truncate">{a.avatar_name}</p>
                          <div className="flex items-center gap-1.5">
                            {normGender(a.gender) && (
                              <span className="text-xs text-slate-500 dark:text-slate-500 capitalize">{normGender(a.gender)}</span>
                            )}
                            {FRAMING_LABELS[a.framing] && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {FRAMING_LABELS[a.framing]}
                              </span>
                            )}
                          </div>
                        </div>
                        {a.avatar_id === value && <CheckCircle className="w-4 h-4 text-indigo-500 dark:text-indigo-400 ml-auto" />}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="p-2 space-y-1 border-t border-slate-100 dark:border-white/[0.06]">
                  {isFetching && !loading && (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-1.5 text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" /> Refreshing avatars…
                    </button>
                  )}
                  {!isFetching && (
                    <>
                      <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full flex items-center justify-center gap-1.5 text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                      >
                        {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {refreshing ? 'Refreshing…' : 'Refresh avatar list'}
                      </button>
                      <button
                        onClick={() => { onChange(DEFAULT_AVATAR_ID, 'Daisy (default)', 'female'); setOpen(false) }}
                        className="w-full text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Use free default avatar
                      </button>
                      <button
                        onClick={() => { setManualMode(true); setOpen(false) }}
                        className="w-full flex items-center gap-1.5 text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Enter avatar ID manually
                      </button>
                    </>
                  )}
                </div>
              </>}
        </div>
      )}
    </div>
  )
}

function VoicePicker({ value, onChange, genderHint }) {
  const [open, setOpen] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const [selectedGender, setSelectedGender] = useState(null) // 'male' | 'female' | null
  const [refreshing, setRefreshing] = useState(false)
  const audioRef = useRef(null)
  const ref = useRef(null)
  const queryClient = useQueryClient()

  const { data, isLoading: loading, error: queryError, isFetching } = useQuery(VOICES_QUERY)
  const allVoices = data?.voices || []
  const error = queryError ? 'Failed to load voices. Check your voice API key.' : null

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRefresh = async (e) => {
    e.stopPropagation()
    setRefreshing(true)
    try {
      // Force invalidate cache and refetch
      await queryClient.refetchQueries({ queryKey: VOICES_QUERY.queryKey, type: 'active' })
    } finally {
      setRefreshing(false)
    }
  }

  // Filter by selected gender
  const filtered = selectedGender 
    ? allVoices.filter(v => normGender(v.labels?.gender) === selectedGender)
    : allVoices

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

  const selected = allVoices.find(v => v.voice_id === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:text-slate-900 dark:hover:text-white transition-all"
      >
        <span className="truncate">{selected?.name || (value ? `Voice: ${value.slice(0,12)}...` : 'Select voice')}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {loading && !data
            ? <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin" />
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white">Fetching voices from ElevenLabs</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">This takes 1-3 seconds on first load</p>
                  </div>
                </div>
                <SkeletonLoader count={5} />
              </div>
            : error
            ? <p className="text-xs text-red-500 dark:text-red-400 p-4 flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}</p>
            : allVoices.length === 0
            ? <p className="text-xs text-slate-500 p-4 text-center">No voices found — check your voice API key in Integrations</p>
            : <>
                {/* Gender Filter Buttons */}
                <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Filter by:</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedGender(selectedGender === 'male' ? null : 'male') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedGender === 'male'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    Male
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedGender(selectedGender === 'female' ? null : 'female') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedGender === 'female'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    Female
                  </button>
                  {selectedGender && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedGender(null) }}
                      className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {filtered.map((v, idx) => (
                    <li key={`${v.voice_id}-${idx}`}
                      onClick={() => { onChange(v.voice_id, v.name); setOpen(false) }}
                      className={`flex items-center justify-between gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${v.voice_id === value ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900 dark:text-white">{v.name}</p>
                        {v.labels?.accent && (
                          <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{v.labels.accent} · {v.labels.gender}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {v.voice_id === value && <CheckCircle className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
                        {v.preview_url && (
                          <button
                            onClick={(e) => handlePreview(e, v)}
                            className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-indigo-600 dark:hover:bg-indigo-600 flex items-center justify-center transition-colors group"
                          >
                            {playingId === v.voice_id
                              ? <Square className="w-2.5 h-2.5 text-slate-600 dark:text-white group-hover:text-white" />
                              : <Play className="w-2.5 h-2.5 text-slate-600 dark:text-white group-hover:text-white" />}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="p-2 space-y-1 border-t border-slate-100 dark:border-white/[0.06]">
                  {isFetching && !loading && (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-1.5 text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" /> Refreshing voices…
                    </button>
                  )}
                  {!isFetching && (
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="w-full flex items-center justify-center gap-1.5 text-left px-2 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {refreshing ? 'Refreshing…' : 'Refresh voice list'}
                    </button>
                  )}
                </div>
              </>}
        </div>
      )}
    </div>
  )
}

// ─── Main CastingSettings ─────────────────────────────────────────────────────
export default function CastingSettings({ project, onUpdate, onClose, onContinue, onRegenProgress, continueLabel }) {
  const queryClient = useQueryClient()
  const [avatarId, setAvatarId] = useState(project?.defaultAvatarId || '')
  const [voiceId, setVoiceId] = useState(project?.defaultVoiceId || '')
  const [avatarGender, setAvatarGender] = useState(null)
  const [saved, setSaved] = useState(false)
  const [regenerateAfterSave, setRegenerateAfterSave] = useState(false)
  const [regenProgress, setRegenProgress] = useState(null) // { done, total } | null
  const [regenError, setRegenError] = useState(null)

  // Re-sync local state whenever the project prop actually changes (e.g. after
  // a fresh load, or after another part of the app updates casting) — this was
  // the bug where the picker kept showing stale values after switching casting.
  useEffect(() => {
    setAvatarId(project?.defaultAvatarId || '')
    setVoiceId(project?.defaultVoiceId || '')
  }, [project?.id, project?.defaultAvatarId, project?.defaultVoiceId])

  // Look up the gender of whatever avatar is already saved on the project so
  // the voice picker can flag/filter a mismatch even before the user touches
  // the avatar picker in this session.
  const { data: avatarsRes } = useQuery(AVATARS_QUERY)
  useEffect(() => {
    if (!avatarId || avatarGender) return
    const a = avatarsRes?.avatars?.find(a => a.avatar_id === avatarId)
    if (a) setAvatarGender(normGender(a.gender))
  }, [avatarId, avatarsRes, avatarGender])

  const regenerateAllVoices = async (newVoiceId) => {
    if (!newVoiceId) return
    setRegenError(null)
    try {
      const scripts = await scriptsService.listByProject(project.id)
      let allScenes = []
      for (const script of scripts) {
        if (!script.moduleId) continue
        try {
          const res = await fetch(`/api/modules/${script.moduleId}/scenes`)
          if (res.ok) {
            const scenes = await res.json()
            allScenes = allScenes.concat(scenes || [])
          }
        } catch (e) {
          console.error('Failed to fetch scenes for script:', script.id, e)
        }
      }
      // Only regenerate scenes that already had audio — scenes with no audio yet
      // will naturally pick up the new voice when first generated.
      const targets = allScenes.filter(s => s.ttsAudioUrl)
      setRegenProgress({ done: 0, total: targets.length })
      onRegenProgress?.({ done: 0, total: targets.length })
      for (let i = 0; i < targets.length; i++) {
        try {
          await agentsService.runGenerateTTS(targets[i].id, newVoiceId, undefined, undefined)
        } catch (e) {
          // keep going — one bad scene shouldn't block the rest
        }
        setRegenProgress({ done: i + 1, total: targets.length })
        onRegenProgress?.({ done: i + 1, total: targets.length })
        // Keep the Voice panel's scene list live as each scene's audio updates.
        queryClient.invalidateQueries({ queryKey: ['scenes'] })
      }
      onUpdate?.()
    } catch (e) {
      setRegenError(e?.message || 'Failed to regenerate voice for existing scenes.')
    } finally {
      setTimeout(() => setRegenProgress(null), 2500)
      onRegenProgress?.(null)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => projectsService.update(project.id, {
      default_avatar_id: avatarId || null,
      default_voice_id: voiceId || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] })
      onUpdate?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      if (regenerateAfterSave) {
        // When the caller wants instant navigation (e.g. the Script→Voice gate),
        // fire the regen in the background instead of awaiting it — Save (and
        // onContinue) return immediately, and progress is reported via
        // onRegenProgress so the next screen can show a non-blocking banner.
        if (onContinue) {
          regenerateAllVoices(voiceId)
          onContinue()
          return
        }
        // Standalone usage (gear button, no onContinue) keeps the original
        // blocking behavior so the user sees the in-place progress state.
        regenerateAllVoices(voiceId)
        return
      }

      if (onContinue) onContinue()
    },
  })

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mic2 className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white tracking-wide">Choose Your Voice</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a voice and start generating audio
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 tracking-wide font-medium">
            VOICE
          </label>
          <VoicePicker value={voiceId} onChange={(id) => setVoiceId(id)} genderHint={avatarGender} />
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Your voice for narration</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={regenerateAfterSave}
            onChange={e => setRegenerateAfterSave(e.target.checked)}
            className="mt-0.5 accent-indigo-500"
          />
          <span>
            Also regenerate audio for scenes that already have voice, using the new voice
          </span>
        </label>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || (!onContinue && !!regenProgress)}
          className="w-full"
        >
          {saveMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : !onContinue && regenProgress
            ? <><Loader2 className="w-4 h-4 animate-spin" />Regenerating voice {regenProgress.done}/{regenProgress.total}…</>
            : saved
            ? <><CheckCircle className="w-4 h-4" />Saved!</>
            : <><Save className="w-4 h-4" />{continueLabel || 'Save & Generate Voice'}</>}
        </Button>

        {saveMutation.isError && (
          <p className="text-xs text-red-500 dark:text-red-400 text-center">{saveMutation.error?.message}</p>
        )}
        {regenError && (
          <p className="text-xs text-red-500 dark:text-red-400 text-center">{regenError}</p>
        )}
      </div>

      <div className="mt-6 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/[0.06]">
        <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed">
          <strong className="text-slate-600 dark:text-slate-400">Tip:</strong> Choose your voice once and it will be applied to all scenes automatically.
        </p>
      </div>
    </div>
  )
}
