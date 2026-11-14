// OWNER: subagent D. Monthly / Yearly animated pill toggle.
// Note: deliberately no framer `layoutId` here — layout-projected elements mounting during the AppShell's
// AnimatePresence exit can stall the route transition. A single measured pill animates instead.
import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Billing } from '@shared/types'
import { cn } from '@/lib/utils'

export function BillingToggle({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }): React.JSX.Element {
  const refs = useRef<Record<Billing, HTMLButtonElement | null>>({ monthly: null, yearly: null })
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const el = refs.current[value]
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value])

  return (
    <div className="glass relative inline-flex items-center gap-1 rounded-full p-1.5">
      {pill && (
        <motion.span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 rounded-full bg-grad shadow-glow-violet"
          initial={false}
          animate={{ left: pill.left, width: pill.width }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      {(['monthly', 'yearly'] as const).map((b) => (
        <button
          key={b}
          ref={(el) => {
            refs.current[b] = el
          }}
          data-billing={b}
          onClick={() => onChange(b)}
          className={cn(
            'relative z-10 flex h-9 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors duration-300 cursor-pointer',
            value === b ? 'text-white' : 'text-ink-soft hover:text-ink'
          )}
        >
          {b === 'monthly' ? 'Monthly' : 'Yearly'}
          {b === 'yearly' && (
            <motion.span
              animate={value === 'yearly' ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.4 }}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide transition-colors',
                value === 'yearly' ? 'bg-white/25 text-white' : 'bg-lime/20 text-[#4d7c0f]'
              )}
            >
              Save 20%
            </motion.span>
          )}
        </button>
      ))}
    </div>
  )
}
