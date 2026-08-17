/**
 * Outbound email — currently just the signup email-verification code
 * (2026-08-15, "for the create account should have system that with email
 * verification code or something like that").
 *
 * Uses plain SMTP (nodemailer) rather than a transactional-email API
 * (Resend/SendGrid/etc.) — no new third-party account needed, just an
 * existing mailbox's SMTP credentials (e.g. a Gmail "app password"). Trade-
 * off: SMTP from Gmail/Outlook is more likely to land in spam and rate-limits
 * faster than a real transactional provider, which is fine at this app's
 * current scale but worth revisiting if signup volume ever grows.
 */
import './env'
import nodemailer from 'nodemailer'
import { env } from './env'

let cachedTransporter: nodemailer.Transporter | null = null

function transporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM) in api/.env')
  }
  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; 587/25 start plaintext then STARTTLS — nodemailer
    // needs to know which up front, it can't detect this from the port alone.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  return cachedTransporter
}

/** Sends the 6-digit signup verification code. Throws on failure — callers
 *  (auth/signup.ts, auth/resendCode.ts) decide how to surface that to the
 *  user rather than this silently swallowing a bad SMTP config. */
export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const from = env.SMTP_FROM || env.SMTP_USER
  await transporter().sendMail({
    from: `ProfAI <${from}>`,
    to,
    subject: `${code} is your ProfAI verification code`,
    text: `Your ProfAI verification code is ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <p style="font-size:14px;color:#475569;margin:0 0 16px">Enter this code to verify your ProfAI account:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1e1b4b;background:#eef2ff;border-radius:12px;padding:16px 0;text-align:center">${code}</div>
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
  })
}
