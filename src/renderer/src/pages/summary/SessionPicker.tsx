// OWNER: subagent B. Custom dropdown to choose a session ("Latest session" by default).
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Clock, History, Sparkles } from 'lucide-react'
import type { SessionRow } from '@shared/types'
import { cn, formatDate, formatDuration } from '@/lib/utils'

export function SessionPicker({
  sessions,
  value,
  onChange
}: {
  sessions: SessionRow[]
  /** null = "Latest session" */
  value: number | null
  onChange: (id: number | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = value == null ? null : sessions.find((s) => s.id === value)
  const label = current ? current.title : 'Latest session'

  const pick = (id: number | null): void => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 max-w-[260px] items-center gap-2 rounded-xl border border-line bg-white/80 pl-3 pr-2.5 text-sm font-semibold text-ink shadow-soft transition-all hover:border-violet/40 cursor-pointer',
          open && 'border-violet/50 ring-4 ring-violet/10'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value == null ? <Sparkles className="size-4 shrink-0 text-violet" /> : <History className="size-4 shrink-0 text-violet" />}
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="listbox"
            className="absolute right-0 top-12 z-40 max-h-[380px] w-[340px] overflow-y-auto rounded-2xl border border-white bg-white/95 p-1.5 shadow-[0_20px_60px_-15px_rgb(124_58_237/0.35)] backdrop-blur-xl"
          >
            <Option active={value == null} onClick={() => pick(null)} icon={<Sparkles className="size-4" />} gradient="bg-grad" title="Latest session" sub="Always follow your newest recording" />
            <div className="mx-2 my-1 h-px bg-line" />
            {sessions.map((s) => (
              <Option
                key={s.id}
                active={value === s.id}
                onClick={() => pick(s.id)}
                icon={<Clock className="size-4" />}
                gradient={s.isDemo ? 'bg-grad-warm' : 'bg-grad-cool'}
                title={s.title}
                sub={`${formatDate(s.startedAt)} · ${formatDuration(s.durationS)}${s.isDemo ? ' · demo' : ''}`}
                dot={s.hasSummary}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Option({
  active,
  onClick,
  icon,
  gradient,
  title,
  sub,
  dot
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  gradient: string
  title: string
  sub: string
  dot?: boolean
}): React.JSX.Element {
  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer', active ? 'bg-violet/8' : 'hover:bg-violet/5')}
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white', gradient)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          {dot && <span className="size-1.5 shrink-0 rounded-full bg-lime" title="Summary ready" />}
        </span>
        <span className="block truncate text-xs text-ink-faint">{sub}</span>
      </span>
      {active && <Check className="size-4 shrink-0 text-violet" />}
    </button>
  )
}
