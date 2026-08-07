/**
 * POST /api/auth/signup
 * Creates a new account and immediately logs it in (sets the session cookie),
 * same as most signup flows — no separate "now log in" step.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/db'
import { signSession, buildSessionCookie } from '../../lib/authTokens'

const badReq = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function signupHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; name?: string }
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''
    const name = (body.name || '').trim() || null

    if (!email || !EMAIL_RE.test(email)) return badReq('Enter a valid email address')
    if (password.length < 8) return badReq('Password must be at least 8 characters')

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return badReq('An account with this email already exists')

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { email, passwordHash, name } })

    const token = signSession({ sub: user.id, email: user.email, name: user.name })
    return {
      status: 201,
      jsonBody: { user: { id: user.id, email: user.email, name: user.name } },
      headers: { 'Set-Cookie': buildSessionCookie(token) },
    }
  } catch (e) {
    context.error('signup error:', e)
    return err500(e)
  }
}

app.http('authSignup', {
  methods: ['POST'],
  route: 'auth/signup',
  authLevel: 'anonymous',
  handler: signupHandler,
})
