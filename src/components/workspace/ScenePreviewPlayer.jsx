/**
 * ScenePreviewPlayer
 * Shows a scene's slide image + audio waveform + avatar positioned via 3x3 grid.
 * Uses @remotion/player when available, falls back to CSS overlay.
 */
import React, { useRef, useState, useEffect } from 'react'
import { Play, Square, Volume2 } from 'lucide-react'

const MOTION_STYLES = [
  { id: 'slow-zoom-in',  label: 'Slow Zoom In',  css: 'scale-[1.08] transition-transform duration-[6000ms]' },
  { id: 'zoom-out',      label: 'Zoom Out',       css: 'scale-100 transition-transform duration-[6000ms]' },
  { id: 'pan-left',      label: 'Pan Left',       css: '-translate-x-4 transition-transform duration-[6000ms]' },
  { id: 'pan-right',     label: 'Pan Right',      css: 'translate-x-4 transition-transform duration-[6000ms]' },
  { id: 'ken-burns',     label: 'Ken Burns',      css: 'scale-[1.06] translate-x-2 transition-transform duration-[6000ms]' },
  { id: 'static',        label: 'Static',         css: '' },
]

// 3x3 avatar position grid
const POSITIONS = [
  ['top-left',    'top-center',    'top-right'],
  ['mid-left',    'mid-center',    'mid-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]

const POSITION_STYLE = {
  'top-left':      'top-4 left-4',
  'top-center':    'top-4 left-1/2 -translate-x-1/2',
  'top-right':     'top-4 right-4',
  'mid-left':      'top-1/2 -translate-y-1/2 left-4',
  'mid-center':    'top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2',
  'mid-right':     'top-1/2 -translate-y-1/2 right-4',
  'bottom-left':   'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right':  'bottom-4 right-4',
}

export default function ScenePreviewPlayer({
  scene,
  motionStyle = 'static',
  position = 'bottom-right',
  avatarPreviewUrl = null,
  onMotionChange,
  onPositionChange,
  showControls = true,
}) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeMotion, setActiveMotion] = useState(false)

  const motionObj = MOTION_STYLES.find(m => m.id === motionStyle) || MOTION_STYLES[5]

  const handlePlayPause = () => {
    if (!audioRef.current || !scene?.ttsAudioUrl) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
      setActiveMotion(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
      setActiveMotion(true)
      setTimeout(() => setActiveMotion(false), 200) // re-trigger CSS animation
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setProgress(audio.currentTime / (audio.duration || 1))
    const onDuration = () => setDuration(audio.duration || 0)
    const onEnded = () => { setPlaying(false); setProgress(0) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [scene?.ttsAudioUrl])

  const posStyle = POSITION_STYLE[position] || POSITION_STYLE['bottom-right']

  return (
    <div className="space-y-3">
      {/* ── Video preview canvas ── */}
      <div className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-white/[0.06]"
        style={{ paddingBottom: '56.25%' }}>

        {/* Slide background */}
        {scene?.visualAssetUrl ? (
          <img
            src={scene.visualAssetUrl}
            alt="Slide"
            className={`absolute inset-0 w-full h-full object-cover origin-center ${activeMotion ? motionObj.css : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950">
            <p className="text-xs text-slate-600">No slide generated yet</p>
          </div>
        )}

        {/* Avatar placeholder / preview */}
        <div className={`absolute ${posStyle} z-10`}>
          {avatarPreviewUrl ? (
            <img src={avatarPreviewUrl} alt="Avatar"
              className="w-24 h-24 rounded-full object-cover border-2 border-white/20 shadow-xl" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-indigo-600/30 border-2 border-indigo-500/40 flex items-center justify-center backdrop-blur-sm shadow-xl">
              <span className="text-2xl">👤</span>
            </div>
          )}
        </div>

        {/* Play button overlay */}
        {scene?.ttsAudioUrl && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center group z-20"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
              ${playing ? 'bg-red-500/80 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}>
              {playing
                ? <Square className="w-5 h-5 text-white" />
                : <Play className="w-5 h-5 text-white ml-0.5" />}
            </div>
          </button>
        )}

        {/* Audio waveform progress bar */}
        {scene?.ttsAudioUrl && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-20">
            <div className="h-full bg-indigo-500 transition-all duration-100"
              style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {/* Hidden audio element */}
        {scene?.ttsAudioUrl && (
          <audio ref={audioRef} src={scene.ttsAudioUrl} preload="metadata" />
        )}

        {/* Duration badge */}
        {duration > 0 && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] text-white z-20">
            {Math.round(duration)}s
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      {showControls && (
        <>
          {/* Audio playback row */}
          <div className="flex items-center gap-3">
            <button onClick={handlePlayPause} disabled={!scene?.ttsAudioUrl}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${scene?.ttsAudioUrl
                  ? playing
                    ? 'bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30'
                    : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/30'
                  : 'bg-slate-800/50 text-slate-600 border border-white/[0.04] cursor-not-allowed'}`}>
              {playing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {playing ? 'Stop' : scene?.ttsAudioUrl ? 'Preview audio' : 'No audio yet'}
            </button>
            {scene?.ttsAudioUrl && (
              <Volume2 className="w-4 h-4 text-slate-500" />
            )}
          </div>

          {/* Motion style */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-medium">Motion Style</p>
            <div className="grid grid-cols-3 gap-1.5">
              {MOTION_STYLES.map(m => (
                <button key={m.id}
                  onClick={() => onMotionChange?.(m.id)}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${motionStyle === m.id
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-white/[0.04] hover:border-white/20 hover:text-slate-300'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3x3 avatar position */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 font-medium">Presenter Position</p>
            <div className="grid grid-cols-3 gap-1 w-32">
              {POSITIONS.map((row, ri) =>
                row.map((pos, ci) => (
                  <button key={pos}
                    onClick={() => onPositionChange?.(pos)}
                    title={pos.replace(/-/g, ' ')}
                    className={`aspect-square rounded-md border transition-all ${position === pos
                      ? 'bg-indigo-600 border-indigo-500'
                      : 'bg-slate-800 border-white/[0.06] hover:bg-slate-700 hover:border-white/20'}`}
                  >
                    {position === pos && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
            <p className="text-[10px] text-slate-600 mt-1 capitalize">{position.replace(/-/g, ' ')}</p>
          </div>
        </>
      )}
    </div>
  )
}

// Export constants for use in other components
export { MOTION_STYLES, POSITIONS, POSITION_STYLE }
