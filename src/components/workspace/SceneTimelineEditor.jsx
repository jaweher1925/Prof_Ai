/**
 * Scene Timeline Editor — Synchronize voice-over with visual element animations
 * 
 * WORKFLOW:
 * 1. User sees the slide design at the top (visual reference)
 * 2. Voice-over segments shown in middle (when narration plays)
 * 3. Timeline below extracts ALL elements from slide automatically
 * 4. User drags each element block to sync with the narration timing
 * 5. When video renders, elements appear/animate at the specified times
 *
 * This is purely about timing synchronization - no elements are added/removed,
 * only their appearance times are adjusted to match voice narration.
 */

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { scenesService } from '@/services/scenes'
import { agentsService } from '@/services/agents'
import { Volume2, RotateCcw, GripHorizontal, Play, Pause, Sparkles } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL DESIGN PREVIEW — Shows the exact slide that will be rendered
// ═══════════════════════════════════════════════════════════════════════════

function VisualSlidePreview({ composition, template = 'modern', elements = null, revealAt = null, useAvatar = true }) {
  // When revealAt is a number (only while Play is active), each piece only
  // shows once the current playback time has passed its element's
  // configured startTime — simulating how the final video reveals title,
  // key insight, and points one at a time instead of showing everything at
  // once like the static reference design does.
  const isRevealing = typeof revealAt === 'number'
  const startTimeFor = (id) => elements?.find(el => el.id === id)?.startTime ?? 0
  const isVisible = (id) => !isRevealing || revealAt >= startTimeFor(id)

  if (!composition) {
    return (
      <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-center p-4">
        <div className="text-slate-500 dark:text-slate-400">
          <p className="font-semibold mb-1">Slide Design Empty</p>
          <p className="text-xs">Content will be auto-generated when you create a slide</p>
        </div>
      </div>
    )
  }

  // Parse contentBlocks if it's a string
  let contentBlocks = []
  if (composition.contentBlocks) {
    if (typeof composition.contentBlocks === 'string') {
      try {
        contentBlocks = JSON.parse(composition.contentBlocks)
      } catch {
        contentBlocks = []
      }
    } else if (Array.isArray(composition.contentBlocks)) {
      contentBlocks = composition.contentBlocks
    }
  }

  if (!composition.title && !composition.subtitle && contentBlocks.length === 0) {
    return (
      <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-center p-4">
        <div className="text-slate-500 dark:text-slate-400">
          <p className="font-semibold mb-1">Slide design is empty</p>
          <p className="text-xs">Add title, key insight, or content points in Visual Designer</p>
        </div>
      </div>
    )
  }

  const themes = {
    modern: { bg: '#0B1220', accent: '#3B82F6', text: '#F8FAFC' },
    minimal: { bg: '#FAFAFA', accent: '#6B7280', text: '#111827' },
    vibrant: { bg: '#2A0A1A', accent: '#EC4899', text: '#FFF5F7' },
    corporate: { bg: '#111827', accent: '#F59E0B', text: '#F9FAFB' },
    ocean: { bg: '#041A2E', accent: '#06B6D4', text: '#F0FDFF' },
    forest: { bg: '#08170D', accent: '#16A34A', text: '#F0FDF4' },
    sunset: { bg: '#1F1408', accent: '#F97316', text: '#FFFBEB' },
    elegant: { bg: '#0D0D0D', accent: '#D97706', text: '#F5F5F5' },
    academic: { bg: '#0A1A0A', accent: '#10B981', text: '#F0FDF4' },
    startup: { bg: '#05070D', accent: '#58A6FF', text: '#F0F6FC' },
  }
  const theme = themes[template] || themes.modern

  // Match the Visual Designer's layout logic
  const isHeroLayout = composition.layout === 'title-hero'
  const avatarLeftEdgePct = composition.avatarX - composition.avatarWidth / 2
  const contentMaxWidthPct = Math.max(40, Math.min(65, avatarLeftEdgePct - 8))

  // Calculate box styles exactly like the Visual Designer
  const titleBoxStyle = isHeroLayout
    ? { 
        left: `${50 + composition.titleX}%`, 
        top: `${38 + composition.titleY}%`, 
        width: `${contentMaxWidthPct}%`, 
        transform: 'translate(-50%, -50%)' 
      }
    : { 
        left: `${composition.titleX}%`, 
        top: `${8 + composition.titleY}%`, 
        width: `${contentMaxWidthPct}%` 
      }

  const subtitleBoxStyle = isHeroLayout
    ? { 
        left: `${50 + composition.subtitleX}%`, 
        top: `${48 + composition.subtitleY}%`, 
        width: `${contentMaxWidthPct}%`, 
        transform: 'translate(-50%, -50%)' 
      }
    : { 
        left: `${composition.subtitleX}%`, 
        top: `${18 + composition.subtitleY}%`, 
        width: `${contentMaxWidthPct}%` 
      }

  const contentBoxOuterStyle = isHeroLayout
    ? {
        left: `${50 + composition.contentX}%`,
        top: `${62 + composition.contentY}%`,
        width: `${contentMaxWidthPct}%`,
        transform: 'translate(-50%, -50%)',
      }
    : {
        left: `${composition.contentX}%`,
        top: `${30 + composition.contentY}%`,
        width: `${contentMaxWidthPct}%`,
      }

  return (
    <div
      className="w-full aspect-video rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-lg overflow-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      <div className="relative w-full h-full">
        {/* Playback preview badge + live clock — only shown while Play is
            revealing elements progressively, so it's never mistaken for a
            permanent label on the static reference design. */}
        {isRevealing && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-mono">
            ▶ {revealAt.toFixed(1)}s
          </div>
        )}
        {/* TITLE */}
        <div
          className={`absolute pb-0 ${isHeroLayout ? 'text-center' : ''}`}
          style={{
            ...titleBoxStyle,
            padding: 'clamp(1rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)',
            opacity: isVisible('title') ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          <div 
            className="rounded-full mb-2" 
            style={{ 
              height: 'clamp(2px, 0.3vw, 3px)', 
              width: 'clamp(24px, 3vw, 40px)', 
              backgroundColor: theme.accent, 
              marginLeft: isHeroLayout ? 'auto' : 0, 
              marginRight: isHeroLayout ? 'auto' : 0 
            }} 
          />
          <h3 
            className="font-bold tracking-tight leading-tight" 
            style={{ 
              color: theme.text, 
              fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)', 
              wordBreak: 'break-word', 
              lineHeight: '1.2' 
            }}
          >
            {composition.title || 'Untitled Slide'}
          </h3>
        </div>

        {/* KEY INSIGHT (Subtitle) */}
        {composition.subtitle && (
          <div
            className={`absolute ${isHeroLayout ? 'text-center' : ''}`}
            style={{
              ...subtitleBoxStyle,
              padding: 'clamp(0.75rem, 2.5vw, 1.5rem) clamp(1rem, 4vw, 2rem) 0 clamp(1rem, 4vw, 2rem)',
              opacity: isVisible('subtitle') ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          >
            <p
              className="font-medium inline-block rounded-full"
              style={{ 
                color: theme.accent, 
                backgroundColor: `${theme.accent}15`, 
                fontSize: 'clamp(0.8rem, 2vw, 0.95rem)', 
                padding: 'clamp(0.3rem, 1vw, 0.6rem) clamp(0.6rem, 1.5vw, 1rem)', 
                wordBreak: 'break-word' 
              }}
            >
              {composition.subtitle}
            </p>
          </div>
        )}

        {/* CONTENT BLOCKS (Key Points) */}
        {contentBlocks && contentBlocks.length > 0 && (
          <div
            className={`absolute overflow-hidden ${isHeroLayout ? 'flex flex-col items-center text-center' : ''}`}
            style={{ 
              ...contentBoxOuterStyle, 
              maxHeight: '55%', 
              padding: 'clamp(0.5rem, 2vw, 2rem) clamp(0.5rem, 3vw, 2.5rem) clamp(0.5rem, 2vw, 2rem) clamp(0.5rem, 3vw, 2.5rem)' 
            }}
          >
            <div className={`grid gap-2 w-full ${isHeroLayout ? 'text-left inline-block' : ''}`}>
              {contentBlocks.map((block, blockIdx) => {
                // Respect the block's own frame choice from Visual Designer
                // (defaults to 'none') instead of always drawing a border —
                // this preview should match "no frame" slides too, not force
                // a cadre on every point regardless of what was configured.
                const applyFrame = block.cadreStyle && block.cadreStyle !== 'none'
                return (
                <div
                  key={blockIdx}
                  className="rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: applyFrame ? `${theme.text}08` : 'transparent',
                    borderLeft: applyFrame ? `2px solid ${theme.accent}` : 'none',
                    opacity: isVisible(`content-${blockIdx}`) ? 1 : 0,
                    transition: 'opacity 0.4s ease',
                  }}
                >
                  {block.text && (
                    <p 
                      className="font-semibold leading-snug" 
                      style={{ 
                        color: theme.text, 
                        fontSize: 'clamp(0.65rem, 1.2vw, 0.8rem)' 
                      }}
                    >
                      {block.text}
                    </p>
                  )}
                  {block.keyPoints && block.keyPoints.filter(Boolean).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {block.keyPoints.filter(Boolean).map((kp, kpIdx) => (
                        <p 
                          key={kpIdx} 
                          className="opacity-75 flex items-start gap-1.5" 
                          style={{ 
                            color: theme.text, 
                            fontSize: 'clamp(0.6rem, 1rem, 0.75rem)' 
                          }}
                        >
                          <span className="opacity-50 flex-shrink-0 mt-0.5">•</span> 
                          <span>{kp}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}

        {/* AVATAR PLACEHOLDER — only when "With Avatar" mode is selected;
            Voice Only renders no avatar in the final video, so showing this
            box regardless of mode was misleading. */}
        {useAvatar && (
          <div
            className="absolute flex items-center justify-center bg-indigo-500/20 border-2 border-indigo-400 rounded-lg"
            style={{
              left: `${composition.avatarX}%`,
              top: `${composition.avatarY}%`,
              width: `${composition.avatarWidth}%`,
              aspectRatio: '9/16',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="text-center pointer-events-none">
              <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300">AVATAR</div>
              <div className="w-3 h-3 text-indigo-400 mx-auto mt-1">⋮⋮</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE-OVER TIMELINE BAR — Shows audio segments
// ═══════════════════════════════════════════════════════════════════════════

function VoiceTimelineBar({ segments = [], totalDuration = 30, onTick, onPlayStateChange }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef(null)

  // Report play/pause + live time up to the parent so the slide preview and
  // element timeline above can reveal/scrub in sync with what's actually
  // playing, instead of only this waveform bar reacting to playback.
  useEffect(() => { onPlayStateChange?.(playing) }, [playing, onPlayStateChange])
  useEffect(() => { onTick?.(currentTime) }, [currentTime, onTick])

  // Calculate total time from segments, fall back to prop
  // Use durationSeconds field (from API) or duration (legacy)
  const totalTime = segments.length > 0 
    ? segments.reduce((sum, seg) => sum + (seg.durationSeconds || seg.duration || 0), 0)
    : totalDuration

  // Fallback: if no segments or zero duration, show default message
  const hasSegments = segments.length > 0 && totalTime > 0

  useEffect(() => {
    if (!audioRef.current) return
    
    if (playing) {
      audioRef.current.play().catch(err => console.error('Playback error:', err))
    } else {
      audioRef.current.pause()
    }

    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime)
      }
    }

    const handleEnded = () => {
      setPlaying(false)
      setCurrentTime(0)
    }

    audioRef.current.addEventListener('timeupdate', handleTimeUpdate)
    audioRef.current.addEventListener('ended', handleEnded)

    return () => {
      audioRef.current?.removeEventListener('timeupdate', handleTimeUpdate)
      audioRef.current?.removeEventListener('ended', handleEnded)
    }
  }, [playing])

  if (!hasSegments) {
    return (
      <div className="w-full space-y-2">
        <div className="h-10 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          Generate voice first in Stage 3: Voices
        </div>
      </div>
    )
  }

  // Get the first segment's audio URL
  const audioUrl = segments[0]?.audioUrl || segments[0]?.ttsAudioUrl

  let currentTimePos = 0
  const bars = segments.map((seg, idx) => {
    const start = currentTimePos
    const end = currentTimePos + (seg.durationSeconds || seg.duration || 0)
    const percent = ((seg.durationSeconds || seg.duration || 0) / totalTime) * 100
    const isActive = currentTime >= start && currentTime < end
    currentTimePos = end

    return (
      <div
        key={seg.id || idx}
        className={`relative flex items-center justify-center overflow-hidden transition-all cursor-pointer ${
          isActive
            ? 'bg-indigo-600/70 border-indigo-500'
            : 'bg-indigo-500/40 border-indigo-500/60 hover:bg-indigo-500/60'
        } border-r border-indigo-500/60`}
        style={{ flex: `${percent} 0 0` }}
        title={`${start.toFixed(1)}s - ${end.toFixed(1)}s: ${seg.text?.substring(0, 50) || 'Segment ' + (idx + 1)}`}
      >
        {percent > 12 && (
          <span className="text-[9px] font-bold text-indigo-900 dark:text-indigo-100 text-center px-1 line-clamp-1">
            {(seg.durationSeconds || seg.duration || 0)?.toFixed(1)}s
          </span>
        )}
      </div>
    )
  })

  return (
    <div className="w-full space-y-2">
      {/* Audio Player Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPlaying(!playing)}
          disabled={!audioUrl}
          className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white transition-colors"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400 min-w-16">
          {Math.floor(currentTime)}s / {totalTime.toFixed(0)}s
        </span>
        <div className="flex-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full cursor-pointer" onClick={(e) => {
          if (audioRef.current) {
            const rect = e.currentTarget.getBoundingClientRect()
            const percent = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = percent * totalTime
          }
        }}>
          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(currentTime / totalTime) * 100}%` }} />
        </div>
      </div>

      {/* Waveform-like visualization */}
      <div className="w-full h-10 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex shadow-sm">
        {bars}
      </div>

      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onError={(e) => console.error('Audio error:', e)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT TIMELINE TRACKS — Automatically extracted from slide design
// ═══════════════════════════════════════════════════════════════════════════

function ElementTimelineTrack({ scene, elements = [], onElementUpdate, playheadTime = null }) {
  const [dragging, setDragging] = useState(null)
  const [selected, setSelected] = useState(null)
  const containerRef = useRef(null)
  const dragStartRef = useRef(null)
  const [zoom, setZoom] = useState(0.5) // 50% zoom by default

  const segments = scene?.segments || []
  const totalTime = segments.reduce((sum, seg) => sum + (seg.durationSeconds || seg.duration || 0), 0) || 30

  const timeToPixel = (time) => (time / totalTime) * (containerRef.current?.offsetWidth || 1000) * zoom
  const pixelToTime = (px) => (px / ((containerRef.current?.offsetWidth || 1000) * zoom)) * totalTime

  const handleMouseDown = (el, e) => {
    if (e.button !== 0) return // Only left click
    e.preventDefault()
    e.stopPropagation()
    
    setSelected(el.id)
    
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    
    dragStartRef.current = {
      elementId: el.id,
      initialTime: el.startTime,
      mouseDownX: e.clientX,
      trackRect: rect,
    }
    
    setDragging(el.id)
  }

  const handleMouseMove = (e) => {
    if (!dragging || !dragStartRef.current || !containerRef.current) return
    e.preventDefault()
    e.stopPropagation()
    
    const { mouseDownX, initialTime } = dragStartRef.current
    const deltaPixels = e.clientX - mouseDownX
    const deltaTime = pixelToTime(deltaPixels)
    const newTime = Math.max(0, Math.min(initialTime + deltaTime, totalTime - 0.1))
    
    // Update visual feedback
    setDragging(prev => prev)
  }

  const handleMouseUp = (e) => {
    if (!dragging || !dragStartRef.current) {
      setDragging(null)
      dragStartRef.current = null
      return
    }

    const { mouseDownX, initialTime } = dragStartRef.current
    const deltaPixels = e.clientX - mouseDownX
    const deltaTime = pixelToTime(deltaPixels)
    const newTime = Math.max(0, Math.min(initialTime + deltaTime, totalTime - 0.1))

    const element = elements.find(el => el.id === dragging)
    if (element && Math.abs(newTime - initialTime) > 0.01) {
      onElementUpdate({
        id: dragging,
        startTime: newTime,
        duration: element.duration,
      })
    }

    setDragging(null)
    dragStartRef.current = null
  }

  const typeColors = {
    title: 'bg-blue-500 border-blue-600',
    subtitle: 'bg-purple-500 border-purple-600',
    content: 'bg-green-500 border-green-600',
  }

  // Generate timeline ruler marks
  const markInterval = totalTime > 20 ? 5 : totalTime > 10 ? 2 : 1
  const marks = []
  for (let i = 0; i <= totalTime; i += markInterval) {
    marks.push(i)
  }

  return (
    <div className="w-full space-y-2">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-2">
        <button
          onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Zoom out"
        >
          <span className="text-sm font-bold text-slate-600 dark:text-slate-400">−</span>
        </button>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(prev => Math.min(2, prev + 0.25))}
          className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Zoom in"
        >
          <span className="text-sm font-bold text-slate-600 dark:text-slate-400">+</span>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setZoom(0.5)}
          className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          title="Reset zoom"
        >
          Reset
        </button>
      </div>

      {/* Timeline container */}
      <div 
        className="w-full overflow-x-auto rounded border border-slate-200 dark:border-slate-700"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div ref={containerRef} className="relative inline-block min-w-full">
          {/* Playhead — moves across the element tracks in sync with
              playback, so this timeline and the slide preview above read as
              one synchronized view instead of two disconnected pieces. */}
          {typeof playheadTime === 'number' && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
              style={{ left: `calc(9rem + ${timeToPixel(playheadTime)}px)`, boxShadow: '0 0 4px rgba(239,68,68,0.6)' }}
            >
              <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500" />
            </div>
          )}
          {/* Timeline ruler / scale */}
          <div className="relative h-5 flex items-end border-b border-slate-300 dark:border-slate-600 ml-36">
            {marks.map((mark) => (
              <div
                key={mark}
                className="absolute flex flex-col items-center pointer-events-none"
                style={{ left: `${timeToPixel(mark)}px` }}
              >
                <div className="h-1.5 w-px bg-slate-400 dark:bg-slate-500" />
                <span className="text-[8px] text-slate-500 dark:text-slate-400 mt-0.5">{mark}s</span>
              </div>
            ))}
          </div>

          {/* Element tracks */}
          {elements.map((el) => (
            <div
              key={el.id}
              className="relative h-9 flex items-center"
            >
              {/* Label on left */}
              <div className="absolute left-0 top-0 h-9 flex items-center text-xs font-medium text-slate-700 dark:text-slate-300 w-36 pr-2 overflow-hidden truncate bg-slate-50 dark:bg-slate-800/50 z-10">
                {el.label.split(':')[0]}
              </div>

              {/* Timeline background track */}
              <div
                className="absolute left-36 right-0 top-0 bottom-0 bg-slate-100 dark:bg-slate-800/30 rounded border border-slate-200 dark:border-slate-700"
                style={{ pointerEvents: dragging === el.id ? 'none' : 'auto' }}
              />

              {/* Draggable element block */}
              <div
                className={`absolute top-1 bottom-1 rounded border-2 flex items-center px-1.5 gap-1 transition-all cursor-grab active:cursor-grabbing ${
                  dragging === el.id 
                    ? 'opacity-100 ring-2 ring-offset-1 ring-indigo-400 shadow-md' 
                    : 'opacity-85 hover:opacity-100'
                } ${typeColors[el.type] || typeColors.content} text-white`}
                style={{
                  left: `calc(9rem + ${timeToPixel(el.startTime)}px)`,
                  width: `${Math.max(50, timeToPixel(el.duration))}px`,
                  userSelect: 'none',
                }}
                onMouseDown={(e) => handleMouseDown(el, e)}
                title={`Drag to set timing. Currently: ${el.startTime.toFixed(2)}s`}
              >
                <GripHorizontal className="w-2.5 h-2.5 opacity-80 flex-shrink-0" />
              </div>

              {/* Time display on right */}
              <div className="absolute right-1 top-0 h-9 flex items-center text-[10px] text-slate-600 dark:text-slate-400 font-mono z-10 pointer-events-none bg-gradient-to-l from-white dark:from-slate-900 px-2">
                {el.startTime.toFixed(2)}s
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SceneTimelineEditor({ scene, onUpdate, useAvatar = true }) {
  const queryClient = useQueryClient()
  const [elements, setElements] = useState([])
  const [composition, setComposition] = useState(null)
  const [compLoading, setCompLoading] = useState(false)
  // Shared playback state — fed by VoiceTimelineBar's Play button, consumed
  // by both the slide preview (progressive reveal) and the element timeline
  // (moving playhead) so pressing Play shows one synchronized view instead
  // of an audio bar moving on its own with nothing else reacting to it.
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [generatingSlide, setGeneratingSlide] = useState(false)

  // Lets the user get the REAL generated slide image without leaving Video
  // Editing to go find the "Generate" button back in Visual Designer. Until
  // scene.visualAssetUrl exists, this panel falls back to a hand-rolled
  // approximation (VisualSlidePreview below) that will never pixel-match the
  // real SVG-based renderer — the fastest fix for "doesn't look like what I
  // did in Visual Design" is just generating the real thing.
  const handleGenerateSlide = async () => {
    if (!scene?.id) return
    setGeneratingSlide(true)
    try {
      await agentsService.runGenerateAsset(scene.id)
      onUpdate?.()
    } catch (err) {
      console.error('Failed to generate slide image:', err)
    } finally {
      setGeneratingSlide(false)
    }
  }

  // Fetch composition directly from the dedicated endpoint on mount
  // This ensures we get properly seeded composition data even if it wasn't
  // included in the initial scene fetch
  useEffect(() => {
    if (!scene?.id) return

    const fetchComposition = async () => {
      try {
        setCompLoading(true)
        const response = await fetch(`/api/scenes/${scene.id}/composition`, {
          headers: { 'Content-Type': 'application/json' }
        })
        if (!response.ok) throw new Error(`Failed to fetch composition: ${response.status}`)
        const data = await response.json()
        setComposition(data)
      } catch (err) {
        console.error('Error fetching composition:', err)
        setComposition(null)
      } finally {
        setCompLoading(false)
      }
    }

    fetchComposition()
  }, [scene?.id])

  // Extract all elements from slide composition automatically
  useEffect(() => {
    if (!composition) return

    const comp = composition
    // Parse contentBlocks - may be stored as JSON string or already an array
    let contentBlocks = []
    if (comp.contentBlocks) {
      if (typeof comp.contentBlocks === 'string') {
        try {
          contentBlocks = JSON.parse(comp.contentBlocks)
        } catch {
          contentBlocks = []
        }
      } else if (Array.isArray(comp.contentBlocks)) {
        contentBlocks = comp.contentBlocks
      }
    }

    const timings = comp.contentBlockTimings 
      ? (typeof comp.contentBlockTimings === 'string' 
          ? JSON.parse(comp.contentBlockTimings) 
          : comp.contentBlockTimings)
      : []

    // Build list of all elements in the slide, automatically extracted
    const allElements = []

    // 1. TITLE (always present)
    if (comp.title) {
      allElements.push({
        id: 'title',
        label: `Title: "${comp.title.substring(0, 25)}${comp.title.length > 25 ? '...' : ''}"`,
        type: 'title',
        startTime: comp.titleStartTime || 0,
        duration: comp.titleDuration || 2,
      })
    }

    // 2. KEY INSIGHT / SUBTITLE (if present)
    if (comp.subtitle) {
      allElements.push({
        id: 'subtitle',
        label: `Key Insight: "${comp.subtitle.substring(0, 25)}${comp.subtitle.length > 25 ? '...' : ''}"`,
        type: 'subtitle',
        startTime: comp.subtitleStartTime || 1,
        duration: comp.subtitleDuration || 2.5,
      })
    }

    // 3. CONTENT BLOCKS / BULLET POINTS (if present)
    // Default timing: first point appears 3s after the title (matching
    // Visual Designer's default pacing), then each following point another
    // 3s apart — a consistent rhythm instead of a shorter, one-off gap
    // before the first point.
    if (contentBlocks && Array.isArray(contentBlocks)) {
      contentBlocks.forEach((block, idx) => {
        const timing = Array.isArray(timings) ? timings.find(t => t.elementId === `content-${idx}`) : null
        allElements.push({
          id: `content-${idx}`,
          label: `Point ${idx + 1}: "${block.text.substring(0, 25)}${block.text.length > 25 ? '...' : ''}"`,
          type: 'content',
          startTime: timing?.startTime ?? (3 + idx * 3),
          duration: timing?.duration ?? 2.5,
        })
      })
    }

    setElements(allElements)
  }, [composition?.id, composition?.title, composition?.contentBlocks?.length])

  const handleUpdate = async (update) => {
    try {
      if (update.resetAll) {
        // Reset all elements to default, evenly distributed timing
        const totalTime = (scene?.segments || []).reduce((sum, s) => sum + (s.duration || 0), 0) || 30
        const timePerElement = totalTime / Math.max(elements.length, 1)
        
        const newEls = elements.map((el, i) => ({
          ...el,
          startTime: i * timePerElement,
        }))
        setElements(newEls)
        onUpdate?.(newEls)
        return
      }

      // Update element timing
      const updated = elements.map(el =>
        el.id === update.id 
          ? { ...el, startTime: update.startTime, duration: update.duration } 
          : el
      )
      setElements(updated)

      // Persist to database
      if (scene?.id) {
        await scenesService.updateElementTiming(scene.id, {
          elementId: update.id,
          startTime: update.startTime,
          duration: update.duration,
        })
        queryClient.invalidateQueries({ queryKey: ['scenes', scene.id] })
      }

      onUpdate?.(updated)
    } catch (err) {
      console.error('Error updating element timing:', err)
    }
  }

  if (!scene) {
    return <div className="flex justify-center p-8"><Spinner /></div>
  }

  // Show loading state while composition is fetching
  if (compLoading) {
    return (
      <div className="w-full space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Timeline Editor</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Synchronize visual elements with voice narration</p>
        </div>
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      </div>
    )
  }

  // Check if composition exists and has content
  if (!composition) {
    return (
      <div className="w-full space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Timeline Editor</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">Synchronize visual elements with voice narration</p>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">📋 Slide Design Empty</p>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This scene's slide design will be auto-generated when you create it in Visual Designer (Stage 4).
          </p>
        </div>
      </div>
    )
  }

  const totalTime = (scene?.segments || []).reduce((sum, s) => sum + (s.duration || 0), 0) || 30

  return (
    <div className="w-full space-y-3">
      {/* HEADER */}
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">Timeline Editor</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">Drag each element to set when it appears during the video</p>
      </div>

      {/* SLIDE PREVIEW — prefer the actual generated slide image (what
          Visual Designer produced and what really ends up in the video)
          over a re-derived CSS approximation when just looking at the
          slide. But a flattened PNG can't reveal pieces progressively, so
          while Play is running we switch to the reconstructed preview —
          it's the only way to actually show title/key-insight/points
          appearing in sync with the Element Timeline below. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Slide Design</p>
          {isPlaying ? (
            <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">▶ Playback preview</span>
          ) : scene?.visualAssetUrl && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✓ Generated</span>
          )}
        </div>
        {isPlaying ? (
          <>
            <VisualSlidePreview
              composition={composition}
              template={composition?.templateId || 'modern'}
              elements={elements}
              revealAt={playbackTime}
              useAvatar={useAvatar}
            />
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1.5">
              Simulating reveal timing from the Element Timing track below — pause to see the actual generated design.
            </p>
          </>
        ) : scene?.visualAssetUrl ? (
          <div className="w-full aspect-video rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-lg overflow-hidden bg-slate-900">
            <img src={scene.visualAssetUrl} alt="Generated slide" className="w-full h-full object-contain" />
          </div>
        ) : (
          <>
            <div className="relative">
              <VisualSlidePreview composition={composition} template={composition?.templateId || 'modern'} useAvatar={useAvatar} />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                <Button size="sm" onClick={handleGenerateSlide} disabled={generatingSlide}>
                  {generatingSlide ? (
                    <><Spinner className="w-3.5 h-3.5" />Generating…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" />Generate Real Slide Image</>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
              This is a rough approximation, not what actually renders — it won't fully match Visual Designer. Click above to generate the real slide image.
            </p>
          </>
        )}
      </div>

      {/* VOICE NARRATION TIMELINE */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Volume2 className="w-4 h-4 text-indigo-500" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Voice Timeline</p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-auto">{totalTime.toFixed(1)}s</span>
        </div>
        <VoiceTimelineBar
          segments={scene?.segments || []}
          totalDuration={totalTime}
          onPlayStateChange={setIsPlaying}
          onTick={setPlaybackTime}
        />
      </div>

      {/* ELEMENT TIMELINE */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Element Timing</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {elements.length} element{elements.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => handleUpdate({ resetAll: true })}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
        
        {elements.length === 0 ? (
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded text-xs text-slate-500 dark:text-slate-400 text-center">
            No elements to sync
          </div>
        ) : (
          <ElementTimelineTrack
            scene={scene}
            elements={elements}
            onElementUpdate={handleUpdate}
            playheadTime={isPlaying ? playbackTime : null}
          />
        )}
      </div>
    </div>
  )
}
