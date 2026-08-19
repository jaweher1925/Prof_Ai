/**
 * POST /api/auth/signup
 *
 * Creates a new account but does NOT log it in yet (2026-08-15, "for the
 * create account should have system that with email verification code or
 * something like that") — a 6-digit code is emailed and the account stays
 * gated until POST /api/auth/verify confirms it. The frontend routes to
 * /verify-email on the { needsVerification: true } response instead of the
 * old immediate-redirect-to-dashboard flow.
 *
 * Existing accounts (created before this feature existed) are unaffected —
 * see User.emailVerified's schema comment: the column defaults to TRUE, and
 * only THIS handler explicitly creates new users with it set to false.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/db'
import { generateCode, hashCode, codeExpiresAt } from '../../lib/verificationCode'
import { sendVerificationEmail } from '../../lib/mailer'

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
    // An unverified row isn't a real account yet from the user's point of
    // view (2026-08-17: "before create the account should verify first") —
    // it only exists so the code has something to attach to. Blocking a
    // retry here is exactly what left people stuck when the first attempt's
    // email failed to send (SMTP misconfigured, bad credentials, etc.): the
    // email was permanently "taken" by a signup that never actually
    // finished. Only a VERIFIED existing account is a real conflict — an
    // unverified one just gets its password/name/code overwritten and a
    // fresh code sent, as if starting over.
    if (existing && existing.emailVerified) return badReq('An account with this email already exists')

    const passwordHash = await bcrypt.hash(password, 10)
    const code = generateCode()
    const verificationCodeHash = await hashCode(code)

    const user = existing
      ? await prisma.user.update({
          where: { email },
          data: {
            passwordHash,
            name,
            verificationCodeHash,
            verificationCodeExpires: codeExpiresAt(),
            verificationSentAt: new Date(),
            verificationAttempts: 0,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            passwordHash,
            name,
            emailVerified: false,
            verificationCodeHash,
            verificationCodeExpires: codeExpiresAt(),
            verificationSentAt: new Date(),
          },
        })

    try {
      await sendVerificationEmail(email, code)
    } catch (e: any) {
      // The account exists but the code never arrived — don't leave the user
      // stuck with no path forward. Still respond needsVerification:true
      // (they can hit /api/auth/resend-code once SMTP is fixed) but flag the
      // send failure so the frontend can show something more useful than a
      // silent "check your email" that never resolves.
      context.error(`signup: verification email failed to send for ${email}:`, e)
      return {
        status: 201,
        jsonBody: { needsVerification: true, email: user.email, emailError: e?.message || 'Could not send the verification email' },
      }
    }

    return { status: 201, jsonBody: { needsVerification: true, email: user.email } }
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
