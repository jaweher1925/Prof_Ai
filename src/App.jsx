import React from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider, useAuth } from '@/lib/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import { PageTransition } from '@/components/layout/PageTransition'
import Spinner from '@/components/ui/Spinner'

// Pages
import Welcome from '@/pages/Welcome'
import Dashboard from '@/pages/Dashboard'
import ProjectWorkspace from '@/pages/ProjectWorkspace'
import Library from '@/pages/Library'
import Integrations from '@/pages/Integrations'
import DigitalTwinVault from '@/pages/DigitalTwinVault'
import Director from '@/pages/Director'
import NotFound from '@/pages/NotFound'

function AnimatedRoutes() {
  const location = useLocation()
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
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

        {/* App pages — inside sidebar layout */}
        <Route path="/dashboard" element={
          <AppLayout>
            <PageTransition variant={isWelcome ? 'launch' : 'page'}>
              <Dashboard />
            </PageTransition>
          </AppLayout>
        } />
        <Route path="/workspace" element={
          <AppLayout>
            <PageTransition>
              <ProjectWorkspace />
            </PageTransition>
          </AppLayout>
        } />
        <Route path="/library" element={
          <AppLayout>
            <PageTransition>
              <Library />
            </PageTransition>
          </AppLayout>
        } />
        <Route path="/director" element={
          <AppLayout>
            <PageTransition>
              <Director />
            </PageTransition>
          </AppLayout>
        } />
        <Route path="/vault" element={
          <AppLayout>
            <PageTransition>
              <DigitalTwinVault />
            </PageTransition>
          </AppLayout>
        } />
        <Route path="/integrations" element={
          <AppLayout>
            <PageTransition>
              <Integrations />
            </PageTransition>
          </AppLayout>
        } />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AnimatedRoutes />
          <Toaster position="bottom-right" theme="dark" />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
