import React, { createContext, useState, useContext, useEffect, useCallback } from 'react'
import { authService } from '@/services/auth'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Restore a session after a page refresh — the browser already carries the
  // httpOnly pa_session cookie, this just asks the API who that resolves to.
  useEffect(() => {
    authService.me()
      .then((data) => {
        setUser(data.user)
        setIsAuthenticated(true)
      })
      .catch(() => {
        setUser(null)
        setIsAuthenticated(false)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Reacts to a 401 from ANY api call, not just the mount-time check above
  // (see apiClient.js's interceptor) — without this, a session that expired
  // or an API host that restarted mid-session left isAuthenticated stuck
  // "true" until the next full page reload, so App.jsx's route guards never
  // got a chance to redirect back to /login (2026-08-17, "if server stop
  // should go back and re-loging"). Clearing state here re-renders the tree,
  // the current route's RequireAuth/RequireAdmin sees isAuthenticated=false,
  // and redirects to /login with the current path stashed — so logging back
  // in lands you right back where you were (still the admin console, if
  // that's where you were).
  useEffect(() => {
    const onSessionExpired = () => {
      setUser(null)
      setIsAuthenticated(false)
    }
    window.addEventListener('auth:session-expired', onSessionExpired)
    return () => window.removeEventListener('auth:session-expired', onSessionExpired)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password)
    setUser(data.user)
    setIsAuthenticated(true)
    return data.user
  }, [])

  // No longer logs in immediately (2026-08-15, email verification) — the
  // account is created but gated until the code is entered, so this just
  // returns the raw signup response ({ needsVerification: true, email, ...})
  // for Signup.jsx to route on, instead of assuming a session was created.
  const signup = useCallback(async (email, password, name) => {
    return authService.signup(email, password, name)
  }, [])

  // Completes the code-entry step — this IS the moment a new account
  // actually gets a session, mirroring what signup used to do on its own.
  const verifyEmail = useCallback(async (email, code) => {
    const data = await authService.verify(email, code)
    setUser(data.user)
    setIsAuthenticated(true)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try { await authService.logout() } catch { /* clear local state regardless */ }
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, signup, verifyEmail, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
