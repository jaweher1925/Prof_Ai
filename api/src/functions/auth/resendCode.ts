/**
 * POST /api/auth/resend-code
 * Body: { email }
 *
 * Issues a fresh 6-digit code for an unverified account — used by the
 * verify-email screen's "Resend code" button, and to recover an account
 * whose original signup email failed to send (see signup.ts's emailError).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { generateCode, hashCode, codeExpiresAt, RESEND_COOLDOWN_SEC } from '../../lib/verificationCode'
import { sendVerificationEmail } from '../../lib/mailer'

const badReq = (msg: string) => ({ status: 400, jsonBody: { error: msg } } as HttpResponseInit)
const err500 = (e: any) => ({ status: 500, jsonBody: { error: e?.message || 'Internal error' } } as HttpResponseInit)

async function resendCodeHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string }
    const email = (body.email || '').trim().toLowerCase()
    if (!email) return badReq('Email is required')

    const user = await prisma.user.findUnique({ where: { email } })
    // Don't confirm/deny account existence — but DO still say "sent" so a
    // typo'd email doesn't tell an attacker which addresses have accounts.
    if (!user) return { status: 200, jsonBody: { sent: true } }
    if (user.emailVerified) return badReq('This account is already verified — try logging in')

    if (user.verificationSentAt) {
      const elapsedSec = (Date.now() - user.verificationSentAt.getTime()) / 1000
      if (elapsedSec < RESEND_COOLDOWN_SEC) {
        return badReq(`Please wait ${Math.ceil(RESEND_COOLDOWN_SEC - elapsedSec)}s before requesting another code`)
      }
    }

    const code = generateCode()
    const verificationCodeHash = await hashCode(code)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCodeHash,
        verificationCodeExpires: codeExpiresAt(),
        verificationSentAt: new Date(),
        verificationAttempts: 0, // fresh code, fresh attempt budget
      },
    })

    await sendVerificationEmail(email, code)
    return { status: 200, jsonBody: { sent: true } }
  } catch (e: any) {
    context.error('resendCode error:', e)
    return err500(e)
  }
}

app.http('authResendCode', {
  methods: ['POST'],
  route: 'auth/resend-code',
  authLevel: 'anonymous',
  handler: resendCodeHandler,
})
