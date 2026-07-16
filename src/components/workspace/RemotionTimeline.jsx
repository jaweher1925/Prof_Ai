/**
 * Enhanced Remotion-Style Timeline Component
 * 
 * Professional timeline showing ALL scenes in a module merged together:
 * - Multiple draggable track blocks (one per scene) with unified timeline view
 * - Time ruler with markers (continuously through all scenes)
 * - Playhead scrubber for module-wide playback
 * - Play/pause controls for preview
 * - Zoom controls for detailed editing
 * - Avatar indicator on each scene block
 * - Scene selection synchronization
 */

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, ZoomIn, ZoomOut, Volume2, Users } from 'lucide-react'

const DEFAULT_SCENE_DURATION = 5000 // 5 seconds in ms
const PIXELS_PER_SECOND = 100 // Base pixels per second
const TRACK_HEIGHT = 70 // Height of each track (increased for better UI)

export default function RemotionTimeline({ 
  scenes = [], 
  currentScene = null, 
  onSceneSelect = () => {},
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [draggingPlayhead, setDraggingPlayhead] = useState(false)
  const timelineRef = useRef(null)
  const playheadRef = useRef(null)

  // Calculate total duration by summing all scene durations
  const totalDuration = scenes.reduce((sum, scene) => {
    // Try to get duration from audio or estimated from composition
    const audioDuration = scene.ttsAudioUrl ? (scene.durationSeconds || DEFAULT_SCENE_DURATION / 1000) * 1000 : DEFAULT_SCENE_DURATION
    return sum + audioDuration
  }, 0)

  // Auto-play loop
  useEffect(() => {
    if (!isPlaying) return
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= totalDuration) {
          setIsPlaying(false)
          return 0
        }
        return prev + 16 // ~60fps
      })
    }, 16)
    
    return () => clearInterval(interval)
  }, [isPlaying, totalDuration])

  // Playhead dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingPlayhead || !timelineRef.current) return
      
      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(1, x / rect.width))
      setCurrentTime(percentage * totalDuration)
    }

    const handleMouseUp = () => {
      setDraggingPlayhead(false)
    }

    if (draggingPlayhead) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [draggingPlayhead, totalDuration])

  const pixelsPerSecond = PIXELS_PER_SECOND * zoomLevel
  const totalPixels = (totalDuration / 1000) * pixelsPerSecond

  // Calculate scene positions and durations
  let sceneStart = 0
  const scenePositions = scenes.map(scene => {
    const duration = scene.ttsAudioUrl ? (scene.durationSeconds || DEFAULT_SCENE_DURATION / 1000) * 1000 : DEFAULT_SCENE_DURATION
    const start = sceneStart
    sceneStart += duration
    return { start, duration }
  })

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100 overflow-hidden rounded-lg border border-slate-700/50">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-slate-700 flex items-center justify-between gap-3 bg-slate-950/80">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-slate-100"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          
          <div className="text-xs font-mono min-w-max text-slate-400">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setZoomLevel(Math.max(0.25, zoomLevel - 0.25))}
            className="p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs min-w-[2.5rem] text-center text-slate-400">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel(Math.min(4, zoomLevel + 0.25))}
            className="p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: Track Labels */}
        <div className="w-32 flex-shrink-0 border-r border-slate-700 bg-slate-950 overflow-y-auto">
          <div className="sticky top-0 h-10 border-b border-slate-700 bg-slate-900/80 flex items-center px-2">
            <span className="text-xs font-semibold text-slate-400">Scenes</span>
          </div>
          {scenes.map((scene, idx) => (
            <div
              key={scene.id}
              className={`h-[70px] border-b border-slate-700 px-2 py-1.5 flex flex-col items-start justify-center text-xs cursor-pointer transition-colors ${
                currentScene?.id === scene.id
                  ? 'bg-indigo-900/30 text-indigo-300'
                  : 'hover:bg-slate-800/50 text-slate-400'
              }`}
              onClick={() => onSceneSelect(scene)}
              title={scene.slideComposition?.title || `Scene ${idx + 1}`}
            >
              <div className="font-semibold">Scene {idx + 1}</div>
              <div className="text-[10px] opacity-70 truncate w-full">
                {(scene.slideComposition?.title || 'Untitled').slice(0, 14)}
              </div>
              {scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:') && (
                <div className="text-[10px] text-green-400 mt-0.5 flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" />Avatar
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: Timeline Tracks */}
        <div className="flex-1 min-w-0 overflow-auto relative">
          <div
            ref={timelineRef}
            className="relative bg-slate-950 select-none"
            style={{ width: `${Math.max(400, totalPixels + 100)}px`, minHeight: '100%' }}
          >
            {/* Time Ruler Header */}
            <TimelineRuler
              totalDuration={totalDuration}
              pixelsPerSecond={pixelsPerSecond}
            />

            {/* Scene Blocks (Merged Timeline) */}
            <div className="absolute top-10 left-0 right-0">
              {scenes.map((scene, idx) => {
                const pos = scenePositions[idx]
                const isSelected = currentScene?.id === scene.id
                const hasVideo = !!scene.avatarVideoUrl && !scene.avatarVideoUrl?.startsWith('heygen:')
                const hasAudio = !!scene.ttsAudioUrl

                return (
                  <div
                    key={scene.id}
                    className={`absolute cursor-pointer group transition-all rounded-md overflow-hidden ${
                      isSelected
                        ? 'ring-2 ring-indigo-500 border border-indigo-400'
                        : hasVideo
                        ? 'border border-green-600/80 hover:border-green-500'
                        : hasAudio
                        ? 'border border-blue-600/60 hover:border-blue-500'
                        : 'border border-slate-600/40 hover:border-slate-500'
                    }`}
                    style={{
                      left: `${(pos.start / 1000) * pixelsPerSecond}px`,
                      width: `${(pos.duration / 1000) * pixelsPerSecond}px`,
                      height: `${TRACK_HEIGHT - 4}px`,
                      top: `${(idx * TRACK_HEIGHT) + 4}px`,
                      backgroundColor: isSelected
                        ? 'rgba(99, 102, 241, 0.15)'
                        : hasVideo
                        ? 'rgba(34, 197, 94, 0.12)'
                        : hasAudio
                        ? 'rgba(59, 130, 246, 0.12)'
                        : 'rgba(100, 116, 139, 0.08)',
                    }}
                    onClick={() => onSceneSelect(scene)}
                  >
                    <div className="w-full h-full p-2 flex flex-col justify-between">
                      <div>
                        <div className="text-[11px] font-semibold truncate">
                          {scene.slideComposition?.title || `Scene ${idx + 1}`}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-[9px] opacity-75">
                          {formatTime(pos.duration)}
                        </div>
                        <div className="flex gap-1">
                          {hasVideo && (
                            <div className="text-[9px] text-green-300 font-medium bg-green-900/40 px-1 py-0.5 rounded">
                              ✓ Video
                            </div>
                          )}
                          {hasAudio && !hasVideo && (
                            <div className="text-[9px] text-blue-300 font-medium bg-blue-900/40 px-1 py-0.5 rounded">
                              ♪ Audio
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Visual Indicator for Avatar */}
                    {hasVideo && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" title="Avatar video ready" />
                    )}

                    {/* Hover Resize Handle */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1/3 bg-slate-400 opacity-0 group-hover:opacity-100 cursor-col-resize hover:bg-indigo-400 transition-all rounded-full" />
                  </div>
                )
              })}
            </div>

            {/* Playhead */}
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 cursor-grab active:cursor-grabbing"
              style={{
                left: `${totalDuration > 0 ? (currentTime / totalDuration) * (totalPixels || 100) : 0}px`,
              }}
              onMouseDown={() => setDraggingPlayhead(true)}
            >
              {/* Playhead Triangle */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45 shadow-lg" />
            </div>

            {/* Time Grid Lines */}
            <TimelineGridLines
              totalDuration={totalDuration}
              pixelsPerSecond={pixelsPerSecond}
              trackCount={scenes.length}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineRuler({ totalDuration, pixelsPerSecond }) {
  const seconds = Math.ceil(totalDuration / 1000)
  const markers = []
  
  // Create markers - adjust interval based on total duration
  const interval = seconds > 60 ? 10 : seconds > 30 ? 5 : 1
  for (let i = 0; i <= seconds; i += interval) {
    markers.push(i * 1000)
  }

  return (
    <div className="sticky top-0 h-10 border-b border-slate-700 bg-slate-900 flex select-none z-10 overflow-hidden">
      {markers.map((time, idx) => {
        const nextTime = markers[idx + 1] ?? totalDuration
        const width = ((nextTime - time) / 1000) * pixelsPerSecond

        return (
          <div
            key={idx}
            className="relative border-r border-slate-700 text-xs text-slate-400 px-1 flex items-center flex-shrink-0"
            style={{ width: `${width}px`, minWidth: 50 }}
          >
            <span className="text-xs">{formatTime(time)}</span>
          </div>
        )
      })}
    </div>
  )
}

function TimelineGridLines({ totalDuration, pixelsPerSecond, trackCount }) {
  const seconds = Math.ceil(totalDuration / 1000)
  const lines = []
  
  const interval = seconds > 60 ? 10 : seconds > 30 ? 5 : 1
  for (let i = 0; i <= seconds; i += interval) {
    lines.push(i * 1000)
  }

  return (
    <>
      {lines.map((time, idx) => (
        <div
          key={idx}
          className="absolute top-10 bottom-0 border-l border-slate-800/40"
          style={{
            left: `${(time / 1000) * pixelsPerSecond}px`,
          }}
        />
      ))}
    </>
  )
}

function formatTime(ms) {
  if (!ms) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
