/**
 * Casting Settings — gear button panel (not a pipeline stage)
 * Choose default avatar and voice for the project.
 * Sits outside the main pipeline because External API listing may incur costs.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsService } from '@/services/projects'
import { mediaService } from '@/services/media'
import { Settings, User, Play, Square, ChevronDown, Loader2, Save, X, CheckCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ─── Avatar Picker ────────────────────────────────────────────────────────────
function AvatarPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [avatars, setAvatars] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)
  const fetched = useRef(false)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen(v => !v)
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await mediaService.listAvatars()
      setAvatars(res?.avatars || [])
    } catch (e) {
      setError('Failed to load avatars. Check your avatar API key.')
    } finally {
      setLoading(false)
    }
  }

  const selected = avatars.find(a => a.avatar_id === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-white/10 text-sm text-slate-300 hover:border-indigo-500/40 hover:text-white transition-all"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected?.preview_image_url
            ? <img src={selected.preview_image_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" alt="" />
            : <User className="w-4 h-4 text-slate-500 flex-shrink-0" />}
          <span className="truncate">{selected?.avatar_name || (value ? `Avatar: ${value.slice(0,12)}...` : 'Select avatar')}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {loading
            ? <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            : error
            ? <p className="text-xs text-red-400 p-4">{error}</p>
            : avatars.length === 0
            ? <p className="text-xs text-slate-500 p-4 text-center">No avatars found</p>
            : <ul className="max-h-56 overflow-y-auto divide-y divide-white/[0.04]">
                {avatars.map(a => (
                  <li key={a.avatar_id}
                    onClick={() => { onChange(a.avatar_id, a.avatar_name); setOpen(false) }}
                    className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-slate-800 transition-colors ${a.avatar_id === value ? 'bg-indigo-500/10' : ''}`}
                  >
                    {a.preview_image_url
                      ? <img src={a.preview_image_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                      : <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>}
                    <div>
                      <p className="text-sm text-white">{a.avatar_name}</p>
                    </div>
                    {a.avatar_id === value && <CheckCircle className="w-4 h-4 text-indigo-400 ml-auto" />}
                  </li>
                ))}
              </ul>}
        </div>
      )}
    </div>
  )
}

// ─── Voice Picker ─────────────────────────────────────────────────────────────
function VoicePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)
  const ref = useRef(null)
  const fetched = useRef(false)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen(v => !v)
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await mediaService.listVoices()
      setVoices(res?.voices || [])
    } catch (e) {
      setError('Failed to load voices. Check your voice API key.')
    } finally {
      setLoading(false)
    }
  }

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

  const selected = voices.find(v => v.voice_id === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-white/10 text-sm text-slate-300 hover:border-indigo-500/40 hover:text-white transition-all"
      >
        <span className="truncate">{selected?.name || (value ? `Voice: ${value.slice(0,12)}...` : 'Select voice')}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {loading
            ? <div className="flex justify-center py-6"><Spinner size="sm" /></div>
            : error
            ? <p className="text-xs text-red-400 p-4">{error}</p>
            : voices.length === 0
            ? <p className="text-xs text-slate-500 p-4 text-center">No voices found — check your voice API key in Integrations</p>
            : <ul className="max-h-56 overflow-y-auto divide-y divide-white/[0.04]">
                {voices.map(v => (
                  <li key={v.voice_id}
                    onClick={() => { onChange(v.voice_id, v.name); setOpen(false) }}
                    className={`flex items-center justify-between gap-3 px-3 py-3 cursor-pointer hover:bg-slate-800 transition-colors ${v.voice_id === value ? 'bg-indigo-500/10' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white">{v.name}</p>
                      {v.labels?.accent && (
                        <p className="text-xs text-slate-500 capitalize">{v.labels.accent} · {v.labels.gender}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {v.voice_id === value && <CheckCircle className="w-4 h-4 text-indigo-400" />}
                      {v.preview_url && (
                        <button
                          onClick={(e) => handlePreview(e, v)}
                          className="w-7 h-7 rounded-full bg-slate-700 hover:bg-indigo-600 flex items-center justify-center transition-colors"
                        >
                          {playingId === v.voice_id
                            ? <Square className="w-2.5 h-2.5 text-white" />
                            : <Play className="w-2.5 h-2.5 text-white" />}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>}
        </div>
      )}
    </div>
  )
}

// ─── Main CastingSettings ─────────────────────────────────────────────────────
export default function CastingSettings({ project, onUpdate, onClose }) {
  const queryClient = useQueryClient()
  const [avatarId, setAvatarId] = useState(project?.defaultAvatarId || '')
  const [voiceId, setVoiceId] = useState(project?.defaultVoiceId || '')
  const [saved, setSaved] = useState(false)

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
    },
  })

  return (
    <div className="p-6 max-w-md">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-lg font-medium text-white tracking-wide">Casting Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose avatar and voice for this project
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-slate-400 mb-2 tracking-wide font-medium">
            PRESENTER AVATAR
          </label>
          <AvatarPicker value={avatarId} onChange={(id) => setAvatarId(id)} />
          <p className="text-xs text-slate-600 mt-1">Used in Stage 5 (Video generation)</p>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2 tracking-wide font-medium">
            VOICE
          </label>
          <VoicePicker value={voiceId} onChange={(id) => setVoiceId(id)} />
          <p className="text-xs text-slate-600 mt-1">Used in Stage 3 (TTS audio generation)</p>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
            : saved
            ? <><CheckCircle className="w-4 h-4" />Saved!</>
            : <><Save className="w-4 h-4" />Save Casting Settings</>}
        </Button>

        {saveMutation.isError && (
          <p className="text-xs text-red-400 text-center">{saveMutation.error?.message}</p>
        )}
      </div>

      <div className="mt-6 p-3 rounded-xl bg-slate-800/40 border border-white/[0.06]">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Tip:</strong> Set these once 