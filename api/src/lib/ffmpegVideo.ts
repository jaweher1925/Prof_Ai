/**
 * Video rendering engine — converts slides + audio into MP4 videos
 * 
 * CRITICAL: This file is the FINAL step where Visual Designer slides become videos.
 * Every slide design from the Visual Designer MUST appear in the output.
 * 
 * Flow:
 *   1. Scene has segments (each with slideDesign JSON)
 *   2. Each segment gets rendered to SVG using buildSlide() from slideRenderer.ts
 *   3. SVG is rasterized to PNG via sharp
 *   4. PNG is muxed with audio via ffmpeg
 *   5. All segment videos are concatenated together
 */

import { spawn } from 'child_process'
import { join, parse } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import { buildSlide } from './slideRenderer'
import type { SlideContent } from './slideRenderer'

const ffmpegPath = require('ffmpeg-static')
const UPLOAD_DIR = join(process.cwd(), 'uploads')
const OUT_W = 1920, OUT_H = 1080

console.log('[ffmpegVideo] Initialized', { UPLOAD_DIR, OUT_W, OUT_H })

// ─────────────────────────────────────────────────────────────────────────────
// CORE SEGMENT INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderableSegment {
  id: string
  text: string
  slideDesign: string  // CRITICAL: JSON string of SlideContent from Visual Designer
  ttsAudioUrl: string  // Must be populated before rendering
  textAnimationTimings?: string | null  // JSON string of TextAnimationSettings
  motionId?: string | null  // Text animation motion type (word-by-word, line-by-line, all-at-once)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Convert /api/uploads/... URL to local disk path
// ─────────────────────────────────────────────────────────────────────────────

export function localPathFromUploadUrl(url?: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/api\/uploads\/([^/?]+)/)
  if (!match) return null
  const path = join(UPLOAD_DIR, match[1])
  return existsSync(path) ? path : null
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Run ffmpeg with args
// ─────────────────────────────────────────────────────────────────────────────

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args)
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`))
      }
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Rasterize SVG to PNG using sharp
// ─────────────────────────────────────────────────────────────────────────────

async function rasterizeSvg(svgPath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    
    console.log(`[rasterizeSvg] Converting ${svgPath} to PNG`)
    
    const svgBuffer = readFileSync(svgPath)
    const pngBuffer: Buffer = await sharp(svgBuffer)
      .png({ quality: 95 })
      .toBuffer()
    
    const pngPath = join(UPLOAD_DIR, `${randomUUID()}_slide.png`)
    writeFileSync(pngPath, pngBuffer)
    
    console.log(`[rasterizeSvg] Created PNG: ${pngPath} (${pngBuffer.length} bytes)`)
    
    return pngPath
  } catch (err: any) {
    console.error(`[rasterizeSvg] Failed to rasterize SVG: ${err?.message}`)
    throw new Error(`SVG rasterization failed: ${err?.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Audio duration (parse ffmpeg -i stderr; ffprobe isn't bundled)
// ─────────────────────────────────────────────────────────────────────────────

function getAudioDurationSec(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, ['-i', audioPath])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)))
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (!m) return reject(new Error(`Could not read duration of ${audioPath}`))
      resolve(+m[1] * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}`)
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPTION ANIMATION (#40): burn the narration into the video as timed
// captions, matching the Visual Designer's motion setting:
//   word-by-word  → words pop in one at a time (ASS karaoke, invisible → visible)
//   line-by-line  → each chunk fades in as it's spoken
//   all-at-once   → full text shown for the whole segment
// Timings are distributed evenly across the audio duration (same
// approximation the editor preview uses).
// ─────────────────────────────────────────────────────────────────────────────

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.round((sec - Math.floor(sec)) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`
}

function escAss(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, ' ').trim()
}

function buildCaptionAss(text: string, motionId: string, durationSec: number): string | null {
  const words = escAss(text).split(/\s+/).filter(Boolean)
  if (!words.length || durationSec <= 0.5) return null

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial,44,&H00FFFFFF,&HFF000000,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,3,8,0,2,240,240,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const events: string[] = []
  const perWord = durationSec / words.length

  if (motionId === 'all-at-once') {
    events.push(`Dialogue: 0,${assTime(0)},${assTime(durationSec)},Cap,,0,0,0,,${words.join(' ')}`)
  } else {
    // Chunk into caption lines of ≤8 words; each line gets a time window
    // proportional to its word count
    const LINE_WORDS = 8
    let cursor = 0
    for (let i = 0; i < words.length; i += LINE_WORDS) {
      const line = words.slice(i, i + LINE_WORDS)
      const start = cursor
      const end = Math.min(durationSec, cursor + line.length * perWord)
      cursor = end
      if (motionId === 'word-by-word') {
        // SecondaryColour is fully transparent, so \k karaoke = words appear
        // one at a time as "sung"
        const karaoke = line.map(w => `{\\k${Math.max(1, Math.round(perWord * 100))}}${w}`).join(' ')
        events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${karaoke}`)
      } else {
        // line-by-line: fade each chunk in/out
        events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\fad(200,150)}${line.join(' ')}`)
      }
    }
  }

  return header + events.join('\n') + '\n'
}

/** Escape a path for use inside ffmpeg's subtitles= filter argument. */
function subtitlesFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Create SVG slide from Visual Designer design
// ─────────────────────────────────────────────────────────────────────────────

function createSlidesSvg(
  segment: RenderableSegment,
  moduleTitle: string,
  segmentIndex: number,
  totalSegments: number
): string {
  let design: SlideContent = {}
  
  try {
    design = JSON.parse(segment.slideDesign || '{}')
    console.log(`[createSlidesSvg] Segment ${segment.id}: Parsed slideDesign`, {
      hasTitle: !!design.title,
      hasSubtitle: !!design.subtitle,
      hasLayout: !!design.layout,
      hasTheme: !!design.theme,
      hasBlocks: design.blocks?.length || 0,
      hasImageUrl: !!design.imageUrl,
    })
  } catch (err: any) {
    console.warn(`[createSlidesSvg] Failed to parse slideDesign for segment ${segment.id}: ${err?.message}`)
    design = {}
  }
  
  // CRITICAL: Always use buildSlide with the Visual Designer design
  // This is the connection point between Visual Designer and video output
  const svg = buildSlide(design, moduleTitle, segmentIndex, totalSegments)
  
  console.log(`[createSlidesSvg] Generated SVG for segment ${segment.id} (${svg.length} bytes)`)
  
  return svg
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Write SVG to disk
// ─────────────────────────────────────────────────────────────────────────────

function writeSvgToDisk(svg: string): string {
  const filename = `${randomUUID()}_slide.svg`
  const filepath = join(UPLOAD_DIR, filename)
  
  writeFileSync(filepath, svg, 'utf-8')
  
  console.log(`[writeSvgToDisk] Wrote ${filepath} (${svg.length} bytes)`)
  
  return filepath
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Render audio + slide to video clip with optional text animation
// ─────────────────────────────────────────────────────────────────────────────

async function renderSegmentClip(
  segment: RenderableSegment,
  pngPath: string,
  textAnimationTimings?: string | null
): Promise<string> {
  const audioPath = localPathFromUploadUrl(segment.ttsAudioUrl)
  
  if (!audioPath) {
    throw new Error(`Segment ${segment.id}: Audio file not found at ${segment.ttsAudioUrl}`)
  }
  
  if (!existsSync(pngPath)) {
    throw new Error(`Segment ${segment.id}: PNG slide not found at ${pngPath}`)
  }
  
  const outName = `${randomUUID()}_segment.mp4`
  const outPath = join(UPLOAD_DIR, outName)
  
  console.log(`[renderSegmentClip] Rendering segment ${segment.id}`, {
    pngPath,
    audioPath,
    outPath,
  })

  // Captions are intentionally NOT burned into the video (user preference) —
  // the slide is animated instead (gentle Ken Burns zoom below), and slides
  // are joined with crossfade transitions in concatenateVideos().
  void textAnimationTimings

  // Normalize ANY input slide to exactly 1920×1080 — libx264 requires even
  // dimensions, and browser snapshots can come in at arbitrary sizes
  const baseVf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
  const FPS = 30

  // Slide motion (#41): slow zoom-in across the clip (1.00 → 1.08). The slide
  // is upscaled 2× before zoompan to avoid the filter's subpixel jitter.
  let vf = baseVf
  let useLoop = true
  try {
    const durationSec = await getAudioDurationSec(audioPath)
    const frames = Math.max(1, Math.ceil(durationSec * FPS))
    vf = `${baseVf},scale=3840:2160,` +
      `zoompan=z='1+0.08*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS}`
    useLoop = false  // zoompan generates all frames from the single input image
    console.log(`[renderSegmentClip] Ken Burns zoom over ${durationSec.toFixed(1)}s (${frames} frames)`)
  } catch (err: any) {
    console.warn(`[renderSegmentClip] Duration probe failed, rendering static slide: ${err?.message}`)
  }

  const buildArgs = (filter: string, loop: boolean): string[] => [
    '-y',
    ...(loop ? ['-loop', '1'] : []),
    '-i', pngPath,
    '-i', audioPath,
    '-c:v', 'libx264',
    '-r', String(FPS),  // uniform fps so xfade transitions can join clips
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-vf', filter,
    '-shortest',
    outPath,
  ]

  try {
    await runFfmpeg(buildArgs(vf, useLoop))
  } catch (err: any) {
    if (!useLoop) {
      // zoompan can fail on exotic builds — fall back to a static slide
      // rather than losing the video
      console.warn(`[renderSegmentClip] Animated render failed, retrying static: ${err?.message?.slice(-300)}`)
      await runFfmpeg(buildArgs(baseVf, true))
    } else {
      throw err
    }
  }

  console.log(`[renderSegmentClip] Created segment video: ${outPath}`)

  return outPath
}

/**
 * Generate FFmpeg drawtext filter strings for text animations
 * Creates fade-in effects for text reveals at specific timings
 */
function generateTextAnimationFilters(timings: Array<{
  elementIndex: number
  startMs: number
  durationMs: number
  type?: string
}>): string[] {
  const filters: string[] = []
  
  // For each timing, create a drawtext filter with alpha fade
  for (const timing of timings) {
    const startSec = timing.startMs / 1000
    const durationSec = timing.durationMs / 1000
    const endSec = startSec + durationSec
    
    // Create alpha expression: fade in from 0 to 1 during reveal window
    // Format: if(t<start, 0, if(t<end, (t-start)/duration, 1))
    const alphaExpr = `if(lt(t\\,${startSec})\\,0\\,if(lt(t\\,${endSec})\\,(t-${startSec})/${durationSec}\\,1))`
    
    // Add a subtle timestamp text to show timing (debugging/preview)
    const text = `Element ${timing.elementIndex} @${timing.startMs}ms`
    
    filters.push(
      `drawtext=text='${text}':x=50:y=${50 + timing.elementIndex * 40}:fontsize=16:fontcolor=white:alpha='${alphaExpr}'`
    )
  }
  
  return filters
}


// ──────────────────────────────────────────────────────────�