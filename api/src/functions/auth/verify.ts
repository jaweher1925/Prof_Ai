/**
 * POST /api/auth/verify
 * Body: { email, code }
 *
 * Confirms a signup verification code and — on success — logs the account
 * in (sets the session cookie), same as signup used to do immediately. This
 * is the ONLY place emailVerified flips from false to true.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { signSession, buildSessionCookie } from '../../lib/authTokens'
import { compareCode, MAX_VERIFY_ATTEMPTS } from '../../lib/verificationCode'

const badReq = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

async function verifyHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string; code?: string }
    const email = (body.email || '').trim().toLowerCase()
    const code = (body.code || '').trim()
    if (!email || !code) return badReq('Email and code are required')

    const user = await prisma.user.findUnique({ where: { email } })
    // Same vague-on-purpose posture as login.ts — don't confirm/deny an
    // account's existence via this endpoint either.
    if (!user) return badReq('Invalid or expired code')

    // Already verified (e.g. a stale tab re-submitting, or the code was
    // already used) — idempotent success rather than an error, and log them
    // in same as a fresh verify would.
    if (user.emailVerified) {
      const token = signSession({ sub: user.id, email: user.email, name: user.name, role: user.role })
      return {
        status: 200,
        jsonBody: { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
        headers: { 'Set-Cookie': buildSessionCookie(token) },
      }
    }

    if (!user.verificationCodeHash || !user.verificationCodeExpires) {
      return badReq('No verification code is pending — request a new one')
    }
    if (user.verificationCodeExpires.getTime() < Date.now()) {
      return badReq('This code has expired — request a new one')
    }
    if (user.verificationAttempts >= MAX_VERIFY_ATTEMPTS) {
      return badReq('Too many incorrect attempts — request a new code')
    }

    const valid = await compareCode(code, user.verificationCodeHash)
    if (!valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationAttempts: { increment: 1 } },
      })
      const remaining = MAX_VERIFY_ATTEMPTS - (user.verificationAttempts + 1)
      return badReq(remaining > 0 ? `Incorrect code — ${remaining} attempt(s) left` : 'Too many incorrect attempts — request a new code')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCodeHash: null,
        verificationCodeExpires: null,
        verificationAttempts: 0,
      },
    })

    const token = signSession({ sub: user.id, email: user.email, name: user.name, role: user.role })
    return {
      status: 200,
      jsonBody: { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      headers: { 'Set-Cookie': buildSessionCookie(token) },
    }
  } catch (e) {
    context.error('verify error:', e)
    return err500(e)
  }
}

app.http('authVerify', {
  methods: ['POST'],
  route: 'auth/verify',
  authLevel: 'anonymous',
  handler: verifyHandler,
})
