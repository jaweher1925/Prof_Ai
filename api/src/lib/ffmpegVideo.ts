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
import { AVATAR_CHROMA_KEY_HEX } from './heygenAvatar'

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
 *
 * `-threads` was `0` (let x264 use every core) until #46's module batch
 * generation started running several of these ffmpeg calls CONCURRENTLY
 * (rendering multiple scenes' slide+voice clips at once) — several
 * processes each independently trying to claim every core fight each other
 * for CPU instead of actually parallelizing, so raising CONCURRENCY there
 * bought nothing. Capping each process to a fixed, modest thread count lets
 * multiple renders genuinely run side by side.
 */
const ENCODE_SPEED = ['-preset', 'veryfast', '-crf', '23', '-threads', '2'] as const

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
  frames: Array<{ path: string; startSec: number }>,
  textAnimationTimings?: string | null
): Promise<string> {
  const audioPath = localPathFromUploadUrl(segment.ttsAudioUrl)

  if (!audioPath) {
    throw new Error(`Segment ${segment.id}: Audio file not found at ${segment.ttsAudioUrl}`)
  }
  if (!frames.length) {
    throw new Error(`Segment ${segment.id}: No slide frames to render`)
  }
  for (const f of frames) {
    if (!existsSync(f.path)) {
      throw new Error(`Segment ${segment.id}: PNG slide not found at ${f.path}`)
    }
  }

  const outName = `${randomUUID()}_segment.mp4`
  const outPath = join(UPLOAD_DIR, outName)

  // Normalize ANY input slide to exactly 1920×1080 — libx264 requires even
  // dimensions, and browser snapshots can come in at arbitrary sizes
  const baseVf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black'
  const FPS = 24  // Reduced from 30fps to 24fps for faster rendering

  // Single frame — the overwhelmingly common case (no Edit Timeline reveal
  // configured, or a scene never opened there) — keeps the exact simple,
  // fast path this always used: one looped static image, no filter graph.
  if (frames.length === 1) {
    console.log(`[renderSegmentClip] Rendering segment ${segment.id}`, {
      pngPath: frames[0].path, audioPath, outPath,
    })

    // Background stays STATIC — the slide PNG (whether the Visual Designer's
    // own WYSIWYG snapshot or the server-side SVG fallback) already has the
    // title/bullets fully drawn, correctly positioned and styled. This used
    // to ALSO draw a second, generic-styled copy of that same title/bullet
    // text on top via ffmpeg drawtext — hardcoded white Arial at a fixed
    // x:100,y:150 position that had no relationship to the slide's real
    // layout — fading in word-by-word/line-by-line. That's the stray
    // "caption" users were seeing float over the scene: a duplicate,
    // misplaced re-draw of text already baked into the background. Removed
    // entirely; the slide image is now the only place this text is drawn,
    // matching what the editor actually shows.
    const buildArgs = (filter: string): string[] => [
      '-y',
      '-loop', '1',
      '-i', frames[0].path,
      '-i', audioPath,
      '-c:v', 'libx264',
      // A slide clip is a STATIC image held for the length of the narration
      // — x264's default 'medium' preset spends most of its time on motion
      // estimation that has nothing to find here. 'veryfast' + 'stillimage'
      // cuts this encode by roughly 5-8x at equivalent visual quality, which
      // is the single biggest win in the whole render path (ENCODE_SPEED).
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
      await runFfmpeg(buildArgs(baseVf))
    } catch (err: any) {
      console.warn(`[renderSegmentClip] Render failed: ${err?.message?.slice(-300)}`)
      throw err
    }

    console.log(`[renderSegmentClip] Created segment video: ${outPath}`)
    return outPath
  }

  // Multiple frames (2026-08-17, "if i generate or add img should appear
  // also in the remotion and edit timeline" / "in the final vd ... it is
  // static and everything appear in first time") — the Edit Timeline's
  // per-element reveal timing, baked client-side into a sequence of WYSIWYG
  // snapshots (one per reveal breakpoint — see VisualDesignerPanel.jsx's
  // captureRevealFrames), gets composited here as TIMED background layers
  // instead of one flat static image for the whole clip. Each frame is
  // chained on top of the previous via ffmpeg's overlay filter gated by
  // `enable='between(t,start,end)'` — since every frame is a full, opaque
  // 1920x1080 image, once frame N's window opens it completely replaces
  // whatever was showing before, i.e. a hard cut at exactly that second.
  console.log(`[renderSegmentClip] Rendering segment ${segment.id} with ${frames.length} timed reveal frames`, { audioPath, outPath })

  let audioDuration: number
  try {
    audioDuration = await getAudioDurationSec(audioPath)
  } catch (err: any) {
    console.warn(`[renderSegmentClip] Could not read audio duration, falling back to first frame only: ${err?.message}`)
    return renderSegmentClip(segment, [frames[0]], textAnimationTimings)
  }
  // Slack past the real duration so the last frame's `between()` upper
  // bound is never accidentally clipped by float rounding right at the end.
  const endBound = audioDuration + 1

  const sorted = [...frames].sort((a, b) => a.startSec - b.startSec)
  const inputArgs: string[] = []
  sorted.forEach(f => { inputArgs.push('-loop', '1', '-i', f.path) })
  inputArgs.push('-i', audioPath)
  const audioInputIndex = sorted.length

  const scaleStages = sorted.map((_, i) => `[${i}:v]${baseVf}[bg${i}]`)
  const overlayStages: string[] = []
  let prevLabel = 'bg0'
  for (let i = 1; i < sorted.length; i++) {
    const outLabel = i === sorted.length - 1 ? 'v' : `s${i}`
    const start = Math.max(0, sorted[i].startSec)
    overlayStages.push(`[${prevLabel}][bg${i}]overlay=0:0:enable='between(t,${start},${endBound})'[${outLabel}]`)
    prevLabel = outLabel
  }
  const filterComplex = [...scaleStages, ...overlayStages].join(';')

  const args = [
    '-y',
    ...inputArgs,
    '-c:v', 'libx264',
    ...ENCODE_SPEED,
    '-tune', 'stillimage',
    '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-filter_complex', filterComplex,
    '-map', '[v]',
    '-map', `${audioInputIndex}:a`,
    '-shortest',
    outPath,
  ]

  try {
    await runFfmpeg(args)
  } catch (err: any) {
    console.warn(`[renderSegmentClip] Multi-frame render failed, falling back to first frame only: ${err?.message?.slice(-300)}`)
    return renderSegmentClip(segment, [sorted[0]], textAnimationTimings)
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

/** Re-encoding concat (ffmpeg's `concat` FILTER, not the `-f concat` stream-
 *  copy demuxer `plainConcat` above uses) — tolerates clips coming out of
 *  DIFFERENT render pipelines (voice-only scene vs. avatar-overlaid scene vs.
 *  multi-segment stitched scene, each its own ffmpeg encode with its own
 *  timestamps/params) that stream-copy concat requires to match exactly and
 *  which these don't always. Slower (full re-encode) but far more tolerant —
 *  used as a fallback specifically so a stream-copy mismatch doesn't force
 *  callers to discard already-successful work (see concatVideos below,
 *  2026-08-15: "between the scene they are on top on each other there is no
 *  separate time between" — plainConcat(padded) was failing on some modules
 *  and silently falling back to re-joining the ORIGINAL, unpadded clips,
 *  which is indistinguishable from success except the pause is just gone). */
async function filterConcatVideos(videoPaths: string[]): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_concat_reencode.mp4`)
  const inputArgs = videoPaths.flatMap((p) => ['-i', p])
  const streamRefs = videoPaths.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('')
  const filter = `${streamRefs}concat=n=${videoPaths.length}:v=1:a=1[v][a]`
  await runFfmpeg([
    '-y', ...inputArgs,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', ...ENCODE_SPEED, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    outPath,
  ])
  return outPath
}

/** Join segment clips with a crossfade transition between slides (#41).
 *  Falls back to a plain cut if any clip is too short to fade or if the
 *  xfade render fails. */
// Exported (in addition to being used internally by renderSegmentsToVideo)
// so per-segment avatar rendering (generateHeyGenAvatar.ts's grouped-segment
// path) can stitch the finished, avatar-composited segment clips together
// with the exact same crossfade treatment used for the slide-only join.
export async function concatenateVideos(videoPaths: string[]): Promise<string> {
  if (videoPaths.length === 0) {
    throw new Error('No videos to concatenate')
  }

  if (videoPaths.length === 1) {
    console.log(`[concatenateVideos] Single segment, no concat needed: ${videoPaths[0]}`)
    return videoPaths[0]
  }

  // Used to audio-crossfade (acrossfade=d=0.5) alongside the video xfade at
  // every segment boundary. That's fine for music but every caller here is
  // stitching spoken narration segments of the SAME scene back together
  // (heygenFinalize.ts's stitchSceneFromSegments, renderSegmentsToVideo) —
  // crossfading two different sentences means they're both audible, blended,
  // for half a second at every join, which reads as garbled/unclear audio.
  // A hard cut between two talking-head clips is completely normal (that's
  // what module-level merging already does by default when no transition is
  // picked — see joinTwoClips' 'none' branch), so just do that here too.
  // Also sidesteps the video/audio desync risk a mismatched fade duration
  // would introduce, since plain concat re-times nothing.
  console.log(`[concatenateVideos] Joining ${videoPaths.length} clips with a clean cut (no audio crossfade)`)
  return await plainConcat(videoPaths)
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

      // revealFrames (2026-08-17): when the Edit Timeline has real, distinct
      // per-element reveal timing baked in, this is a sequence of snapshots
      // — one per reveal breakpoint — instead of one flat image, so the
      // exported video actually progresses through title/content/image
      // reveals like the editor's own timeline preview does. Falls straight
      // through to the existing single-snapshot / SVG-fallback behavior
      // whenever it's absent, has under 2 usable entries, or any frame's
      // file is missing — this is purely additive, never a hard requirement.
      let frames: Array<{ path: string; startSec: number }> = []
      if (Array.isArray(design.revealFrames) && design.revealFrames.length > 1) {
        frames = design.revealFrames
          .map(f => ({ path: localPathFromUploadUrl(f?.url), startSec: Number(f?.time) || 0 }))
          .filter((f): f is { path: string; startSec: number } => !!f.path)
      }

      if (frames.length > 1) {
        console.log(`[renderSegmentsToVideo] Segment ${segment.id}: using ${frames.length} timed reveal frames`)
      } else {
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
        frames = [{ path: pngPath, startSec: 0 }]
      }

      // Step 4: Render segment video (frame(s) + audio)
      return renderSegmentClip(segment, frames, segment.textAnimationTimings)
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
const SCENE_PAUSE_SEC = 3

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

  // Pad every clip except the last — the last scene doesn't need a pause
  // after it since there's nothing following it in this video. Each clip is
  // padded INDEPENDENTLY (its own try/catch) rather than as one Promise.all
  // that aborts entirely on the first failure — previously a single bad
  // clip (e.g. an oddly-encoded segment tpad/apad chokes on) discarded
  // padding for every OTHER clip too and fell straight through to the
  // crossfade fallback below, which has no pause at all and audibly runs
  // the last word of one scene into the first word of the next. Now one
  // clip failing to pad just leaves THAT one boundary un-padded.
  const padded = await Promise.all(
    localPaths.map(async (p, i) => {
      if (i === localPaths.length - 1) return p
      try {
        return await padClipEnd(p, SCENE_PAUSE_SEC)
      } catch (err: any) {
        console.warn(`[concatVideos] Pause-padding failed for clip ${i + 1}/${localPaths.length}, joining it unpadded: ${err?.message?.slice(-300)}`)
        return p
      }
    })
  )

  try {
    return await plainConcat(padded)
  } catch (err: any) {
    // This used to fall straight through to concatenateVideos(localPaths) —
    // the ORIGINAL, UNPADDED clips. That "worked" (produced a valid video,
    // no error surfaced) but silently threw away every pause just applied
    // above, which is exactly what looked like "scenes glued directly
    // together with no gap" with no error or warning visible to the user.
    // plainConcat's stream-copy demuxer needs every clip's codec params to
    // match EXACTLY, which clips from different render pipelines (voice-only
    // vs avatar-overlaid vs multi-segment stitched scenes) don't always
    // guarantee — so try the slower but far more tolerant re-encoding concat
    // FIRST, on the PADDED clips, before giving up the pause entirely.
    console.warn(`[concatVideos] Plain (stream-copy) concat of padded clips failed, retrying with a re-encoding concat so the pause survives: ${err?.message?.slice(-300)}`)
    try {
      return await filterConcatVideos(padded)
    } catch (err2: any) {
      console.warn(`[concatVideos] Re-encoding concat also failed, falling back to a crossfaded join of the ORIGINAL clips as a last resort (no pause at any boundary): ${err2?.message?.slice(-300)}`)
      return await concatenateVideos(localPaths)
    }
  }
}

/** Concatenate several audio files into ONE track while recording each
 *  input's [start, end] offset (seconds) within the combined result — used
 *  to submit a SINGLE HeyGen job for a whole module's narration (#46,
 *  batched module-level avatar rendering) instead of one job per scene, then
 *  split the single returned avatar clip back into per-scene pieces with
 *  trimVideo() below, using these exact offsets. */
export async function concatAudioWithOffsets(
  audioPaths: string[]
): Promise<{ combinedPath: string; offsets: { start: number; end: number }[] }> {
  const durations = await Promise.all(audioPaths.map((p) => getAudioDurationSec(p)))
  let combinedPath: string
  if (audioPaths.length === 1) {
    combinedPath = audioPaths[0]
  } else {
    const listFile = join(UPLOAD_DIR, `${randomUUID()}_audiolist.txt`)
    writeFileSync(listFile, audioPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
    combinedPath = join(UPLOAD_DIR, `${randomUUID()}_combined_audio.mp3`)
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-b:a', '128k', combinedPath])
  }
  let t = 0
  const offsets = durations.map((d) => {
    const start = t
    t += d
    return { start, end: t }
  })
  return { combinedPath, offsets }
}

/** Cuts [startSec, endSec) out of a video — used to split one long combined
 *  avatar clip (module-level batched HeyGen job, see concatAudioWithOffsets)
 *  back into its per-scene pieces before compositing each onto its own
 *  scene's slide video. Re-encodes rather than stream-copying so the cut
 *  isn't limited to the nearest keyframe. */
export async function trimVideo(inputPath: string, startSec: number, endSec: number): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_trim.mp4`)
  await runFfmpeg([
    '-y',
    '-ss', startSec.toFixed(3),
    '-to', Math.max(endSec, startSec + 0.1).toFixed(3),
    '-i', inputPath,
    '-c:v', 'libx264', ...ENCODE_SPEED, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    outPath,
  ])
  return outPath
}

export type SceneTransitionType = 'none' | 'fade' | 'dissolve' | 'slide'
// Maps this app's user-facing transition names (VideoEditingPanel.jsx's
// TRANSITIONS list) to ffmpeg's own `xfade` transition names.
const XFADE_TYPE: Record<Exclude<SceneTransitionType, 'none'>, string> = {
  fade: 'fadeblack',   // hold, fade to black, fade in on the next scene
  dissolve: 'fade',    // direct crossfade, no black
  slide: 'slideleft',
}
const XFADE_DURATION = 0.6

/** Join two already-rendered scene clips at ONE boundary, honoring that
 *  boundary's own chosen transition + pause — used by
 *  mergeScenesWithTransitions below to build up a module video boundary by
 *  boundary, since different boundaries in the same module can each have a
 *  different transition (picked per-scene in Module Editing). */
async function joinTwoClips(
  aPath: string,
  bPath: string,
  transition: { type: SceneTransitionType; pauseSec: number }
): Promise<string> {
  const pauseSec = Math.max(0, transition.pauseSec ?? SCENE_PAUSE_SEC)
  let held = aPath
  if (pauseSec > 0) {
    try { held = await padClipEnd(aPath, pauseSec) } catch (err: any) {
      console.warn(`[joinTwoClips] Pause-padding failed, joining unpadded: ${err?.message?.slice(-300)}`)
      held = aPath
    }
  }

  if (!transition.type || transition.type === 'none') {
    try {
      return await plainConcat([held, bPath])
    } catch (err: any) {
      console.warn(`[joinTwoClips] Plain concat failed, falling back to a quick crossfade: ${err?.message?.slice(-300)}`)
      // fall through to the crossfade path below as a last resort
    }
  }

  const xfadeType = XFADE_TYPE[transition.type === 'none' || !transition.type ? 'dissolve' : transition.type] || 'fade'
  try {
    const durA = await getAudioDurationSec(held)
    if (durA < XFADE_DURATION * 2.4) return await plainConcat([held, bPath]) // too short to crossfade
    const outPath = join(UPLOAD_DIR, `${randomUUID()}_joined.mp4`)
    await runFfmpeg([
      '-y', '-i', held, '-i', bPath,
      '-filter_complex',
      `[0:v][1:v]xfade=transition=${xfadeType}:duration=${XFADE_DURATION}:offset=${(durA - XFADE_DURATION).toFixed(3)}[v];[0:a][1:a]acrossfade=d=${XFADE_DURATION}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', ...ENCODE_SPEED, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      outPath,
    ])
    return outPath
  } catch (err: any) {
    console.warn(`[joinTwoClips] Crossfade join failed, falling back to a plain cut: ${err?.message?.slice(-300)}`)
    return await plainConcat([held, bPath])
  }
}

/** Module-level merge (#45) — like concatVideos, but each scene-to-scene
 *  boundary can have its OWN transition style + pause, matching what the
 *  user actually picked per-boundary in Module Editing instead of always
 *  applying one fixed hold-then-cut everywhere. `boundaries[i]` is the
 *  transition used AFTER clipPaths[i] (so boundaries.length === clipPaths.length - 1). */
export async function mergeScenesWithTransitions(
  clipPaths: string[],
  boundaries: { type: SceneTransitionType; pauseSec: number }[]
): Promise<string> {
  if (!clipPaths.length) throw new Error('No videos to concatenate')
  if (clipPaths.length === 1) return clipPaths[0]
  let acc = clipPaths[0]
  for (let i = 1; i < clipPaths.length; i++) {
    const boundary = boundaries[i - 1] || { type: 'none' as const, pauseSec: SCENE_PAUSE_SEC }
    acc = await joinTwoClips(acc, clipPaths[i], boundary)
  }
  return acc
}

/**
 * Overlay the HeyGen talking-avatar video on the slide video (#40), sized and
 * positioned by the Visual Designer's avatar placeholder (#3, #4) — falls
 * back to a full-height right-edge strip (30% wide, vertically centered) when
 * no placeholder position is available (e.g. scenes that predate the WYSIWYG
 * canvas).
 *
 * `position` uses the same % coordinates as SlideComposition/SlideContent:
 * avatarX/avatarY are the CENTER of the box (0-100, % of slide), avatarWidth
 * is the box width as % of slide width; height is derived to fit HeyGen's
 * 9:16 portrait output with no crop (see AVATAR_BOX_ASPECT below).
 *
 * The final audio track is the slide video's own TTS narration — the avatar
 * is muted (it lip-syncs the same audio anyway).
 */
// Aspect (height/width, in pixels) the avatar box is cropped to.
// Was 16/9 (a true 9:16 portrait sliver) — HeyGen's v3 API has no framing
// control (closeUp/normal was dropped going from v2, see createAvatarVideo's
// comment), so its default medium-shot framing already fills a good chunk of
// its native 16:9 frame; cropping THAT down to another 9:16-shaped box on
// top discarded ~70% of the frame width and compounded into an extreme
// face-only close-up ("avatar is zoomed too big", reported 2026-08-11).
// Lowered to 4/3, which helped but still discarded ~58% of the scaled
// frame's width (29% off each side) — enough to still clip into the
// shoulders on a normal medium shot ("sides crop, box small", reported
// 2026-08-13). 1/1 (square) keeps the box read as a presenter insert
// (still taller, relatively, than the very wide 16:9 slide behind it)
// while only discarding ~44% of width (22% each side), which is what
// actually stopped the edge-clipping. If a future HeyGen framing option
// changes how tight the native medium shot is, re-check this fraction
// (kept width fraction = (1/AVATAR_BOX_ASPECT) / (16/9)) rather than
// re-guessing from scratch.
// VisualDesignerPanel.jsx's AVATAR_HEIGHT_RATIO must stay in sync with this
// (it's the same ratio, folded together with the 16:9 slide's own aspect) so
// the editor placeholder shows the same crop the render actually produces.
// 2026-08-15 ("i need to find a complet avatar all his body and face
// appear"): moved to 9/16 — i.e. the box had the SAME 16:9 shape as HeyGen's
// own output, so the whole frame fit with NO crop at all. Every value before
// that (16/9, then 4/3, then 1) was a box shaped differently from the
// source, which forced a horizontal crop and cost 44-70% of the frame's
// width — that's what kept lopping off shoulders/arms and made the shot
// read as a tight face close-up no matter how the position math was
// adjusted. The filter below pairs this with force_original_aspect_ratio=
// decrease + pad instead of crop, so even if this constant is changed again
// the presenter can only ever be letterboxed, never cut.
//
// 2026-08-15, same day ("i need to get avatar with all the frame full
// portrait (9:16)"): flipped again, this time to 16/9 — a TALL box, mirroring
// the exact same "box shape must match HeyGen's output shape" principle, just
// for the opposite orientation. createAvatarVideo (heygenAvatar.ts) now
// requests aspect_ratio: '9:16' from HeyGen instead of '16:9', so the SOURCE
// clip itself is portrait-framed (not a landscape clip squeezed into a
// portrait box, which would just letterbox tiny in the middle). This is a
// full-height edge strip, not a corner box — see DEFAULT_AVATAR's move to
// {x:82, y:50, width:30} in VisualDesignerPanel.jsx.
const AVATAR_BOX_ASPECT = 16 / 9

export async function overlayAvatarOnVideo(
  baseVideoPath: string,
  avatarVideoPath: string,
  position?: { x: number; y: number; width: number } | null,
  // When true, the avatar clip was rendered by HeyGen on the chroma-key green
  // defined in heygenAvatar.ts (AVATAR_CHROMA_KEY_HEX) because the project's
  // Avatar Background is set to "Transparent" — HeyGen has no real
  // transparent render option, so this keys the green out to per-pixel alpha
  // here instead, so the slide shows through around the presenter instead of
  // a solid box (previously this flag didn't exist at all: "Transparent" was
  // silently ignored and always rendered as a plain rectangular overlay).
  chromaKey?: boolean,
  // Solid Avatar Background color, from heygenAvatar.ts's
  // resolveAvatarBackgroundColor() — currently UNUSED (see the "Edge-to-edge
  // fill" comment below, 2026-08-15: the padded-margin look this was for got
  // explicitly turned back off). Left in the signature rather than ripped
  // out of all six call sites, in case the margin treatment comes back for
  // one background type but not another.
  bgColorHex?: string | null
): Promise<string> {
  const outPath = join(UPLOAD_DIR, `${randomUUID()}_with_avatar.mp4`)

  console.log(`[overlayAvatarOnVideo] Compositing avatar onto ${baseVideoPath}`, position || '(default position)')

  // Default: 22% wide × 38% tall, bottom-right with 1.5%/2% margins
  let boxWPx: number, boxHPx: number, overlayX: string, overlayY: string

  if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.width)) {
    // Floor raised 16 -> 20 (2026-08-15, "keep the avatar more big") so even
    // a segment saved at the editor's own DEFAULT_AVATAR.width (22%, already
    // above this floor) reads as a deliberately-sized presenter. The ceiling
    // was dropped hard, 60 -> 30, in the SAME message's very next round —
    // several scenes had their avatarWidth dragged up to 32-33% back when
    // the box still had the AVATAR_CONTENT_SCALE padding above (removed
    // just before this), so the VISIBLE presenter inside that oversized box
    // was actually a normal size despite the box itself being huge. Once
    // that padding came out, those same 32-33% boxes filled edge-to-edge and
    // the presenter suddenly covered most of the frame ("avatar too big,
    // covering everything" — a screenshot, no caption, immediately after the
    // border/padding removal). The old 60% ceiling was never a real limit in
    // practice; 30% keeps the "bigger, no border" request without letting a
    // stale large box compound with the padding removal into this.
    // 2026-08-15: range narrowed 26-45 -> 18-31 for the portrait-strip switch.
    // AVATAR_BOX_ASPECT is now 16/9 (tall), so WIDTH maps to a much bigger
    // HEIGHT than before (heightPx = widthPx * 16/9) — the old 45% ceiling
    // would produce a box ~1536px tall, well past the 1080px canvas. 31%
    // ceiling caps height at ~1024px (~95% of slide height, matches
    // VisualDesignerPanel.jsx's MAX_AVATAR_WIDTH = floor(98/AVATAR_HEIGHT_RATIO)
    // so the editor can never save a width the render would have to clip).
    const wPct = Math.max(18, Math.min(31, position.width))
    boxWPx = Math.round((OUT_W * wPct) / 100)
    boxHPx = Math.round(boxWPx * AVATAR_BOX_ASPECT) // portrait crop, even dims required by libx264
    if (boxWPx % 2 !== 0) boxWPx += 1
    if (boxHPx % 2 !== 0) boxHPx += 1
    const centerXPx = (OUT_W * position.x) / 100
    const centerYPx = (OUT_H * position.y) / 100
    // Clamp so the box is always FULLY on-canvas. VisualDesignerPanel.jsx's
    // clampAvatarBox() keeps whatever the user currently drags/resizes
    // on-slide, but that only protects data saved by the CURRENT editor
    // build — a segment saved before clampAvatarBox existed, or before
    // AVATAR_BOX_ASPECT changed (16/9 -> 4/3, see that constant's comment),
    // can carry stale coordinates that place part of the box above y=0 or
    // past the right/bottom edge. ffmpeg's overlay filter doesn't clip that
    // gracefully — it just doesn't draw the off-canvas part, which reads as
    // the presenter's head being cut off ("top of the head is cut off",
    // reported 2026-08-13). Re-deriving x/y here from the ACTUAL box size
    // instead of trusting old stored coordinates makes this correct
    // regardless of what produced the stale data.
    const rawX = Math.round(centerXPx - boxWPx / 2)
    const rawY = Math.round(centerYPx - boxHPx / 2)
    overlayX = String(Math.max(0, Math.min(OUT_W - boxWPx, rawX)))
    overlayY = String(Math.max(0, Math.min(OUT_H - boxHPx, rawY)))
  } else {
    // Matches DEFAULT_AVATAR (VisualDesignerPanel.jsx: {x:82, y:50, width:30})
    // at the 16/9 AVATAR_BOX_ASPECT — a full-height strip flush to the right
    // edge, vertically centered — for the rare case there's no saved position
    // at all (e.g. a scene that predates the WYSIWYG canvas).
    boxWPx = 576
    boxHPx = 1024
    overlayX = `W-w-20`
    overlayY = `(H-h)/2`
  }

  // Chroma-key the avatar clip's green background out to real alpha before
  // overlaying, so the slide shows through around the presenter instead of a
  // solid green/navy box. similarity/blend tuned conservatively (checked
  // against a synthetic green-screen test clip): keys out the flat green
  // cleanly while a soft blend band avoids a hard fringe at the presenter's
  // edge. format=yuva420p makes the alpha channel explicit going into
  // overlay, which otherwise ignores per-pixel alpha on some codecs/builds.
  // despill after chromakey (2026-08-13, "the avatar... green" fringe
  // reported around hair edges) — chromakey alone only makes near-pure-green
  // pixels transparent; the ANTI-ALIASED edge pixels around hair/shoulders
  // are a genuine blend of green + subject color, so they survive keying as
  // partially-transparent pixels that are still tinted green. despill
  // specifically desaturates that residual green cast on the remaining
  // semi-transparent edge without touching fully-opaque interior pixels.
  //
  // Headroom padding, chroma-key path only (2026-08-15). The crop above
  // already keeps 100% of HeyGen's frame HEIGHT — nothing is ever cropped
  // vertically here — so "head not complete" is HeyGen's own medium-shot
  // framing placing the hairline near its frame's top edge, which no crop
  // offset can undo. What makes that read as CUT rather than merely tight
  // is a hard box edge landing right at the hairline. Scaling the presenter
  // to AVATAR_CONTENT_SCALE of the box and padding the remainder with real
  // alpha moves that edge away from the head AND is completely invisible —
  // the slide shows straight through the padding, so there's no margin or
  // border to see, unlike the earlier solid-color version of this that got
  // (correctly) called out as a border. resolveAvatarBackground() now
  // defaults to this transparent path, so it's what most renders take.
  //
  // A project that explicitly picked a solid color/image background keeps
  // filling its box edge-to-edge: padding there would be a genuinely
  // visible band, which is the thing that was objected to.
  // FIT the whole avatar frame into the box — never crop it. force_original_
  // aspect_ratio=decrease scales until BOTH dimensions fit (so nothing can
  // fall outside), then pad centers it in the exact box size ffmpeg's
  // overlay expects. Because AVATAR_BOX_ASPECT above already matches
  // HeyGen's 16:9, that padding is normally zero — it only kicks in as a
  // safety net if the source or the box aspect ever differs, and even then
  // it letterboxes rather than cutting.
  //
  // This replaces a crop=WxH that always discarded a large slice of the
  // frame's width, and the AVATAR_CONTENT_SCALE shrink-and-pad that tried to
  // compensate for the resulting tightness. Both are unnecessary once the
  // box simply matches the source shape: the presenter arrives complete —
  // full face and body, exactly as HeyGen framed it.
  const fitAndPad = `scale=${boxWPx}:${boxHPx}:force_original_aspect_ratio=decrease,pad=${boxWPx}:${boxHPx}:(ow-iw)/2:(oh-ih)/2`
  const avatarFilter = chromaKey
    ? `[1:v]chromakey=${AVATAR_CHROMA_KEY_HEX}:0.15:0.1,despill=type=green:mix=0.5:expand=0,format=yuva420p,${fitAndPad}:color=0x00000000[av]`
    : `[1:v]${fitAndPad}:color=black[av]`

  await runFfmpeg([
    '-y',
    '-i', baseVideoPath,
    '-i', avatarVideoPath,
    '-filter_complex',
    `${avatarFilter};[0:v][av]overlay=${overlayX}:${overlayY}:eof_action=repeat[v]`,
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
