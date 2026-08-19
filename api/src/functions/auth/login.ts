/**
 * POST /api/auth/login
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/db'
import { signSession, buildSessionCookie } from '../../lib/authTokens'

const badReq  = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const unauth  = () => ({ status: 401, jsonBody: { error: 'Incorrect email or password' } } as HttpResponseInit)
const err500  = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

async function loginHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string }
    const email = (body.email || '').trim().toLowerCase()
    const password = body.password || ''
    if (!email || !password) return badReq('Email and password are required')

    const user = await prisma.user.findUnique({ where: { email } })
    // Same "incorrect email or password" message whether the account
    // doesn't exist or the password is wrong — don't leak which emails have
    // accounts.
    if (!user) return unauth()

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return unauth()

    // Password is correct at this point, so it's safe to disclose
    // verification status (unlike the "incorrect email or password" case
    // above, this doesn't leak whether the account exists to someone who
    // doesn't already know the password). A distinct needsVerification flag
    // lets the frontend route straight to the code-entry screen instead of
    // showing a generic auth error the user can't act on.
    if (!user.emailVerified) {
      return {
        status: 403,
        jsonBody: { error: 'Please verify your email before signing in', needsVerification: true, email: user.email },
      }
    }

    const token = signSession({ sub: user.id, email: user.email, name: user.name, role: user.role })
    return {
      status: 200,
      jsonBody: { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      headers: { 'Set-Cookie': buildSessionCookie(token) },
    }
  } catch (e) {
    context.error('login error:', e)
    return err500(e)
  }
}

app.http('authLogin', {
  methods: ['POST'],
  route: 'auth/login',
  authLevel: 'anonymous',
  handler: loginHandler,
})
