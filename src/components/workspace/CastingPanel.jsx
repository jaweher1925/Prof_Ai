import React, { useState, useEffect, useRef } from 'react'
import { mediaService } from '@/services/media'
import { projectsService } from '@/services/projects'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Play, Square, ChevronDown, Loader2, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

function AvatarPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [avatars, setAvatars] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)
  const fetched = useRef(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen((v) => !v)
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    try { const r = await mediaService.listAvatars(); setAvatars(r?.avatars || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const selected = avatars.find((a) => a.avatar_id === value)

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-sm text-slate-300 hover:border-indigo-500/40">
        <div className="flex items-center gap-2">
          {selected?.preview_image_url
            ? <img src={selected.preview_image_url} className="w-6 h-6 rounded-full object-cover" alt="" />
            : <User className="w-4 h-4 text-slate-500" />}
          <span>{selected?.avatar_name || 'Select avatar'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
          {loading ? <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            : avatars.length === 0 ? <p className="text-center py-4 text-xs text-slate-500">No avatars found</p>
            : <ul className="max-h-52 overflow-y-auto">
                {avatars.map((a) => (
                  <li key={a.avatar_id} onClick={() => { onChange(a.avatar_id); setOpen(false) }}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-800 ${a.avatar_id === value ? 'bg-indigo-500/10' : ''}`}>
                    {a.preview_image_url
                      ? <img src={a.preview_image_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                      : <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center"><User className="w-4 h-4 text-slate-400" /></div>}
                    <p className="text-sm text-white">{a.avatar_name}</p>
                  </li>
                ))}
              </ul>}
        </div>
      )}
    </div>
  )
}

function VoicePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)
  const ref = useRef(null)
  const fetched = useRef(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = async () => {
    setOpen((v) => !v)
    if (fetched.current) return
    fetched.current = true
    setLoading(true)
    try { const r = await mediaService.listVoices(); setVoices(r?.voices || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
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

  const selected = voices.find((v) => v.voice_id === value)

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.08] text-sm text-slate-300 hover:border-indigo-500/40">
        <span>{selected?.name || 'Select voice'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-900 border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
          {loading ? <div className="flex justify-center py-4"><Spinner size="sm" /></div>
            : <ul className="max-h-52 overflow-y-auto">
                {voices.map((v) => (
                  <li key={v.voice_id} onClick={() => { onChange(v.voice_id); setOpen(false) }}
                    className={`flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-800 ${v.voice_id === value ? 'bg-indigo-500/10' : ''}`}>
                    <div>
                      <p className="text-sm text-white">{v.name}</p>
                      {v.labels?.accent && <p className="text-xs text-slate-500 capitalize">{v.labels.accent} · {v.labels.gender}</p>}
                    </div>
                    {v.preview_url && (
                      <button onClick={(e) => handlePreview(e, v)} className="w-7 h-7 rounded-full bg-slate-700 hover:bg-indigo-600 flex items-center justify-center transition-colors">
                        {playingId === v.voice_id ? <Square className="w-2.5 h-2.5 text-white" /> : <Play className="w-2.5 h-2.5 text-white" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>}
        </div>
      )}
    </div>
  )
}

export default function CastingPanel({ project, onUpdate }) {
  const queryClient = useQueryClient()
  const [avatarId, setAvatarId] = useState(project?.defaultAvatarId || '')
  const [voiceId, setVoiceId] = useState(project?.defaultVoiceId || '')

  const saveMutation = useMutation({
    mutationFn: () => projectsService.update(project.id, { default_avatar_id: avatarId, default_voice_id: voiceId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['project', project.id] }); onUpdate?.() },
  })

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-medium text-white tracking-wide mb-1">Casting</h2>
      <p className="text-xs text-slate-500 mb-6">Set the default avatar and voice for this project.</p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 tracking-wide">Presenter Avatar</label>
          <AvatarPicker value={avatarId} onChange={setAvatarId} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 tracking-wide">Voice</label>
          <VoicePicker value={voiceId} onChange={setVoiceId} />
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving…' : 'Save Casting'}
        </Button>
        {saveMutation.isSuccess && <p className="text-xs text-green-400 text-center">Saved!</p>}
      </div>
    </div>
  )
}
