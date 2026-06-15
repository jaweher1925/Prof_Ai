import React, { createContext, useState, useContext, useEffect } from 'react'

const AuthContext = createContext()

async function fetchSwaUser() {
  try {
    const res = await fetch('/.auth/me')
    if (!res.ok) return null
    const payload = await res.json()
    return payload?.clientPrincipal ?? null
  } catch {
    return null
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSwaUser().then((principal) => {
      if (principal) {
        setUser(principal)
        setIsAuthenticated(true)
      }
      setIsLoading(false)
    })
  }, [])

  const login = (returnUrl = window.location.href) => {
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(returnUrl)}`
  }

  const logout = () => {
    window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
