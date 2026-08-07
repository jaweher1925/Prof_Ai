/**
 * POST /api/auth/logout — clears the session cookie. Always succeeds, even
 * if the caller wasn't logged in.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { buildClearedSessionCookie } from '../../lib/authTokens'

async function logoutHandler(_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: { ok: true },
    headers: { 'Set-Cookie': buildClearedSessionCookie() },
  }
}

app.http('authLogout', {
  methods: ['POST'],
  route: 'auth/logout',
  authLevel: 'anonymous',
  handler: logoutHandler,
})
