import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight, AlertCircle, Eye, EyeOff, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import Spinner from '@/components/ui/Spinner'
import AuthBackground from '@/components/auth/AuthBackground'
import AuthTopBar from '@/components/auth/AuthTopBar'
import TiltCard from '@/components/auth/TiltCard'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { theme } = useTheme()
  // Just two colors, always inverted: dark mode's page is blue so the card
  // is white; light mode's page is white so the card is blue. Never
  // white-on-white or blue-on-blue.
  const isDark = theme === 'dark'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Route guards redirect here with the page the user was trying to reach —
  // send them back there instead of always dumping everyone on /dashboard.
  // No "from" state (e.g. arriving fresh from Welcome's "Sign in") falls
  // back by role: admins land on /admin, professors on /dashboard.
  const redirectTo = location.state?.from

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const loggedInUser = await login(email.trim().toLowerCase(), password)
      const fallback = loggedInUser?.role === 'admin' ? '/admin' : '/dashboard'
      navigate(redirectTo || fallback, { replace: true })
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
          {/* Logo badge popped forward in Z for real layered depth when the
              card tilts, not just a flat image sitting on the glass. */}
          <div className="relative flex flex-col items-center mb-7" style={{ transform: 'translateZ(50px)' }}>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-lg shadow-indigo-900/40 flex items-center justify-center mb-4 ring-1 ring-white/30">
              <GraduationCap className="w-7 h-7 text-white" strokeWidth={1.7} />
            </div>
            <h1 className={cn('text-xl font-bold tracking-tight', isDark ? 'text-slate-900' : 'text-white')}>Welcome back</h1>
            <p className={cn('text-sm mt-1', isDark ? 'text-slate-500' : 'text-indigo-100/70')}>Sign in to continue to ProfAI</p>
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
                  autoComplete="current-password"
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
                : <>Sign in <ArrowRight className="w-4 h-4" /></>}
            </motion.button>
          </form>
        </TiltCard>

        <p className="text-center text-sm text-slate-600 dark:text-indigo-100/70 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-indigo-700 dark:text-white hover:text-indigo-900 dark:hover:text-indigo-200 transition-colors">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
