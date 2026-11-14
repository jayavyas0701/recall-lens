// OWNER: orchestrator. Dashboard stat widget with count-up.
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { CountUp } from './CountUp'
import { fadeUp } from './Page'

export function StatCard({ label, value, decimals = 0, suffix, icon, gradient = 'var(--cv-grad)' }: { label: string; value: number; decimals?: number; suffix?: string; icon: ReactNode; gradient?: string }): React.JSX.Element {
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -4 }} className="glass relative overflow-hidden rounded-2xl p-4">
      <div className="absolute -right-6 -top-6 size-24 rounded-full opacity-20 blur-xl" style={{ background: gradient }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
        <span className="flex size-8 items-center justify-center rounded-xl text-white [&_svg]:size-4" style={{ background: gradient }}>
          {icon}
        </span>
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-ink">
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
    </motion.div>
  )
}
