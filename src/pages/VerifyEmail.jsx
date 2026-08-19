import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowRight, AlertCircle, ShieldCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import { authService } from '@/services/auth'
import Spinner from '@/components/ui/Spinner'
import AuthBackground from '@/components/auth/AuthBackground'
import AuthTopBar from '@/components/auth/AuthTopBar'
import TiltCard from '@/components/auth/TiltCard'

// Matches api/src/lib/verificationCode.ts's RESEND_COOLDOWN_SEC — purely
// cosmetic here (the server enforces the real limit), just keeps the button's
// countdown from promising something the backend won't yet accept.
const RESEND_COOLDOWN_SEC = 45

export default function VerifyEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { verifyEmail } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Arrives via navigate state from Signup.jsx (fresh signup) or Login.jsx
  // (an existing-but-unverified account trying to sign in). No email in
  // state means this page was reached directly (e.g. a refresh) with
  // nothing to verify — send back to signup rather than showing a broken
  // form with no destination for the code.
  const email = location.state?.email || ''
  const initialEmailError = location.state?.emailError || ''

  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(initialEmailError ? `Account created, but the verification email couldn't be sent (${initialEmailError}). Try "Resend code" below.` : '')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendMessage, setResendMessage] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  if (!email) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 py-12">
        <AuthBackground />
        <AuthTopBar />
        <div className="relative z-10 text-center">
          <p className="text-sm text-slate-600 dark:text-indigo-100/70 mb-4">Nothing to verify yet.</p>
          <Link to="/signup" className="font-medium text-indigo-700 dark:text-white hover:underline">Create an account</Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting || code.trim().length !== 6) return
    setError('')
    setSubmitting(true)
    try {
      const user = await verifyEmail(email, code.trim())
      const fallback = user?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(fallback, { replace: true })
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setError('')
    setResendMessage('')
    try {
      await authService.resendCode(email)
      setResendMessage('A new code is on its way.')
      setResendCooldown(RESEND_COOLDOWN_SEC)
    } catch (err) {
      setError(err?.message || 'Could not resend the code.')
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-6 py-12">
      <AuthBackground />
      <AuthTopBar />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <TiltCard className={cn(
          'relative rounded-3xl backdrop-blur-2xl shadow-2xl p-8 overflow-hidden border transition-colors duration-300',
          isDark
            ? 'bg-white border-slate-200 shadow-black/20'
            : 'bg-gradient-to-br from-indigo-700 via-indigo-800 to-indigo-900 border-white/10 shadow-indigo-950/40'
        )}>
          <div className="relative flex flex-col items-center mb-7" style={{ transform: 'translateZ(50px)' }}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-lg shadow-indigo-900/40 flex items-center justify-center mb-4 ring-1 ring-white/30">
              <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.7} />
            </div>
            <h1 className={cn('text-xl font-bold tracking-tight', isDark ? 'text-slate-900' : 'text-white')}>Check your email</h1>
            <p className={cn('text-sm mt-1 text-center', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>
              Enter the 6-digit code sent to<br /><span className="font-medium">{email}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative space-y-4" style={{ transform: 'translateZ(24px)' }}>
            {error && (
              <div className={cn(
                'flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm',
                isDark ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-rose-500/15 border-rose-400/30 text-rose-100'
              )}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <label className="block">
              <span className={cn('text-xs font-medium mb-1.5 block', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Verification code</span>
              <div className="relative">
                <Mail className={cn('w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2', isDark ? 'text-slate-400' : 'text-indigo-200/60')} />
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-xl border text-lg tracking-[0.4em] text-center font-semibold focus:outline-none focus:ring-2 transition-colors',
                    isDark
                      ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-indigo-400/40 focus:border-indigo-400'
                      : 'bg-white/10 border-white/20 text-white placeholder:text-indigo-200/30 focus:ring-white/40 focus:border-white/40'
                  )}
                />
              </div>
            </label>

            <motion.button
              type="submit"
              disabled={submitting || code.length !== 6}
              whileHover={{ scale: submitting ? 1 : 1.02 }}
              whileTap={{ scale: submitting ? 1 : 0.98 }}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed',
                isDark
                  ? 'text-white bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
                  : 'text-indigo-800 bg-white hover:bg-indigo-50 shadow-black/20'
              )}
            >
              {submitting
                ? <Spinner size="sm" className={isDark ? 'border-white/30 border-t-white' : 'border-indigo-200 border-t-indigo-700'} />
                : <>Verify <ArrowRight className="w-4 h-4" /></>}
            </motion.button>

            <div className="text-center">
              {resendMessage && !error && (
                <p className={cn('text-xs mb-2', isDark ? 'text-emerald-600' : 'text-emerald-300')}>{resendMessage}</p>
              )}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  isDark ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-100/80 hover:text-white'
                )}
              >
                <RefreshCw className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        </TiltCard>

        <p className="text-center text-sm text-slate-600 dark:text-indigo-100/70 mt-6">
          Wrong email?{' '}
          <Link to="/signup" className="font-medium text-indigo-700 dark:text-white hover:text-indigo-900 dark:hover:text-indigo-200 transition-colors">
            Start over
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
