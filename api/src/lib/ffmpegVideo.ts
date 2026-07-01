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
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Convert /api/uploads/... URL to local disk path
// ─────────────────────────────────────────────────────────────────────────────

function localPathFromUploadUrl(url?: string | null): string | null {
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
// STEP 3: Render audio + slide to video clip
// ─────────────────────────────────────────────────────────────────────────────

async function renderSegmentClip(
  segment: RenderableSegment,
  pngPath: string
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
  
  // FFmpeg: loop still image for duration of audio, mux audio
  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-i', pngPath,
    '-i', audioPath,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    outPath,
  ])
  
  console.log(`[renderSegmentClip] Created segment video: ${outPath}`)
  
  return outPath
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Concatenate segment videos
// ─────────────────────────────────────────────────────────────────────────────

async function concatenateVideos(videoPaths: string[]): Promise<string> {
  if (videoPaths.length === 0) {
    throw new Error('No videos to concatenate')
  }
  
  if (videoPaths.length === 1) {
    console.log(`[concatenateVideos] Single segment, no concat needed: ${videoPaths[0]}`)
    return videoPaths[0]
  }
  
  console.log(`[concatenateVideos] Concatenating ${videoPaths.length} videos`)
  
  // Create concat list file
  const listFile = join(UPLOAD_DIR, `${randomUUID()}_concat.txt`)
  const listContent = videoPaths
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n')
  
  writeFileSync(listFile, listContent)
  
  const outName = `${randomUUID()}_scene.mp4`
  const outPath = join(UPLOAD_DIR, outName)
  
  try {
    // Use ffmpeg concat demuxer (fast, no re-encode)
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outPath,
    ])
    
    console.log(`[concatenateVideos] Created concatenated video: ${outPath}`)
    
    return outPath
  } finally {
    try { unlinkSync(listFile) } catch { /* cleanup */ }
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
      
      // Step 1: Create SVG from Visual Designer design
      const svg = createSlidesSvg(
        segment,
        opts.moduleTitle || 'Module',
        i,
        opts.segments.length
      )
      
      // Step 2: Write SVG to disk
      const svgPath = writeSvgToDisk(svg)
      tempSvgPaths.push(svgPath)
      
      // Step 3: Rasterize SVG to PNG
      const pngPath = await rasterizeSvg(svgPath)
      tempPngPaths.push(pngPath)
      
      // Step 4: Render segment video (PNG + audio)
      const videoPath = await renderSegmentClip(segment, pngPath)
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

export async function compositeAvatarOverlay(opts: {
  audioUrl: string
  avatarVideoUrl: string
  slideImageUrl?: string | null
  [key: string]: any
}): Promise<string> {
  // For now, just return a placeholder or throw helpful error
  throw new Error('compositeAvatarOverlay not implemented in simplified video renderer. Use renderSegmentsToVideo instead.')
}
