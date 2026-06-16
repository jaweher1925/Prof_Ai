/**
 * Storage helper — saves files to local disk for development.
 * When you get Azure Storage later, swap this implementation out.
 * The upload.ts function only calls uploadFromForm() — interface stays the same.
 */
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

// Files are saved to api/uploads/ and served by the local dev server
const UPLOAD_DIR = join(process.cwd(), 'uploads')

export async function uploadFromForm(file: File): Promise<string> {
  // Ensure uploads directory exists
  await mkdir(UPLOAD_DIR, { recursive: true })

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const fileName = `${randomUUID()}.${ext}`
  const filePath = join(UPLOAD_DIR, fileName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  // Return a URL that Vite dev server can serve
  // In production with Azure, this would be the Blob Storage URL
  return `/api/uploads/${fileName}`
}

export async function uploadBuffer(
  buffer: Buffer,
  ext: string,
  // contentType is used when switching to Azure Blob — ignored for local disk
  _contentType?: string
): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true })
  const fileName = `${randomUUID()}.${ext}`
  await writeFile(join(UPLOAD_DIR, fileName), buffer)
  return `/api/uploads/${fileName}`
}