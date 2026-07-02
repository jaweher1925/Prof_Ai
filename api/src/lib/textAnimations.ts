/**
 * Text Animation System with Custom Timings
 * 
 * Supports frame-accurate text reveals with custom start/duration timings.
 * Works with both FFmpeg (video generation) and React (Visual Designer preview).
 */

export interface TextAnimationTiming {
  elementIndex: number  // Which element (0=title, 1+=bullets/content)
  startMs: number       // When to start reveal (milliseconds from segment start)
  durationMs: number    // How long reveal takes (milliseconds)
  type?: 'fade' | 'slide-up' | 'typewriter' | 'scale'  // Animation style
}

export interface TextAnimationSettings {
  timings: TextAnimationTiming[]
  overallDuration?: number  // Total segment duration in ms (for safety checks)
}

/**
 * Generate default timings for a segment with N text elements
 * Spaces them evenly across the segment duration
 */
export function generateDefaultTimings(
  elementCount: number,
  segmentDurationMs: number
): TextAnimationTiming[] {
  if (elementCount === 0) return []
  
  const timings: TextAnimationTiming[] = []
  const staggerDelayMs = 150  // Delay between each element
  const revealDurationMs = 600  // How long each reveal takes
  
  for (let i = 0; i < elementCount; i++) {
    const startMs = i * staggerDelayMs
    timings.push({
      elementIndex: i,
      startMs,
      durationMs: revealDurationMs,
      type: 'fade',
    })
  }
  
  return timings
}

/**
 * Parse timing JSON string into structured object
 */
export function parseTimings(jsonStr?: string): TextAnimationSettings {
  if (!jsonStr) {
    return { timings: [] }
  }
  
  try {
    return JSON.parse(jsonStr)
  } catch {
    return { timings: [] }
  }
}

/**
 * Generate FFmpeg drawtext filter strings for text animations
 * Each text element gets a drawtext filter with custom timing
 * 
 * Example output:
 * "drawtext=text='Element 0':x=100:y=200:fontsize=24:alpha='if(lt(t\,0.1)\,0\,if(lt(t\,0.7)\,(t-0.1)/0.6\,1))'"
 */
export function generateFFmpegTextFilters(
  texts: string[],
  timings: TextAnimationTiming[],
  positionX: number = 100,
  positionY: number = 100,
  fontsize: number = 24
): string[] {
  const filters: string[] = []
  const lineHeight = fontsize * 1.3
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i].replace(/'/g, "\\'")  // Escape single quotes
    const timing = timings.find(t => t.elementIndex === i)
    
    if (!timing) {
      // No timing for this element, keep it visible from start
      const y = positionY + i * lineHeight
      filters.push(
        `drawtext=text='${text}':x=${positionX}:y=${y}:fontsize=${fontsize}:fontcolor=white`
      )
    } else {
      // Calculate alpha blend for fade effect
      const startSec = timing.startMs / 1000
      const endSec = (timing.startMs + timing.durationMs) / 1000
      const y = positionY + i * lineHeight
      
      // Alpha expression: 0 before start, ramps from 0-1 during duration, 1 after
      const alphaExpr = `if(lt(t\\,${startSec})\\,0\\,if(lt(t\\,${endSec})\\,(t-${startSec})/${timing.durationMs / 1000}\\,1))`
      
      filters.push(
        `drawtext=text='${text}':x=${positionX}:y=${y}:fontsize=${fontsize}:fontcolor=white:alpha='${alphaExpr}'`
      )
    }
  }
  
  return filters
}

/**
 * Generate CSS animation keyframes for React/Visual Designer preview
 * Creates @keyframes that can be applied to text elements
 */
export function generateCSSAnimations(timings: TextAnimationTiming[]): string {
  let css = '@keyframes textReveal {\n'
  
  if (timings.length === 0) {
    // Default: fade in over 0.6s
    css += '  0% { opacity: 0; }\n'
    css += '  100% { opacity: 1; }\n'
    css += '}\n'
    return css
  }
  
  // Find max timing to determine animation duration
  const maxMs = Math.max(...timings.map(t => t.startMs + t.durationMs))
  
  for (let i = 0; i <= 100; i++) {
    const ms = (i / 100) * maxMs
    css += `  ${i}% {\n`
    
    // For each element, calculate opacity at this time
    const opacities: string[] = []
    for (let elementIdx = 0; elementIdx < 5; elementIdx++) {
      const timing = timings.find(t => t.elementIndex === elementIdx)
      if (!timing) {
        opacities.push('opacity-' + elementIdx + ': 1;')
      } else {
        if (ms < timing.startMs) {
          opacities.push('opacity-' + elementIdx + ': 0;')
        } else if (ms < timing.startMs + timing.durationMs) {
          const progress = (ms - timing.startMs) / timing.durationMs
          opacities.push(`opacity-` + elementIdx + `: ${progress};`)
        } else {
          opacities.push('opacity-' + elementIdx + ': 1;')
        }
      }
    }
    css += '  }\n'
  }
  
  css += '}\n'
  return css
}

/**
 * Calculate reveal progress (0-1) for an element at a given time
 * Used by React components for real-time animation preview
 */
export function getRevealProgress(
  elementIndex: number,
  currentTimeMs: number,
  timings: TextAnimationTiming[]
): number {
  const timing = timings.find(t => t.elementIndex === elementIndex)
  if (!timing) return 1  // Visible if no timing specified
  
  if (currentTimeMs < timing.startMs) return 0
  if (currentTimeMs >= timing.startMs + timing.durationMs) return 1
  
  const elapsed = currentTimeMs - timing.startMs
  return elapsed / timing.durationMs
}
