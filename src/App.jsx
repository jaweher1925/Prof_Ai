import React from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { ThemeProvider, useTheme } from '@/lib/ThemeContext'
import AppLayout from '@/components/layout/AppLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import { PageTransition } from '@/components/layout/PageTransition'
import Spinner from '@/components/ui/Spinner'
import AppBackground from '@/components/common/AppBackground'

// Pages
import Welcome from '@/pages/Welcome'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import VerifyEmail from '@/pages/VerifyEmail'
import Dashboard from '@/pages/Dashboard'
import ProjectWorkspace from '@/pages/ProjectWorkspace'
import Library from '@/pages/Library'
import Director from '@/pages/Director'
import NotFound from '@/pages/NotFound'
import AdminOverview from '@/pages/admin/AdminOverview'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminUserDetail from '@/pages/admin/AdminUserDetail'
import AdminProjects from '@/pages/admin/AdminProjects'
import AdminProjectDetail from '@/pages/admin/AdminProjectDetail'
import AdminSpendByUser from '@/pages/admin/AdminSpendByUser'
import AdminSettings from '@/pages/admin/AdminSettings'

// Gates the app pages behind a real session — anyone not signed in gets
// bounced to /login with the page they wanted stashed in location state, so
// Login can send them straight back after they sign in instead of always
// landing on /dashboard.
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

// Same session check as RequireAuth, plus a role check — a signed-in
// professor hitting /admin/* gets sent to their own dashboard instead of an
// admin screen they have no access to (not back to /login, since they ARE
// authenticated, just not authorized for this section).
function RequireAdmin({ children }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function AnimatedRoutes() {
  const location = useLocation()
  const { isLoading, isAuthenticated, user } = useAuth()

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

        {/* Welcome page — full screen, no sidebar, launch variant. An
            already-authenticated admin skips straight to /admin instead of
            landing on the marketing page (2026-08-17: "when open admin
            account should be open default console admin /admin") — a
            professor session still sees Welcome normally, since Welcome's
            own nav already lets them jump to /dashboard when they want to,
            and there's no equivalent reason to force them off it. */}
        <Route path="/" element={
          isAuthenticated && user?.role === 'admin'
            ? <Navigate to="/admin" replace />
            : (
              <PageTransition variant="launch">
                <Welcome />
              </PageTransition>
            )
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
        <Route path="/verify-email" element={
          <PageTransition variant="launch">
            <VerifyEmail />
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

        {/* Admin pages — separate rail (AdminLayout, not AppLayout), gated on
            role rather than just session. */}
        <Route path="/admin" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminOverview />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/users" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminUsers />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/users/:id" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminUserDetail />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/projects" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminProjects />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/projects/:id" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminProjectDetail />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/spend" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminSpendByUser />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
        } />
        <Route path="/admin/settings" element={
          <RequireAdmin>
            <AdminLayout>
              <PageTransition>
                <AdminSettings />
              </PageTransition>
            </AdminLayout>
          </RequireAdmin>
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
