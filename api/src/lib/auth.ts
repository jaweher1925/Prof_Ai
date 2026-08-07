import { HttpRequest } from '@azure/functions'
import './env'  // ensure .env is loaded before checking LOCAL_DEV
import { readSessionCookie, verifySession } from './authTokens'

export interface SwaUser {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

const DEV_USER: SwaUser = {
  identityProvider: 'dev',
  userId: 'local-dev-user',
  userDetails: 'developer@localhost',
  userRoles: ['authenticated', 'anonymous'],
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
