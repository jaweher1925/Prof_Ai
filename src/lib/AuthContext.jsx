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

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password)
    setUser(data.user)
    setIsAuthenticated(true)
    return data.user
  }, [])

  const signup = useCallback(async (email, password, name) => {
    const data = await authService.signup(email, password, name)
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
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
