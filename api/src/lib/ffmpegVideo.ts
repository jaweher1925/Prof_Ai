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

export function getAudioDurationSec(audioPath: string): Promise<number> {
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

  // Normalize ANY input slide to exactly 1920×1080 — libx264 requires even
  // dimensions, and browser snapshots can come in at arbitrary sizes
  const baseVf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
  const FPS = 30

  // Background stays STATIC (no Ken Burns zoom) — text animation handles the motion
  // Extract text from slide design and apply animation timings
  let vf = baseVf
  let useLoop = true
  
  try {
    const durationSec = await getAudioDurationSec(audioPath)
    
    // Parse slide design to extract text content
    let slideDesign: any = {}
    try {
      slideDesign = JSON.parse(segment.slideDesign || '{}')
    } catch {
      console.warn(`[renderSegmentClip] Could not parse slide design for ${segment.id}`)
    }
    
    // Extract text elements (title + bullets)
    const textElements: string[] = []
    if (slideDesign.title) textElements.push(slideDesign.title)
    if (slideDesign.bullets && Array.isArray(slideDesign.bullets)) {
      textElements.push(...slideDesign.bullets.filter((b: any) => typeof b === 'string' || b?.text))
    }
    
    // Parse animation timings
    let timings: Array<{ elementIndex: number; startMs: number; durationMs: number }> = []
    if (textAnimationTimings) {
      try {
        const parsed = JSON.parse(textAnimationTimings)
        timings = parsed.timings || []
      } catch {
        console.warn(`[renderSegmentClip] Could not parse animation timings for ${segment.id}`)
      }
    }
    
    // Build text animation filters if we have text and timings
    let textFilters = ''
    if (textElements.length > 0 && timings.length > 0) {
      const drawTextFilters: string[] = []
      const fontSize = 48
      const positionX = 100
      let positionY = 150
      const lineHeight = fontSize * 1.4
      
      for (let i = 0; i < textElements.length; i++) {
        const text = String(textElements[i])
          .replace(/'/g, "\\'")
          .replace(/\n/g, ' ')
          .slice(0, 100)  // Limit text length
        
        const timing = timings.find(t => t.elementIndex === i)
        
        if (timing) {
          // Text with animation timing
          const startSec = timing.startMs / 1000
          const endSec = (timing.startMs + timing.durationMs) / 1000
          
          // Alpha expression: fade in during startMs→endMs, then stay visible
          // if(t < start, 0, if(t < end, (t-start)/duration, 1))
          const alphaExpr = `if(lt(t\\,${startSec})\\,0\\,if(lt(t\\,${endSec})\\,(t-${startSec})/${timing.durationMs / 1000}\\,1))`
          
          drawTextFilters.push(
            `drawtext=text='${text}':x=${positionX}:y=${positionY}:fontsize=${fontSize}:fontcolor=white:fontfile='C\\:/Windows/Fonts/arial.ttf':alpha='${alphaExpr}'`
          )
        } else {
          // Text without timing, visible from start
          drawTextFilters.push(
            `drawtext=text='${text}':x=${positionX}:y=${positionY}:fontsize=${fontSize}:fontcolor=white:fontfile='C\\:/Windows/Fonts/arial.ttf'`
          )
        }
        
        positionY += lineHeight
      }
      
      if (drawTextFilters.length > 0) {
        textFilters = drawTextFilters.join(',')
        console.log(`[renderSegmentClip] Applied ${drawTextFilters.length} text animation filters`)
      }
    }
    
    // Static background with optional text animations
    vf = textFilters ? `${baseVf},${textFilters}` : baseVf
    useLoop = true
    
    console.log(`[renderSegmentClip] Static background over ${durationSec.toFixed(1)}s with ${textElements.length} text elements`)
  } catch (err: any) {
    console.warn(`[renderSegmentClip] Text animation setup failed, using static slide: ${err?.message}`)
    vf = baseVf
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
    // Fallback to static slide without text animations if rendering fails
    console.warn(`[renderSegmentClip] Render failed, retrying with static slide only: ${err?.message?.slice(-300)}`)
    await runFfmpeg(buildArgs(baseVf, true))
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


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Concatenate segment videos
// ─────────────────────────────────────────────────────────────────────────────

/** Plain cut-together concat (no transition) — fast, no re-encode. Used as
 *  the fallback when crossfading isn't possible. */
async function plainConcat(videoPaths: string[]): Promise<string> {
  const listFile = join(UPLOAD_DIR, `${randomUUID()}_concat.txt`)
  writeFileSync(listFile, videoPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))

  const outPath = join(UPLOAD_DIR, `${randomUUID()}_scene.mp4`)
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath])
    return outPath
  } finally {
    try { unlinkSync(listFile) } catch { /* cleanup */ }
  }
}

/** Join segment clips with a crossfade transition between slides (#41).
 *  Falls back to a plain cut if any clip is too short to fade or if the
 *  xfade render fails. */
async function concatenateVideos(videoPaths: string[]): Promise<string> {
  if (videoPaths.length === 0) {
    throw new Error('No videos to concatenate')
  }

  if (videoPaths.length === 1) {
    console.log(`[concatenateVideos] Single segment, no concat needed: ${videoPaths[0]}`)
    return videoPaths[0]
  }

  const T = 0.5  // crossfade duration in seconds

  try {
    const durations = await Promise.all(videoPaths.map(p => getAudioDurationSec(p)))
    if (durations.some(d => d < T * 2.4)) {
      console.log('[concatenateVideos] A clip is too short to crossfade — using plain concat')
      return await plainConcat(videoPaths)
    }

    console.log(`[concatenateVideos] Crossfading ${videoPaths.length} clips (${T}s fade)`)

    const inputs = videoPaths.flatMap(p => ['-i', p])
    const parts: string[] = []
    let vPrev = '[0:v]'
    let aPrev = '[0:a]'
    let cum = durations[0]
    for (let i = 1; i < videoPaths.length; i++) {
      const last = i === videoPaths.length - 1
      const vOut = last ? '[vout]' : `[v${i}]`
      const aOut = last ? '[aout]' : `[a${i}]`
      parts.push(`${vPrev}[${i}:v]xfade=transition=fade:duration=${T}:offset=${(cum - T).toFixed(3)}${vOut}`)
      parts.push(`${aPrev}[${i}:a]acrossfade=d=${T}${aOut}`)
      vPrev = vOut
      aPrev = aOut
      cum += durations[i] - T
    }

    const outPath = join(UPLOAD_DIR, `${randomUUID()}_scene.mp4`)
    await runFfmpeg([
      '-y',
      ...inputs,
      '-filter_complex', parts.join(';'),
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      outPath,
    ])

    console.log(`[concatenateVideos] Created crossfaded video: ${outPath}`)
    return outPath
  } catch (err: any) {
    console.warn(`[concatenateVideos] Crossfade failed, falling back to plain concat: ${err?.message?.slice(-300)}`)
    return await plainConcat(videoPaths)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: Render scene segments to video
// ─────────────────────────────────────────────────────────────────────────────

export async function renderSegmentsToVideo(opts: {
  segments: RenderableSegment[]
  moduleTitle?: string | null
}): Promise<string> {
  if (!opts.segments.length) {
    throw new Error('No segments to render')
  }
  
  console.log(`[renderSegmentsToVideo] Starting render for ${opts.segments.length} segments`)
  
  const tempSvgPaths: string[] = []
  const tempPngPaths: string[] = []
  const segmentVideoPaths: string[] = []
  
  try {
    for (let i = 0; i < opts.segments.length; i++) {
      const segment = opts.segments[i]
      
      console.log(`[renderSegmentsToVideo] Processing segment ${i + 1}/${opts.segments.length}: ${segment.id}`)
      
      // Validate segment has audio
      if (!segment.ttsAudioUrl) {
        throw new Error(`Segment ${segment.id}: Missing ttsAudioUrl (run TTS generation first)`)
      }

      // WYSIWYG snapshot path (#39): if the Visual Designer saved a browser
      // capture of the exact slide (design.renderedSlideUrl), use that PNG
      // directly — the video is then pixel-identical to the editor. Only fall
      // back to the server-side SVG rebuild when no snapshot exists (e.g.
      // scenes never opened in the designer).
      let design: SlideContent = {}
      try { design = JSON.parse(segment.slideDesign || '{}') } catch { /* fallback below */ }

      let pngPath: string
      const snapshotPath = localPathFromUploadUrl(design.renderedSlideUrl)
      if (snapshotPath) {
        console.log(`[renderSegmentsToVideo] Segment ${segment.id}: using Visual Designer snapshot ${snapshotPath}`)
        pngPath = snapshotPath  // persistent upload — NOT added to temp cleanup
      } else {
        console.log(`[renderSegmentsToVideo] Segment ${segment.id}: no snapshot, falling back to server-side slide render`)
        // Step 1: Create SVG from Visual Designer design
        const svg = createSlidesSvg(segment, opts.moduleTitle || 'Module', i, opts.segments.length)
        // Step 2: Write SVG to disk
        const svgPath = writeSvgToDisk(svg)
        tempSvgPaths.push(svgPath)
        // Step 3: Rasterize SVG to PNG
        pngPath = await rasterizeSvg(svgPath)
        tempPngPaths.push(pngPath)
      }

      // Step 4: Render segment video (PNG + audio)
      const videoPath = await renderSegmentClip(segment, pngPath, segment.textAnimationTimings)
      segmentVideoPaths.push(videoPath)
    }
    
    // Step 5: Concatenate all segment videos
    const finalVideoPath = await concatenateVideos(segmentVideoPaths)
    
    // Return as /api/uploads/... URL
    const filename = parse(finalVideoPath).base
    const apiUrl = `/api/uploads/${filename}`
    
    console.log(`[renderSegmentsToVideo] Complete! Video: ${apiUrl}`)
    
    return apiUrl
  } finally {
    // Clean up temporary files
    console.log(`[renderSegmentsToVideo] Cleanup: Removing ${tempSvgPaths.length} SVGs and ${tempPngPaths.length} PNGs`)
    for (const p of tempSvgPaths) { try { unlinkSync(p) } catch { /* best-effort */ } }
    for (const p of tempPngPaths) { try { unlinkSync(p) } catch { /* best-effort */ } }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY EXPORTS: For backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

export function localVideoPathFromUploadUrl(url?: string | null): string | null {
  if (!url || url.startsWith('heygen:')) return null
  return localPathFromUploadUrl(url)
}

export async function concatVideos(localPaths: string[]): Promise<string> {
  if (!localPaths.length) throw new Error('No videos to concatenate')
  return concatenateVideos(localPaths)
}

/**
 * Overlay the HeyGen talking-avatar video bottom-right on the slide video
 * (#40) — sized/positioned to match the presenter-avatar box shown in the
 * Visual Designer preview (22% wide × 38% tall, 1.5%/2% margins).
 *
 * The avatar is scaled to the box height and center-cropped to the box width
 * (portrait-style crop of HeyGen's 16:9 output). The final audio track is the
 * slide video's own TTS narration — the avatar is muted (it lip-syncs the
 * same audio anyway).
 */
export async function overlayAvatarOnVideo(
  baseVideoPath: string,
  avatarVideoPath: string
): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_with_avatar.mp4`)

  console.log(`[overlayAvatarOnVideo] Compositing avatar onto ${baseVideoPath}`)

  await runFfmpeg([
    '-y',
    '-i', baseVideoPath,
    '-i', avatarVideoPath,
    '-filter_complex',
    // 22% of 1920 = 422 wide; 38% of 1080 = 410 tall; right 1.5% = 29px; bottom 2% = 22px
    '[1:v]scale=-2:410,crop=422:410[av];[0:v][av]overlay=W-w-29:H-h-22:eof_action=repeat[v]',
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    outPath,
  ])

  console.log(`[overlayAvatarOnVideo] Created ${outPath}`)

  return outPath
}

/** Extract the audio track of a video as mp3 (#41) — used to generate the
 *  HeyGen avatar from the FINAL crossfaded video's audio, so lip-sync can't
 *  drift when transitions shorten the timeline. */
export async function extractAudioTrack(videoPath: string): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_track.mp3`)
  await runFfmpeg(['-y', '-i', videoPath, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', outPath])
  return outPath
}

/** @deprecated Legacy signature kept so pollHeyGenVideo.ts compiles — the
 *  current pipeline composites via overlayAvatarOnVideo() instead. */
export async function compositeAvatarOverlay(opts: {
  audioUrl: string
  avatarVideoUrl: string
  slideImageUrl?: string | null
  [key: string]: any
}): Promise<string> {
  throw new Error('compositeAvatarOverlay is deprecated. Use renderSegmentsToVideo + overlayAvatarOnVideo instead.')
}
