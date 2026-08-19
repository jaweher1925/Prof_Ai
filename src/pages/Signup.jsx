import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import Spinner from '@/components/ui/Spinner'
import AuthBackground from '@/components/auth/AuthBackground'
import AuthTopBar from '@/components/auth/AuthTopBar'
import TiltCard from '@/components/auth/TiltCard'

export default function Signup() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const { theme } = useTheme()
  // Just two colors, always inverted: dark mode's page is blue so the card
  // is white; light mode's page is white so the card is blue.
  const isDark = theme === 'dark'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const passwordLongEnough = password.length >= 8

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')
    if (!passwordLongEnough) {
      setError('Password must be at least 8 characters')
      return
    }
    setSubmitting(true)
    try {
      const data = await signup(email.trim().toLowerCase(), password, name.trim())
      // Signup no longer logs in directly (email verification) — route to
      // the code-entry screen with the email it needs, carrying along any
      // send failure so VerifyEmail can surface it instead of a silent
      // "check your email" that never arrives.
      navigate('/verify-email', { replace: true, state: { email: data.email, emailError: data.emailError } })
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
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
              <Sparkles className="w-7 h-7 text-white" strokeWidth={1.7} />
            </div>
            <h1 className={cn('text-xl font-bold tracking-tight', isDark ? 'text-slate-900' : 'text-white')}>Create your account</h1>
            <p className={cn('text-sm mt-1 text-center', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Start turning lectures into video courses</p>
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
              <span className={cn('text-xs font-medium mb-1.5 block', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Name</span>
              <div className="relative">
                <User className={cn('w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2', isDark ? 'text-slate-400' : 'text-indigo-200/60')} />
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Professor Smith"
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors',
                    isDark
                      ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-indigo-400/40 focus:border-indigo-400'
                      : 'bg-white/10 border-white/20 text-white placeholder:text-indigo-200/40 focus:ring-white/40 focus:border-white/40'
                  )}
                />
              </div>
            </label>

            <label className="block">
              <span className={cn('text-xs font-medium mb-1.5 block', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Email</span>
              <div className="relative">
                <Mail className={cn('w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2', isDark ? 'text-slate-400' : 'text-indigo-200/60')} />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={cn(
                    'w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors',
                    isDark
                      ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-indigo-400/40 focus:border-indigo-400'
                      : 'bg-white/10 border-white/20 text-white placeholder:text-indigo-200/40 focus:ring-white/40 focus:border-white/40'
                  )}
                />
              </div>
            </label>

            <label className="block">
              <span className={cn('text-xs font-medium mb-1.5 block', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Password</span>
              <div className="relative">
                <Lock className={cn('w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2', isDark ? 'text-slate-400' : 'text-indigo-200/60')} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn(
                    'w-full pl-9 pr-9 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors',
                    isDark
                      ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-indigo-400/40 focus:border-indigo-400'
                      : 'bg-white/10 border-white/20 text-white placeholder:text-indigo-200/40 focus:ring-white/40 focus:border-white/40'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className={cn(
                    'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
                    isDark ? 'text-slate-400 hover:text-slate-600' : 'text-indigo-200/60 hover:text-white'
                  )}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <span className={cn(
                  'flex items-center gap-1 text-xs mt-1.5',
                  passwordLongEnough
                    ? (isDark ? 'text-emerald-600' : 'text-emerald-300')
                    : (isDark ? 'text-slate-400' : 'text-indigo-200/50')
                )}>
                  <Check className="w-3 h-3" /> At least 8 characters
                </span>
              )}
            </label>

            <motion.button
              type="submit"
              disabled={submitting}
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
                : <>Create account <ArrowRight className="w-4 h-4" /></>}
            </motion.button>
          </form>
        </TiltCard>

        <p className="text-center text-sm text-slate-600 dark:text-indigo-100/70 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-indigo-700 dark:text-white hover:text-indigo-900 dark:hover:text-indigo-200 transition-colors">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
