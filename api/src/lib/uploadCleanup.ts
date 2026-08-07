/**
 * Deletes a previously-uploaded file once it's been replaced by a new one.
 *
 * Every render/upload step (slide PNG, Visual Designer WYSIWYG snapshot, scene
 * video, avatar clip, module video) always writes a brand new
 * randomUUID()-named file and just repoints the DB's *Url field at it — the
 * old file was never cleaned up. Regenerating the same scene/module a few
 * times during normal editing silently accumulated orphaned files forever
 * (this is why uploads/ grew to 800+ files for a course that only ever had a
 * handful of scenes at any one time).
 *
 * Call this right after a DB write successfully repoints a *Url field at a
 * new file, passing the value that field held BEFORE the update.
 *
 * Best-effort and silent by design: a failed cleanup should never break the
 * actual generation/save — regenerating content matters more than freeing
 * disk space, so this never throws.
 */
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

export function deleteOldUpload(oldUrl?: string | null, newUrl?: string | null): void {
  if (!oldUrl) return
  if (oldUrl === newUrl) return // nothing actually changed — don't delete the file still in use
  // Only ever touch our own local /api/uploads/{filename} URLs — never an
  // external URL, and never the heygen:<id> pending-job sentinel some fields
  // (Scene.avatarVideoUrl) transiently hold.
  const match = oldUrl.match(/^\/api\/uploads\/([^/?]+)$/)
  if (!match) return
  const path = join(UPLOAD_DIR, match[1])
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch { /* best-effort — never let cleanup break the caller */ }
}
