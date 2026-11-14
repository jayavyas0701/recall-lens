// OWNER: orchestrator. Friendly illustrated empty state.
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function EmptyState({ title, description, action, emoji = '🫙' }: { title: string; description?: string; action?: ReactNode; emoji?: string }): React.JSX.Element {
  return (
    <div className="glass relative flex flex-col items-center justify-center overflow-hidden rounded-3xl px-8 py-14 text-center">
      <div className="absolute -top-16 left-1/2 size-64 -translate-x-1/2 rounded-full bg-grad opacity-15 blur-3xl" />
      <motion.div
        className="relative mb-5 flex size-24 items-center justify-center rounded-[2rem] bg-white text-5xl shadow-soft"
        animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {emoji}
        <motion.span className="absolute -right-2 -top-2 text-xl" animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>
          ✨
        </motion.span>
      </motion.div>
      <h3 className="relative text-xl font-bold text-ink">{title}</h3>
      {description && <p className="relative mt-1.5 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  )
}
