// OWNER: subagent C (Support). Celebratory "ticket assigned" card shown in the chat after submit.
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { Ticket } from '@shared/types'
import { GradientAvatar } from '@/components/common/Avatar'
import { ACCENTS } from '@/lib/utils'
import { PRIORITY_META, firstName } from './meta'

export function assignedLine(t: Ticket): string {
  return t.agent ? `Ticket #${t.code} assigned to ${firstName(t.agent.name)} (${t.agent.email}) 🎧` : `Ticket #${t.code} created 🎧`
}

export function TicketAssignedCard({ ticket }: { ticket: Ticket }): React.JSX.Element {
  const a = ticket.agent
  const accent = ACCENTS[a?.avatarColor ?? 'violet'] ?? ACCENTS.violet
  const p = PRIORITY_META[ticket.priority]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      className="relative overflow-hidden rounded-2xl bg-grad p-[1.5px] shadow-glow-violet"
      data-testid="ticket-assigned"
    >
      <div className="relative overflow-hidden rounded-[14.5px] bg-white px-3.5 py-3">
        <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-25 blur-2xl" style={{ background: accent }} />
        <div className="relative mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet">
          <Sparkles className="size-3" /> Ticket created
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal"
            style={{ background: p.soft, color: p.text }}
          >
            {p.emoji} {p.label}
          </span>
        </div>
        <p className="relative text-[13px] font-semibold leading-snug text-ink selectable">{assignedLine(ticket)}</p>
        {a && (
          <div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-canvas/80 p-2" style={{ boxShadow: `inset 0 0 0 1px ${accent}22` }}>
            <motion.div
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{
                delay: 0.15,
                type: 'spring',
                stiffness: 300,
                damping: 14
              }}
            >
              <GradientAvatar name={a.name} color={a.avatarColor} size={34} />
            </motion.div>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-ink">{a.name}</div>
              <div className="truncate text-[11px] text-ink-soft">{a.specialty}</div>
            </div>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[#4d7c0f]">
              <span className="size-1.5 rounded-full bg-lime" /> on it
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
