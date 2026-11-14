// OWNER: subagent D. Glass settings section card.
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { fadeUp } from '@/components/common/Page'
import { cn } from '@/lib/utils'

export function Section({
  icon,
  title,
  description,
  action,
  gradient = 'var(--cv-grad)',
  children,
  className,
  id
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  gradient?: string
  children: ReactNode
  className?: string
  id?: string
}): React.JSX.Element {
  return (
    <motion.section id={id} variants={fadeUp} className={cn('glass relative overflow-hidden rounded-2xl p-5', className)}>
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-[0.12] blur-2xl" style={{ background: gradient }} />
      <div className="relative mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-soft [&_svg]:size-[18px]" style={{ background: gradient }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {description && <p className="text-xs text-ink-soft">{description}</p>}
        </div>
        {action}
      </div>
      <div className="relative">{children}</div>
    </motion.section>
  )
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-ink-soft">{k}</span>
      <span className={cn('min-w-0 truncate text-right font-semibold text-ink', mono && 'selectable font-mono text-xs font-medium')} title={typeof v === 'string' ? v : undefined}>
        {v}
      </span>
    </div>
  )
}
