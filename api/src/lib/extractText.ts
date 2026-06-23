/**
 * extractText.ts — shared PDF/text extraction utility
 *
 * Called once at upload time. Result is saved to SourceFile.extractedText in DB.
 * librarianAgent and scriptGeneratorAgent read from DB — never re-parse files.
 *
 * Strategies (PDF):
 *   1. pdf-parse npm package  — works on Node 18/20
 *   2. Raw regex on binary   — fallback for Node 22+ (ERR_INVALID_PACKAGE_CONFIG)
 *
 * Returns empty string for scanned/image PDFs (no embedded text).
 */

const MAX_CHARS = 12000   // cap stored text to keep DB rows small

/** Entry point — pick strategy based on file extension */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'pdf') return extractPdf(buffer)
  if (ext === 'txt') return buffer.toString('utf-8').slice(0, MAX_CHARS).trim()
  // docx, xlsx, video, etc. — not supported yet
  return ''
}

// ─── PDF strategies ───────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string> {

  // Strategy 1 — pdf-parse (works on Node 18/20)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    // MAX_CHARS only keeps ~12,000 chars (roughly the first 10-15 pages of a
    // typical academic PDF), so there's no reason to let pdf-parse walk a
    // 200+ page document end to end — `max` stops it early and was the
    // single biggest contributor to "upload feels slow" on large PDFs.
    const data = await pdfParse(buffer, { max: 20 })
    const text = (data.text ?? '').trim()
    if (text.length > 50) {
      return text.slice(0, MAX_CHARS)
    }
  } catch {
    // Silently fall through to Strategy 2
  }

  // Strategy 2 — raw regex (Node 22 compatible, no npm package needed)
  return rawExtractPdf(buffer)
}

function rawExtractPdf(buffer: Buffer): string {
  const raw = buffer.toString('binary')
  const chunks: string[] = []

  // (text)Tj — single string operator
  const singleRe = /\(([^)]{1,300})\)\s*Tj/g
  let m: RegExpExecArray | null
  while ((m = singleRe.exec(raw)) !== null) {
    chunks.push(decodePdfString(m[1]))
  }

  // [(str1)(str2)...]TJ — array operator
  const arrayRe = /\[((?:\([^)]*\)\s*-?\d*\.?\d*\s*)+)\]\s*TJ/g
  while ((m = arrayRe.exec(raw)) !== null) {
    const parts = m[1].match(/\(([^)]{0,300})\)/g) ?? []
    parts.forEach(p => chunks.push(decodePdfString(p.slice(1, -1))))
  }

  const text = chunks
    .map(s => s.replace(/[^\x20-\x7EÀ-ɏ]/g, ' ').trim())
    .filter(s => s.length > 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text.slice(0, MAX_CHARS)
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}
