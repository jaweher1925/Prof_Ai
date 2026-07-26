/**
 * Chroma-key background removal.
 *
 * Gemini's image-generation models (gemini-2.5-flash-image / "nano banana")
 * don't actually support outputting a real alpha channel — asking for "a
 * transparent background" in the prompt just makes the model DRAW a
 * checkerboard pattern (the visual convention editors use to depict
 * transparency) as literal opaque pixels. That checkerboard then shows up
 * baked into the slide instead of the slide's own background showing
 * through (see the Visual Designer bug report: schema/diagram images always
 * rendering with a visible checker pattern instead of true transparency).
 *
 * The fix: don't ask the model for transparency at all. Ask it to fill the
 * backdrop with a single flat, unnatural "chroma key" color (bright magenta)
 * that's extremely unlikely to appear anywhere in a legitimate technical
 * diagram, then key that color out to real alpha ourselves afterward via
 * sharp. This is the same technique a greenscreen uses, just picked to suit
 * illustration output instead of video.
 */
import sharp from 'sharp'

// An unnatural, highly saturated color diagram illustrations essentially
// never use for real content — picked specifically so keying it out won't
// eat into legitimate white/light diagram elements (boxes, labels, icons),
// which a naive "key out near-white" approach would incorrectly punch holes
// in.
export const CHROMA_KEY_COLOR = { r: 255, g: 0, b: 255 } // bright magenta
export const CHROMA_KEY_HEX = '#FF00FF'

/**
 * Replaces pixels close to CHROMA_KEY_COLOR with real alpha transparency.
 * Uses a color-distance threshold with a soft feather band so edges
 * anti-aliased against the magenta backdrop fade out smoothly instead of
 * leaving a hard magenta fringe around the diagram's shapes.
 */
export async function chromaKeyToTransparent(
  pngBuffer: Buffer,
  opts: { threshold?: number; feather?: number } = {},
): Promise<Buffer> {
  const threshold = opts.threshold ?? 60
  const feather = opts.feather ?? 45
  const target = CHROMA_KEY_COLOR

  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  if (channels < 4) {
    // Shouldn't happen after ensureAlpha(), but bail out safely if it does.
    return sharp(pngBuffer).png().toBuffer()
  }

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const dist = Math.sqrt(
      (r - target.r) ** 2 + (g - target.g) ** 2 + (b - target.b) ** 2,
    )
    if (dist <= threshold) {
      data[i + 3] = 0
    } else if (dist <= threshold + feather) {
      const fade = Math.round(((dist - threshold) / feather) * 255)
      data[i + 3] = Math.min(data[i + 3], fade)
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}
