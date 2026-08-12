/**
 * Session tokens for email/password auth (replaces the earlier
 * Azure-Static-Web-Apps-only login). A signed JWT is stored in an httpOnly
 * cookie so the browser can't read/tamper with it via JS, and every request
 * automatically carries it (same-origin, via the Vite dev proxy locally and
 * the same host in production) without the frontend having to manage tokens
 * itself.
 */
import './env'
import jwt from 'jsonwebtoken'
import { env } from './env'

export const SESSION_COOKIE = 'pa_session'
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60 // 30 days

export interface SessionPayload {
  sub: string    // user id
  email: string
  name?: string | null
  // "professor" | "admin" — embedded in the JWT itself (not just looked up
  // fresh from the DB on every request) so requireAdmin() can check it
  // without an extra query on every single admin-route hit. Session tokens
  // last 30 days (SESSION_MAX_AGE_SEC below), so a role change (promote/
  // demote) won't take effect for an already-logged-in user until they log
  // in again — acceptable for this app's scale, but worth knowing if a
  // "revoke admin immediately" requirement ever comes up.
  role?: string
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_MAX_AGE_SEC })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionPayload
  } catch {
    return null
  }
}

/** Builds the Set-Cookie header value for logging a session in. */
export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ]
  // Secure requires HTTPS — only add it outside local dev (plain http://localhost).
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

/** Builds the Set-Cookie header value that clears the session (logout). */
export function buildClearedSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

/** Reads the session cookie's raw token out of a request's Cookie header. */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}
