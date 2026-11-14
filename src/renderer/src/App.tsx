// OWNER: orchestrator. Routing + guards.
import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/lib/auth'
import { loadTheme } from '@/lib/theme'
import { AppShell } from '@/components/layout/AppShell'
import { VaultMark } from '@/components/common/Logo'
import { AuthPage } from '@/pages/auth/AuthPage'
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage'
import { VaultPage } from '@/pages/vault/VaultPage'
import { CleanupPage } from '@/pages/cleanup/CleanupPage'
import { SummaryPage } from '@/pages/summary/SummaryPage'
import { SubscriptionsPage } from '@/pages/subscriptions/SubscriptionsPage'
import { SupportPage } from '@/pages/support/SupportPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

function Splash(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <VaultMark size={72} glow />
    </div>
  )
}

function Guard({ need }: { need: 'anon' | 'onboarding' | 'app' }): React.JSX.Element {
  const { user, loading } = useAuth()
  useEffect(() => {
    if (user) void loadTheme()
  }, [user])
  if (loading) return <Splash />
  if (!user) return need === 'anon' ? <AuthPage /> : <Navigate to="/auth" replace />
  if (!user.onboarded) return need === 'onboarding' ? <OnboardingPage /> : <Navigate to="/onboarding" replace />
  if (need !== 'app') return <Navigate to="/app/vault" replace />
  return <AppShell />
}

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/auth" element={<Guard need="anon" />} />
          <Route path="/onboarding" element={<Guard need="onboarding" />} />
          <Route path="/app" element={<Guard need="app" />}>
            <Route index element={<Navigate to="vault" replace />} />
            <Route path="vault" element={<VaultPage />} />
            <Route path="cleanup" element={<CleanupPage />} />
            <Route path="summary" element={<SummaryPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/app/vault" replace />} />
        </Routes>
      </HashRouter>
      <Toaster
        position="bottom-center"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'Plus Jakarta Sans', borderRadius: 16 } }}
      />
    </AuthProvider>
  )
}
