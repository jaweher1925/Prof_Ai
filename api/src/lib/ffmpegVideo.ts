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

/**
 * Shared x264 speed flags for every encode in this file.
 *
 * These clips are slideshow-style: a static 1920x1080 slide held for the
 * length of the narration, plus a small avatar overlay. x264's DEFAULT preset
 * is 'medium', which budgets most of its time for motion estimation — work
 * that finds almost nothing on this content but costs minutes per clip at
 * 1080p. 'veryfast' produces near-identical output here for a fraction of the
 * time, and '-threads 0' lets x264 use every core instead of its default cap.
 *
 * This was the main reason a single scene took 4+ minutes to render.
 */
const ENCODE_SPEED = ['-preset', 'veryfast', '-crf', '23', '-threads', '0'] as const

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

/**
 * Pull the avatar placeholder's position/size (#3, #4) out of a segment's
 * slideDesign JSON, as saved by the Visual Designer / SlideComposition sync
 * (see compositions.ts#syncCompositionToSegment). Returns null when absent
 * so callers fall back to the historical default overlay position.
 */
export function extractAvatarPosition(
  slideDesignJson?: string | null
): { x: number; y: number; width: number } | null {
  if (!slideDesignJson) return null
  try {
    const design = JSON.parse(slideDesignJson)
    if (
      typeof design.avatarX === 'number' &&
      typeof design.avatarY === 'number' &&
      typeof design.avatarWidth === 'number'
    ) {
      return { x: design.avatarX, y: design.avatarY, width: design.avatarWidth }
    }
  } catch { /* malformed JSON — fall back to default */ }
  return null
}

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
  const FPS = 24  // Reduced from 30fps to 24fps for faster rendering

  // Background stays STATIC — the slide PNG (whether the Visual Designer's
  // own WYSIWYG snapshot or the server-side SVG fallback) already has the
  // title/bullets fully drawn, correctly positioned and styled. This used to
  // ALSO draw a second, generic-styled copy of that same title/bullet text
  // on top via ffmpeg drawtext — hardcoded white Arial at a fixed x:100,y:150
  // position that had no relationship to the slide's real layout — fading in
  // word-by-word/line-by-line. That's the stray "caption" users were seeing
  // float over the scene: a duplicate, misplaced re-draw of text already
  // baked into the background. Removed entirely; the slide image is now the
  // only place this text is drawn, matching what the editor actually shows.
  const vf = baseVf
  const useLoop = true

  const buildArgs = (filter: string, loop: boolean): string[] => [
    '-y',
    ...(loop ? ['-loop', '1'] : []),
    '-i', pngPath,
    '-i', audioPath,
    '-c:v', 'libx264',
    // A slide clip is a STATIC image held for the length of the narration —
    // x264's default 'medium' preset spends most of its time on motion
    // estimation that has nothing to find here. 'veryfast' + 'stillimage'
    // cuts this encode by roughly 5-8x at equivalent visual quality, which is
    // the single biggest win in the whole render path (see ENCODE_SPEED).
    ...ENCODE_SPEED,
    '-tune', 'stillimage',
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
      ...ENCODE_SPEED,
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
    // Segments are INDEPENDENT of one another — each is just its own slide PNG
    // muxed with its own audio — so rendering them one after another (as this
    // used to) meant a 4-part scene serialised four full 1080p encodes before
    // it could even start concatenating. Render them concurrently instead.
    //
    // Concurrency is capped rather than unbounded: each ffmpeg already uses
    // every core via '-threads 0', so launching all segments at once would
    // oversubscribe the CPU and finish no faster (often slower, plus a memory
    // spike on long scenes). Two at a time keeps the cores saturated while
    // still overlapping the single-threaded parts of each job.
    const RENDER_CONCURRENCY = 2

    const renderOne = async (segment: RenderableSegment, i: number) => {
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
      return renderSegmentClip(segment, pngPath, segment.textAnimationTimings)
    }

    // Results are written back BY INDEX, so the finished clips stay in
    // narration order no matter which worker finishes first — concatenating
    // them out of order would scramble the scene.
    const rendered: string[] = new Array(opts.segments.length)
    let cursor = 0
    const workers = Array.from(
      { length: Math.min(RENDER_CONCURRENCY, opts.segments.length) },
      async () => {
        while (true) {
          const i = cursor++
          if (i >= opts.segments.length) break
          rendered[i] = await renderOne(opts.segments[i], i)
        }
      }
    )
    await Promise.all(workers)
    segmentVideoPaths.push(...rendered)


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

// Deliberate breathing room between SCENES in the merged module video — a
// scene finishing and the next one starting immediately (or crossfading,
// which is what this used to do by reusing concatenateVideos) read as a
// jump cut. This is separate from the crossfade used to join SEGMENTS
// within one scene (concatenateVideos above), which stays smooth/quick on
// purpose since those are parts of the same continuous scene.
const SCENE_PAUSE_SEC = 2

/** Extends a clip by holding its last frame (+ silence) for `padSec` more
 *  seconds, instead of cutting/fading straight into the next clip. */
async function padClipEnd(inputPath: string, padSec: number): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_paused.mp4`)
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-vf', `tpad=stop_mode=clone:stop_duration=${padSec}`,
    '-af', `apad=pad_dur=${padSec}`,
    '-c:v', 'libx264',
    ...ENCODE_SPEED,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    outPath,
  ])
  return outPath
}

export async function concatVideos(localPaths: string[]): Promise<string> {
  if (!localPaths.length) throw new Error('No videos to concatenate')
  if (localPaths.length === 1) return localPaths[0]
  try {
    // Pad every clip except the last — the last scene doesn't need a pause
    // after it since there's nothing following it in this video.
    const padded = await Promise.all(
      localPaths.map((p, i) => (i < localPaths.length - 1 ? padClipEnd(p, SCENE_PAUSE_SEC) : Promise.resolve(p)))
    )
    return await plainConcat(padded)
  } catch (err: any) {
    console.warn(`[concatVideos] Pause-padding failed, falling back to a plain crossfaded join with no pause: ${err?.message?.slice(-300)}`)
    return await concatenateVideos(localPaths)
  }
}

/**
 * Overlay the HeyGen talking-avatar video on the slide video (#40), sized and
 * positioned by the Visual Designer's avatar placeholder (#3, #4) — falls
 * back to the old default box (22% wide × 38% tall, bottom-right, 1.5%/2%
 * margins) when no placeholder position is available (e.g. scenes that
 * predate the WYSIWYG canvas).
 *
 * `position` uses the same % coordinates as SlideComposition/SlideContent:
 * avatarX/avatarY are the CENTER of the box (0-100, % of slide), avatarWidth
 * is the box width as % of slide width; height is derived to keep a 9:16
 * portrait crop of HeyGen's 16:9 output.
 *
 * The final audio track is the slide video's own TTS narration — the avatar
 * is muted (it lip-syncs the same audio anyway).
 */
export async function overlayAvatarOnVideo(
  baseVideoPath: string,
  avatarVideoPath: string,
  position?: { x: number; y: number; width: number } | null
): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_with_avatar.mp4`)

  console.log(`[overlayAvatarOnVideo] Compositing avatar onto ${baseVideoPath}`, position || '(default position)')

  // Default: 22% wide × 38% tall, bottom-right with 1.5%/2% margins
  let boxWPx: number, boxHPx: number, overlayX: string, overlayY: string

  if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.width)) {
    const wPct = Math.max(10, Math.min(60, position.width))
    boxWPx = Math.round((OUT_W * wPct) / 100)
    boxHPx = Math.round(boxWPx * (16 / 9)) // 9:16 portrait crop, even dims required by libx264
    if (boxWPx % 2 !== 0) boxWPx += 1
    if (boxHPx % 2 !== 0) boxHPx += 1
    const centerXPx = (OUT_W * position.x) / 100
    const centerYPx = (OUT_H * position.y) / 100
    overlayX = String(Math.round(centerXPx - boxWPx / 2))
    overlayY = String(Math.round(centerYPx - boxHPx / 2))
  } else {
    boxWPx = 422
    boxHPx = 410
    overlayX = `W-w-29`
    overlayY = `H-h-22`
  }

  await runFfmpeg([
    '-y',
    '-i', baseVideoPath,
    '-i', avatarVideoPath,
    '-filter_complex',
    `[1:v]scale=-2:${boxHPx},crop=${boxWPx}:${boxHPx}[av];[0:v][av]overlay=${overlayX}:${overlayY}:eof_action=repeat[v]`,
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264',
    ...ENCODE_SPEED,
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
