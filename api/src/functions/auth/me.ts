/**
 * GET /api/auth/me — resolves the current session cookie to the actual user
 * record. AuthContext calls this once on app load to restore a session
 * after a page refresh.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'

async function meHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const swaUser = getUser(request)
  if (!swaUser) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  // The LOCAL_DEV mock user (see api/src/lib/auth.ts) has no real row in the
  // users table — return it as-is instead of a DB lookup that would 404.
  if (swaUser.identityProvider === 'dev') {
    return { status: 200, jsonBody: { user: { id: swaUser.userId, email: swaUser.userDetails, name: 'Local Dev' } } }
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: swaUser.userId } })
    if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }
    return { status: 200, jsonBody: { user: { id: user.id, email: user.email, name: user.name } } }
  } catch (e) {
    context.error('me error:', e)
    return { status: 500, jsonBody: { error: (e as any)?.message || 'Internal error' } }
  }
}

app.http('authMe', {
  methods: ['GET'],
  route: 'auth/me',
  authLevel: 'anonymous',
  handler: meHandler,
})
