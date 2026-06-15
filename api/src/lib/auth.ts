import { HttpRequest } from '@azure/functions'
import './env'  // ensure .env is loaded before checking LOCAL_DEV

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

export function getUser(request: HttpRequest): SwaUser | null {
  // In local development, skip SWA auth and return a mock user
  if (IS_LOCAL_DEV) return DEV_USER

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
