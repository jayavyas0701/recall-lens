// OWNER: orchestrator
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ApiKeyBanner } from './ApiKeyBanner'
import { AppAurora } from '@/components/common/Aurora'
import { SupportWidget } from '@/features/support/SupportWidget'

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  // Freeze the outlet per route so the exiting page keeps rendering itself during the exit animation.
  const outlet = useOutlet()
  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <AppAurora />
      <Sidebar />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ApiKeyBanner />
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} className="min-h-full">
              {outlet}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <SupportWidget />
    </div>
  )
}
