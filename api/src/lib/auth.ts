import { HttpRequest } from '@azure/functions'
import './env'  // ensure .env is loaded before checking LOCAL_DEV
import { readSessionCookie, verifySession } from './authTokens'

export interface SwaUser {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
  // App-level role ("professor" | "admin"), distinct from userRoles above
  // (which is SWA's own auth-level concept — "authenticated"/"anonymous" —
  // and stays as-is for back-compat). Optional because the legacy SWA
  // x-ms-client-principal header path never sets it.
  appRole?: string
}

const DEV_USER: SwaUser = {
  identityProvider: 'dev',
  userId: 'local-dev-user',
  userDetails: 'developer@localhost',
  userRoles: ['authenticated', 'anonymous'],
  // Local dev defaults to admin so the admin dashboard is reachable without
  // having to seed+promote an account on every fresh local DB — see
  // api/scripts/promoteAdmin.ts for the real, non-dev path.
  appRole: 'admin',
}

//when we will work with Azure Static Web Apps, the API will be protected by SWA auth, which will inject the x-ms-client-principal header containing user info. However, in local development, we won't have that header, so we can use a mock user to simplify development and testing of authenticated routes.
//so delete this ligne when you will work with Azure Static Web Apps and set the LOCAL_DEV environment variable to true in your local development environment to enable the mock user.
const IS_LOCAL_DEV = process.env.LOCAL_DEV === 'true'

/**
 * Identity resolution, in priority order:
 *   1. Our own email/password session cookie (api/src/lib/authTokens.ts) —
 *      set by POST /api/auth/login and /api/auth/signup. This is now the
 *      real, primary identity source.
 *   2. LOCAL_DEV mock user — lets routes work locally without having to
 *      sign in every time while iterating.
 *   3. The legacy SWA `x-ms-client-principal` header — kept in case this
 *      ever runs behind Azure Static Web Apps' AAD auth again, but nothing
 *      issues that header in the current email/password flow.
 */
export function getUser(request: HttpRequest): SwaUser | null {
  const sessionToken = readSessionCookie(request.headers.get('cookie'))
  if (sessionToken) {
    const payload = verifySession(sessionToken)
    if (payload) {
      return {
        identityProvider: 'password',
        userId: payload.sub,
        userDetails: payload.email,
        userRoles: ['authenticated'],
        appRole: payload.role || 'professor',
      }
    }
    // Cookie present but invalid/expired — fall through rather than silently
    // granting the local-dev mock user, so an expired session in a
    // production-like environment still resolves to "logged out".
  }

  if (IS_LOCAL_DEV && !sessionToken) return DEV_USER

  const header = request.headers.get('x-ms-client-principal')
  if (!header) return null
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf-8')) as SwaUser
  } catch {
    return null
  }
}

export function requireUser(request: HttpRequest): SwaUser {
  const user = getUser(request)
  if (!user) throw { status: 401, message: 'Unauthenticated' }
  return user
}

/** Same as requireUser(), but also rejects anyone whose appRole isn't
 *  "admin" — throws 403 (not 401) so a signed-in professor hitting an admin
 *  endpoint gets "you don't have access" rather than "log in again". */
export function requireAdmin(request: HttpRequest): SwaUser {
  const user = requireUser(request)
  if (user.appRole !== 'admin') throw { status: 403, message: 'Admin access required' }
  return user
}
