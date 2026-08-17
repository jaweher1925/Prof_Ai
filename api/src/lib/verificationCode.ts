/**
 * Shared 6-digit email-verification code logic — used by auth/signup.ts,
 * auth/verify.ts, and auth/resendCode.ts so all three agree on format,
 * expiry, and rate limits instead of drifting.
 */
import { randomInt } from 'crypto'
import bcrypt from 'bcryptjs'

export const CODE_EXPIRY_MIN = 10
export const MAX_VERIFY_ATTEMPTS = 5
// Minimum time between sends — cheap abuse guard (someone spamming "resend"
// against a real mailbox they don't own) and keeps SMTP send volume sane.
export const RESEND_COOLDOWN_SEC = 45

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10)
}

export function compareCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash)
}

export function codeExpiresAt(): Date {
  return new Date(Date.now() + CODE_EXPIRY_MIN * 60_000)
}
