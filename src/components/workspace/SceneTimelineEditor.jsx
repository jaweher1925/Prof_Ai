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
import { Volume2, RotateCcw, GripHorizontal, Play, Pause, Sparkles, Star } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'

// Content points (bullets) can't be dragged/defaulted earlier than this
// (2026-08-18, "keep all the point after sec 4 in the visual design
// default") — points set earlier consistently broke the exported video's
// timed reveal. Title/subtitle are unaffected, only content-type elements.
const MIN_CONTENT_START_SEC = 4

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL DESIGN PREVIEW — Shows the exact slide that will be rendered
// ═══════════════════════════════════════════════════════════════════════════

export function VisualSlidePreview({ composition, template = 'modern', elements = null, revealAt = null, useAvatar = true, avatarImageUrl = null, avatarAnimating = false }) {
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

  // GVSU palette — keep in step with slideRenderer.ts THEMES.
  const themes = {
    modern: { bg: '#001A5C', accent: '#0ECBF0', text: '#FFFFFF' },
    minimal: { bg: '#FFFFFF', accent: '#13155C', text: '#0B1220' },
    vibrant: { bg: '#1E052C', accent: '#0ECBF0', text: '#FFFFFF' },
    corporate: { bg: '#0B0B0D', accent: '#DEC197', text: '#FFFFFF' },
    ocean: { bg: '#04182E', accent: '#0ECBF0', text: '#FFFFFF' },
    forest: { bg: '#080F26', accent: '#DEC197', text: '#FFFFFF' },
    sunset: { bg: '#2F1C13', accent: '#DEC197', text: '#FFFFFF' },
    elegant: { bg: '#000000', accent: '#DEC197', text: '#FFFFFF' },
    academic: { bg: '#FBF8F1', accent: '#0032A0', text: '#1A1206' },
    startup: { bg: '#050A24', accent: '#0ECBF0', text: '#FFFFFF' },
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
            className={`absolute rounded-lg overflow-hidden border border-white/30 shadow-lg ${avatarAnimating ? 'pa-avatar-speaking' : ''}`}
            style={{
              left: `${composition.avatarX}%`,
              top: `${composition.avatarY}%`,
              width: `${composition.avatarWidth}%`,
              aspectRatio: '9/16',
              transform: 'translate(-50%, -50%)',
              background: avatarImageUrl ? '#0f172a' : 'rgba(99,102,241,0.2)',
            }}
          >
            {avatarImageUrl ? (
              // The real presenter photo — same avatar that's composited into
              // the rendered video, so the preview actually shows who's talking
              // instead of an empty "AVATAR" placeholder box. While playing it
              // gets a subtle speaking bob (pa-avatar-speaking) so it feels alive.
              <img src={avatarImageUrl} alt="Presenter" className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-center pointer-events-none">
                <div>
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300">AVATAR</div>
                  <div className="text-[9px] text-indigo-400 mt-0.5">pick one in Casting</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE-OVER TIMELINE BAR — Shows audio segments
// ═══════════════════════════════════════════════════════════════════════════

function VoiceTimelineBar({ segments = [], totalDuration = 30, onTick, onPlayStateChange, playToken = 0, onDurationChange }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  // Which PART's audio is currently playing. A scene is several parts (hook,
  // content, …); playing the whole scene means playing each part's audio
  // back-to-back so the total time matches the full scene, not just part 1.
  const [partIndex, setPartIndex] = useState(0)
  const audioRef = useRef(null)
  // Real, browser-measured duration per part index, filled in as each
  // part's audio actually loads (2026-08-17: "it's more then 6s but i can
  // see just 6s and when line complete still can hear voice"). The DB's
  // durationSeconds per segment can drift from the real generated audio
  // file (re-generated voice, rounding, etc.) — trusting it made the
  // progress bar and "Xs / Ys" readout both finish at the STORED length
  // while the real <audio> element kept playing past it. Once a part's
  // real duration is known it overrides the DB value for every calculation
  // below, so the displayed total self-corrects instead of staying wrong
  // for the rest of the session.
  const [realDurations, setRealDurations] = useState({})

  useEffect(() => { onPlayStateChange?.(playing) }, [playing, onPlayStateChange])
  useEffect(() => { onTick?.(currentTime) }, [currentTime, onTick])

  // External "play" trigger — lets a parent outside this bar (e.g. a Play
  // button that lives elsewhere on the page) start playback here, instead of
  // requiring the user to find and click this bar's own button. Only reacts
  // to an actual increment, not the initial mount (playToken starts at 0).
  useEffect(() => {
    if (!playToken) return
    setPartIndex(0)
    setCurrentTime(0)
    setPlaying(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken])

  // Ordered list of each part's audio + its duration — real measured
  // duration (once loaded) wins over the DB's durationSeconds, see
  // realDurations above. Index here is the same index used for `partIndex`
  // and audioRef's `key`, so realDurations[i] lines up correctly even
  // though segments without a URL get filtered out first.
  const parts = segments
    .map(seg => ({ url: seg.audioUrl || seg.ttsAudioUrl, dur: seg.durationSeconds || seg.duration || 0 }))
    .filter(p => p.url)
    .map((p, i) => ({ ...p, dur: realDurations[i] ?? p.dur }))

  const totalTime = segments.length > 0
    ? parts.reduce((sum, p) => sum + p.dur, 0)
    : totalDuration

  // Report the corrected total upward — SceneTimelineEditor's own header
  // total and ElementTimelineTrack's ruler/playhead each used to compute
  // this SAME number independently from the DB's durationSeconds (see the
  // #18 comment further down: "Voice timeline show 37 sec / line show 35
  // sec / bar show 30 sec" — three places, three different answers). This
  // bar is the one place that actually measures real audio, so it's the
  // one source of truth the other two should defer to once available.
  useEffect(() => { onDurationChange?.(totalTime) }, [totalTime, onDurationChange])

  // Global time elapsed BEFORE the given part starts.
  const durBefore = (idx) => parts.slice(0, idx).reduce((s, p) => s + p.dur, 0)

  const hasSegments = parts.length > 0 && totalTime > 0
  const currentUrl = parts[partIndex]?.url || null

  useEffect(() => {
    if (!audioRef.current) return
    const el = audioRef.current

    if (playing) {
      el.play().catch(err => console.error('Playback error:', err))
    } else {
      el.pause()
    }

    const handleTimeUpdate = () => {
      // Global scene time = time already spent on earlier parts + this part's.
      setCurrentTime(durBefore(partIndex) + (el.currentTime || 0))
    }

    const handleEnded = () => {
      // Chain to the next part; when the last part ends, the whole scene is done.
      if (partIndex < parts.length - 1) {
        setPartIndex(i => i + 1)
      } else {
        setPlaying(false)
        setCurrentTime(0)
        setPartIndex(0)
      }
    }

    el.addEventListener('timeupdate', handleTimeUpdate)
    el.addEventListener('ended', handleEnded)

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate)
      el.removeEventListener('ended', handleEnded)
    }
  }, [playing, partIndex, parts.length])

  if (!hasSegments) {
    return (
      <div className="w-full space-y-2">
        <div className="h-10 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
          Generate voice first in Stage 3: Voices
        </div>
      </div>
    )
  }

  // Seek to a global scene time — find which part it lands in, switch to that
  // part's audio, and offset within it.
  const seekTo = (globalTime) => {
    const t = Math.max(0, Math.min(globalTime, totalTime))
    let idx = 0
    let acc = 0
    for (let i = 0; i < parts.length; i++) {
      if (t < acc + parts[i].dur || i === parts.length - 1) { idx = i; break }
      acc += parts[i].dur
    }
    setPartIndex(idx)
    setCurrentTime(t)
    // Apply the within-part offset once the (possibly new) source is ready.
    const within = t - durBefore(idx)
    setTimeout(() => { if (audioRef.current) { try { audioRef.current.currentTime = within } catch {} } }, 0)
  }

  return (
    <div className="w-full space-y-2">
      {/* Audio Player Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            // Starting fresh from the end/stopped → restart at part 1.
            if (!playing && currentTime >= totalTime - 0.05) { setPartIndex(0); setCurrentTime(0) }
            setPlaying(p => !p)
          }}
          disabled={!currentUrl}
          className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white transition-colors"
          title={playing ? 'Pause' : 'Play whole scene'}
        >
          {playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400 min-w-16">
          {Math.min(Math.floor(currentTime), Math.round(totalTime))}s / {totalTime.toFixed(0)}s
        </span>
        <div className="flex-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full cursor-pointer overflow-hidden" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const percent = (e.clientX - rect.left) / rect.width
          seekTo(percent * totalTime)
        }}>
          {/* Clamp to 100% — the real audio can run a bit longer than the
              estimated total, which would otherwise push the fill past the bar. */}
          <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, (currentTime / totalTime) * 100)}%` }} />
        </div>
      </div>

      {/* Hidden audio element — src is the CURRENT part; changing part swaps it
          and the play effect resumes on the new part. autoPlay keeps a chained
          part playing when the previous one ended mid-scene. */}
      {currentUrl && (
        <audio
          ref={audioRef}
          key={partIndex}
          src={currentUrl}
          autoPlay={playing}
          onLoadedMetadata={(e) => {
            const real = e.target.duration
            if (isFinite(real) && real > 0) {
              setRealDurations(prev => (prev[partIndex] === real ? prev : { ...prev, [partIndex]: real }))
            }
          }}
          onError={(e) => console.error('Audio error:', e)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT TIMELINE TRACKS — Automatically extracted from slide design
// ═══════════════════════════════════════════════════════════════════════════

function ElementTimelineTrack({ scene, elements = [], onElementUpdate, playheadTime = null, onSelect, totalTimeOverride = null }) {
  const [dragging, setDragging] = useState(null)
  const [selected, setSelected] = useState(null)
  const containerRef = useRef(null)
  const dragStartRef = useRef(null)
  const [zoom, setZoom] = useState(0.5) // 50% zoom by default

  const segments = scene?.segments || []
  // Prefer the parent's real, audio-measured total (totalTimeOverride, fed
  // from VoiceTimelineBar) over this component's own DB-derived guess — see
  // the #18 comment near SceneTimelineEditor's own totalTime for why having
  // three independent calculations of "the same" number was the bug, not
  // just this one being wrong. Falls back to the local calc only until the
  // real duration arrives (audio hasn't loaded yet) or there's no scene.
  const totalTime = totalTimeOverride ?? (segments.reduce((sum, seg) => sum + (seg.durationSeconds || seg.duration || 0), 0) || 30)

  const timeToPixel = (time) => (time / totalTime) * (containerRef.current?.offsetWidth || 1000) * zoom
  const pixelToTime = (px) => (px / ((containerRef.current?.offsetWidth || 1000) * zoom)) * totalTime

  const handleMouseDown = (el, e) => {
    if (e.button !== 0) return // Only left click
    e.preventDefault()
    e.stopPropagation()
    
    setSelected(el.id)
    // Tell the preview which element was picked so it can jump to that moment
    // and show that point on the slide.
    onSelect?.(el)

    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    
    dragStartRef.current = {
      elementId: el.id,
      initialTime: el.startTime,
      initialDuration: el.duration,
      mouseDownX: e.clientX,
      trackRect: rect,
      mode: 'move',
    }

    setDragging(el.id)
  }

  // Resize from the RIGHT edge — changes how long the point stays on screen
  // (its end time), without moving its start.
  const handleResizeMouseDown = (el, e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSelected(el.id)
    onSelect?.(el)
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    dragStartRef.current = {
      elementId: el.id,
      initialTime: el.startTime,
      initialDuration: el.duration,
      mouseDownX: e.clientX,
      trackRect: rect,
      mode: 'resize',
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

    const { mouseDownX, initialTime, initialDuration, mode } = dragStartRef.current
    const deltaTime = pixelToTime(e.clientX - mouseDownX)
    const element = elements.find(el => el.id === dragging)

    if (element && mode === 'resize') {
      // Change the END (duration) — keep at least 0.5s, and don't run past the
      // scene's total length.
      const maxDur = Math.max(0.5, totalTime - initialTime)
      const newDuration = Math.max(0.5, Math.min((initialDuration || 0) + deltaTime, maxDur))
      if (Math.abs(newDuration - (initialDuration || 0)) > 0.01) {
        onElementUpdate({ id: dragging, startTime: initialTime, duration: newDuration })
      }
    } else if (element) {
      // Move the START — the point still lasts the same amount of time.
      // Content points (bullets) are floored at MIN_CONTENT_START_SEC
      // (2026-08-18, "keep all the point after sec 4 in the visual design
      // default") — a point dragged earlier than that consistently broke the
      // exported video's reveal (logo/background missing, no animation at
      // all) despite several rounds of fixing the capture pipeline itself;
      // the underlying cause wasn't fully pinned down, so this floors the
      // UI at the known-working range rather than leaving a trap in place.
      // Title/subtitle are untouched — 0 has always worked fine for those.
      const floor = element.type === 'content' ? MIN_CONTENT_START_SEC : 0
      const newTime = Math.max(floor, Math.min(initialTime + deltaTime, totalTime - 0.1))
      if (Math.abs(newTime - initialTime) > 0.01) {
        onElementUpdate({ id: dragging, startTime: newTime, duration: element.duration })
      }
    }

    setDragging(null)
    dragStartRef.current = null
  }

  const typeColors = {
    title: 'bg-blue-500 border-blue-600',
    subtitle: 'bg-purple-500 border-purple-600',
    content: 'bg-green-500 border-green-600',
    // 2026-08-17 — images get their own color so they're visually distinct
    // from content points in the track list, not lumped in via the
    // `|| typeColors.content` fallback.
    image: 'bg-amber-500 border-amber-600',
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
              // Clamp to the track's end — the real audio can run slightly past
              // the estimated total, which would otherwise send the playhead
              // out beyond the timeline.
              style={{ left: `calc(9rem + ${timeToPixel(Math.min(playheadTime, totalTime))}px)`, boxShadow: '0 0 4px rgba(239,68,68,0.6)' }}
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

              {/* Element block — drag the body to move the START, drag the
                  right edge (handle) to change the END (how long it stays). */}
              <div
                className={`absolute top-1 bottom-1 rounded border-2 flex items-center px-1.5 gap-1 transition-all cursor-grab active:cursor-grabbing ${
                  dragging === el.id
                    ? 'opacity-100 ring-2 ring-offset-1 ring-indigo-400 shadow-md'
                    : selected === el.id
                    ? 'opacity-100 ring-2 ring-indigo-400'
                    : 'opacity-85 hover:opacity-100'
                } ${typeColors[el.type] || typeColors.content} text-white`}
                style={{
                  left: `calc(9rem + ${timeToPixel(el.startTime)}px)`,
                  width: `${Math.max(50, timeToPixel(el.duration))}px`,
                  userSelect: 'none',
                }}
                onMouseDown={(e) => handleMouseDown(el, e)}
                title={`${el.label.split(':')[0]}: ${el.startTime.toFixed(2)}s → ${(el.startTime + el.duration).toFixed(2)}s\nDrag the bar to move the start, drag the right edge to change the end.`}
              >
                <GripHorizontal className="w-2.5 h-2.5 opacity-80 flex-shrink-0" />
                {/* Right-edge resize handle — sets the END time (duration). */}
                <div
                  onMouseDown={(e) => handleResizeMouseDown(el, e)}
                  title="Drag to set when this point disappears (end time)"
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize flex items-center justify-center rounded-r hover:bg-white/25"
                >
                  <div className="w-0.5 h-3 bg-white/70 rounded-full" />
                </div>
              </div>

              {/* Start → end times on the right */}
              <div className="absolute right-1 top-0 h-9 flex items-center text-[10px] text-slate-600 dark:text-slate-400 font-mono z-10 pointer-events-none bg-gradient-to-l from-white dark:from-slate-900 px-2 whitespace-nowrap">
                {el.startTime.toFixed(1)}s → {(el.startTime + el.duration).toFixed(1)}s
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

export default function SceneTimelineEditor({ scene, onUpdate, useAvatar = true, avatarImageUrl = null, hidePreview = false, onPlayingChange, onTick, onTimelineReady, onElementSelect, playToken = 0 }) {
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
  // Real total scene duration, reported up by VoiceTimelineBar once it's
  // measured the actual audio (2026-08-17 — see the #18 comment near this
  // component's own totalTime below for the full history: three places used
  // to each compute "total duration" independently from the DB's
  // durationSeconds, which can itself drift from the real generated audio).
  // null until VoiceTimelineBar reports in; every totalTime calc in this
  // file falls back to the DB-derived guess until then.
  const [voiceTotalTime, setVoiceTotalTime] = useState(null)

  // Feed the parent (Video Editing) everything it needs to render the ONE
  // preview up top as the play surface: whether we're playing, the current
  // playback time, and the composition + element timing. That way the reveal
  // (and the animated avatar) happen in the existing top preview instead of a
  // second preview appearing down here.
  useEffect(() => { onPlayingChange?.(isPlaying) }, [isPlaying, onPlayingChange])
  useEffect(() => { onTick?.(playbackTime) }, [playbackTime, onTick])
  useEffect(() => { onTimelineReady?.({ composition, elements }) }, [composition, elements, onTimelineReady])

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
          // Math.max floors this at MIN_CONTENT_START_SEC even for a
          // PREVIOUSLY-saved sub-4s value (from before this floor existed) —
          // those were the ones actually breaking the export, so leaving
          // them displayed/used as-is would keep the trap active for any
          // scene edited before this fix.
          startTime: Math.max(MIN_CONTENT_START_SEC, timing?.startTime ?? (3 + idx * 3)),
          duration: timing?.duration ?? 2.5,
        })
      })
    }

    // 4. IMAGES (2026-08-17, "if i generate or add img should appear also
    // in the remotion and edit timeline for it") — the primary image (if
    // any) plus every extraImages entry, each its own draggable row just
    // like a content point. imageTimings/extraImages come straight from
    // compositions.ts's doGetComposition — extraImages is read fresh off
    // slideDesign on every fetch (no staleness to worry about there), while
    // imageTimings persists whatever the user's dragged here before.
    const imgTimings = comp.imageTimings || []
    const findTiming = (id) => (Array.isArray(imgTimings) ? imgTimings.find(t => t.elementId === id) : null)
    if (comp.imageUrl) {
      const t = findTiming('image')
      allElements.push({
        id: 'image',
        label: 'Image',
        type: 'image',
        startTime: t?.startTime ?? 0,
        duration: t?.duration ?? 3,
      })
    }
    if (Array.isArray(comp.extraImages)) {
      comp.extraImages.forEach((img, idx) => {
        const elId = `extraImage:${img.id}`
        const t = findTiming(elId)
        allElements.push({
          id: elId,
          label: `Image ${idx + 2}`,
          type: 'image',
          startTime: t?.startTime ?? 0,
          duration: t?.duration ?? 3,
        })
      })
    }

    setElements(allElements)
  }, [composition?.id, composition?.title, composition?.contentBlocks?.length, composition?.imageUrl, composition?.extraImages?.length])

  const handleUpdate = async (update) => {
    try {
      if (update.resetAll) {
        // Reset all elements to default, evenly distributed timing.
        // durationSeconds (not duration — see the header's totalTime below
        // for why the field name matters here) is what SceneSegment rows
        // actually carry. Prefers voiceTotalTime (real, audio-measured) over
        // the DB guess, same reasoning as the header's totalTime below.
        const totalTime = voiceTotalTime ?? ((scene?.segments || []).reduce((sum, s) => sum + (s.durationSeconds || s.duration || 0), 0) || 30)
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

  // BUG FIX (#18): this read s.duration, a field SceneSegment rows don't
  // have (they carry durationSeconds — see VoiceTimelineBar's own totalTime
  // at line ~326 and ElementTimelineTrack's at line ~459, which both already
  // read the right field). Every scene therefore fell through to the `|| 30`
  // fallback here, so the "Voice Timeline" header above the bar always
  // showed a flat 30s — DIFFERENT from the real duration VoiceTimelineBar
  // itself computes and displays inside the bar (e.g. "37s / 37s"), and
  // different again from whatever ElementTimelineTrack's ruler length ended
  // up implying. Three places computing the same number three different
  // ways, one of them silently wrong. Reported as: "Voice timeline show 37
  // sec / line show 35 sec / bar show 30 sec."
  //
  // FOLLOW-UP (2026-08-17): fixing the field name made all three read the
  // same DB column, but the DB's durationSeconds can ITSELF drift from the
  // real generated audio file (re-generated voice, rounding, etc.) — "it's
  // more then 6s but i can see just 6s and when line complete still can
  // hear voice". voiceTotalTime is VoiceTimelineBar's real, browser-measured
  // duration reported upward once available; every totalTime here and in
  // ElementTimelineTrack now defers to it instead of trusting the DB number
  // outright, so this header, the ruler, and the red playhead's clamp all
  // agree with whatever's actually playing instead of the three of them
  // (now two, post-#18) drifting again for a new reason.
  const dbTotalTime = (scene?.segments || []).reduce((sum, s) => sum + (s.durationSeconds || s.duration || 0), 0) || 30
  const totalTime = voiceTotalTime ?? dbTotalTime

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
      {/* Slide-design preview — hidden when the parent already shows a preview
          (Video Editing renders the ONE preview up top, including the play/reveal
          simulation, so nothing extra appears down here). */}
      {!hidePreview && (
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
              avatarImageUrl={avatarImageUrl}
            />
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1.5">
              Simulating reveal timing from the Element Timing track below — pause to see the actual generated design.
            </p>
          </>
        ) : scene?.visualAssetUrl ? (
          // The saved slide snapshot EXCLUDES the avatar (it's a separate
          // overlay in the render), so overlay the real presenter photo on top
          // at its designed position — otherwise the avatar "disappears" here.
          <div className="relative w-full aspect-video rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-lg overflow-hidden bg-slate-900">
            <img src={scene.visualAssetUrl} alt="Generated slide" className="w-full h-full object-contain" />
            {useAvatar && avatarImageUrl && (
              <div className="absolute rounded-lg overflow-hidden border border-white/30 shadow-lg"
                style={{
                  left: `${composition?.avatarX ?? 85}%`,
                  top: `${composition?.avatarY ?? 50}%`,
                  width: `${composition?.avatarWidth ?? 22}%`,
                  aspectRatio: '9/16',
                  transform: 'translate(-50%, -50%)',
                  background: '#0f172a',
                }}>
                <img src={avatarImageUrl} alt="Presenter" className="w-full h-full object-cover" />
              </div>
            )}
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
      )}

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
          onDurationChange={setVoiceTotalTime}
          playToken={playToken}
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
            onSelect={onElementSelect}
            totalTimeOverride={totalTime}
          />
        )}
      </div>
    </div>
  )
}
