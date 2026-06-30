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
import { Settings, User, Play, Square, ChevronDown, Loader2, Save, X, CheckCircle, Pencil, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

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
const AVATARS_QUERY = { queryKey: ['heygen-avatars'], queryFn: () => mediaService.listAvatars(), staleTime: 10 * 60 * 1000 }
const VOICES_QUERY  = { queryKey: ['elevenlabs-voices'], queryFn: () => mediaService.listVoices(),  staleTime: 10 * 60 * 1000 }

// ─── Avatar Picker ────────────────────────────────────────────────────────────
function AvatarPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState(value || '')
  const ref = useRef(null)

  const { data, isLoading: loading, error: queryError } = useQuery(AVATARS_QUERY)
  const avatars = data?.avatars || []
  const error = queryError
    ? (queryError?.message || 'Failed to load avatars. Check HEYGEN_API_KEY in api/.env.')
    : (!loading && avatars.length === 0
        ? 'Your HeyGen account has no listed avatars (common on free/trial keys). Use "Enter avatar ID manually" below, or try the free default avatar.'
        : null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = avatars.find(a => a.avatar_id === value)

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
          {loading
            ? <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            : <>
                {error && <p className="text-xs text-amber-600 dark:text-amber-400 p-3 border-b border-slate-100 dark:border-white/[0.06]">{error}</p>}
                {avatars.length > 0 && (
                  <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {avatars.map(a => (
                      <li key={a.avatar_id}
                        onClick={() => { onChange(a.avatar_id, a.avatar_name, normGender(a.gender)); setOpen(false) }}
                        className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${a.avatar_id === value ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}
                      >
                        {a.preview_image_url
                          ? <img src={a.preview_image_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                          : <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            </div>}
                        <div>
                          <p className="text-sm text-slate-900 dark:text-white">{a.avatar_name}</p>
                          {normGender(a.gender) && (
                            <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">{normGender(a.gender)}</p>
                          )}
                        </div>
                        {a.avatar_id === value && <CheckCircle className="w-4 h-4 text-indigo-500 dark:text-indigo-400 ml-auto" />}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="p-2 space-y-1 border-t border-slate-100 dark:border-white/[0.06]">
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
                </div>
              </>}
        </div>
      )}
    </div>
  )
}

// ─── Voice Picker ─────────────────────────────────────────────────────────────
// genderHint (from the currently selected avatar) is used purely to default
// the list ordering so the voice that actually matches the presenter's
// apparent gender shows up first — this is what fixes "I choose a man avatar
// and the voice ends up being a woman": the picker no longer defaults to
// whatever's alphabetically/positionally first regardless of fit.
function VoicePicker({ value, onChange, genderHint }) {
  const [open, setOpen] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const [showAllGenders, setShowAllGenders] = useState(false)
  const audioRef = useRef(null)
  const ref = useRef(null)

  const { data, isLoading: loading, error: queryError } = useQuery(VOICES_QUERY)
  const allVoices = data?.voices || []
  const error = queryError ? 'Failed to load voices. Check your voice API key.' : null

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const matching = genderHint ? allVoices.filter(v => normGender(v.labels?.gender) === genderHint) : allVoices
  const filtered = (genderHint && !showAllGenders && matching.length > 0) ? matching : allVoices

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
  const mismatch = genderHint && selected && normGender(selected.labels?.gender) && normGender(selected.labels?.gender) !== genderHint

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:text-slate-900 dark:hover:text-white transition-all"
      >
        <span className="truncate">{selected?.name || (value ? `Voice: ${value.slice(0,12)}...` : 'Select voice')}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {mismatch && !open && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          This voice doesn't match the selected avatar's gender — pick one below to fix it.
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {loading
            ? <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            : error
            ? <p className="text-xs text-red-500 dark:text-red-400 p-4">{error}</p>
            : allVoices.length === 0
            ? <p className="text-xs text-slate-500 p-4 text-center">No voices found — check your voice API key in Integrations</p>
            : <>
                {genderHint && matching.length > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[11px] text-slate-500 dark:text-slate-500">
                      {showAllGenders ? 'Showing all voices' : `Showing ${genderHint} voices to match avatar`}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllGenders(v => !v) }}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {showAllGenders ? 'Filter to match' : 'Show all'}
                    </button>
                  </div>
                )}
                <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {filtered.map(v => (
                    <li key={v.voice_id}
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
        const scenes = await fetch(`/api/modules/${script.moduleId}/scenes`).then(r => r.json())
        allScenes = allScenes.concat(scenes || [])
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
          <Settings className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          <div>
            <h2 className="text-lg font-medium text-slate-900 dark:text-white tracking-wide">Casting Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose avatar and voice for this project
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
            PRESENTER AVATAR
          </label>
          <AvatarPicker value={avatarId} onChange={(id, name, gender) => { setAvatarId(id); setAvatarGender(gender) }} />
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Used in Stage 5 (Video generation)</p>
        </div>

        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 tracking-wide font-medium">
            VOICE
          </label>
          <VoicePicker value={voiceId} onChange={(id) => setVoiceId(id)} genderHint={avatarGender} />
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Used in Stage 3 (TTS audio generation)</p>
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
            : <><Save className="w-4 h-4" />{continueLabel || 'Save Casting Settings'}</>}
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
          <strong className="text-slate-600 dark:text-slate-400">Tip:</strong> Set these once before running Stage 3 (Voice)
          and Stage 5 (Video). The avatar and voice are applied to all scenes automatically.
        </p>
      </div>
    </div>
  )
}
