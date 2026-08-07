import React from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { ThemeProvider, useTheme } from '@/lib/ThemeContext'
import AppLayout from '@/components/layout/AppLayout'
import { PageTransition } from '@/components/layout/PageTransition'
import Spinner from '@/components/ui/Spinner'
import AppBackground from '@/components/common/AppBackground'

// Pages
import Welcome from '@/pages/Welcome'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Dashboard from '@/pages/Dashboard'
import ProjectWorkspace from '@/pages/ProjectWorkspace'
import Library from '@/pages/Library'
import Director from '@/pages/Director'
import NotFound from '@/pages/NotFound'

// Gates the app pages behind a real session — anyone not signed in gets
// bounced to /login with the page they wanted stashed in location state, so
// Login can send them straight back after they sign in instead of always
// landing on /dashboard.
//
// TEMPORARILY DISABLED — per request, "Get Started" should drop straight
// into /dashboard without going through login/signup for now. The login/
// signup pages, API, and session cookie are all still fully built and
// working; re-enable by restoring the commented block below.
function RequireAuth({ children }) {
  // const { isAuthenticated } = useAuth()
  // const location = useLocation()
  // if (!isAuthenticated) {
  //   return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // }
  return children
}

function AnimatedRoutes() {
  const location = useLocation()
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  const isWelcome = location.pathname === '/'

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>

        {/* Welcome page — full screen, no sidebar, launch variant */}
        <Route path="/" element={
          <PageTransition variant="launch">
            <Welcome />
          </PageTransition>
        } />

        {/* Auth pages — full screen, no sidebar, not gated */}
        <Route path="/login" element={
          <PageTransition variant="launch">
            <Login />
          </PageTransition>
        } />
        <Route path="/signup" element={
          <PageTransition variant="launch">
            <Signup />
          </PageTransition>
        } />

        {/* App pages — inside sidebar layout, require a signed-in session */}
        <Route path="/dashboard" element={
          <RequireAuth>
            <AppLayout>
              <PageTransition variant={isWelcome ? 'launch' : 'page'}>
                <Dashboard />
              </PageTransition>
            </AppLayout>
          </RequireAuth>
        } />
        <Route path="/workspace" element={
          <RequireAuth>
            <AppLayout>
              <PageTransition>
                <ProjectWorkspace />
              </PageTransition>
            </AppLayout>
          </RequireAuth>
        } />
        <Route path="/library" element={
          <RequireAuth>
            <AppLayout>
              <PageTransition>
                <Library />
              </PageTransition>
            </AppLayout>
          </RequireAuth>
        } />
        <Route path="/director" element={
          <RequireAuth>
            <AppLayout>
              <PageTransition>
                <Director />
              </PageTransition>
            </AppLayout>
          </RequireAuth>
        } />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  )
}

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="bottom-right" theme={theme} />
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            {/* Mounted once here instead of per-page — every route just
                needs a transparent (not opaque) root background to let this
                show through. See AppLayout/Dashboard/ProjectWorkspace/
                Welcome/Login/Signup. */}
            <AppBackground />
            <AnimatedRoutes />
            <ThemedToaster />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
