// OWNER: subagent C. Support page: the signed-in user's own tickets (no queue / routing internals are shown to users).
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, CircleDot, Clock3, Flag, Inbox, LifeBuoy, Mail, MessageCircleHeart, Plus } from 'lucide-react'
import type { Ticket, TicketStatus } from '@shared/types'
import { Page, PageHeader } from '@/components/common/Page'
import { GradientAvatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { sparkle } from '@/lib/confetti'
import { useAppEvent } from '@/lib/events'
import { ACCENTS, cn, formatDate, logError } from '@/lib/utils'
import { PRIORITY_META, STATUS_META, timeAgo } from '@/features/support/meta'
import { TicketForm } from '@/features/support/TicketForm'

const STATUS_ICON: Record<TicketStatus, React.ReactNode> = {
  open: <CircleDot className="size-3" />,
  in_progress: <Clock3 className="size-3" />,
  resolved: <CheckCircle2 className="size-3" />
}

type Filter = 'all' | TicketStatus

export function StatusChip({ status }: { status: TicketStatus }): React.JSX.Element {
  const m = STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: m.soft, color: m.text }}>
      {STATUS_ICON[status]} {m.label}
    </span>
  )
}

function PriorityTag({ priority }: { priority: Ticket['priority'] }): React.JSX.Element {
  const m = PRIORITY_META[priority]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: `${m.color}55`, color: m.text }}
    >
      <Flag className="size-3" style={{ fill: m.color, stroke: m.color }} /> {m.label}
    </span>
  )
}

function TicketCard({ t, fresh }: { t: Ticket; fresh: boolean }): React.JSX.Element {
  const accent = ACCENTS[t.agent?.avatarColor ?? 'violet'] ?? ACCENTS.violet
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      whileHover={{ y: -4 }}
      className={cn('glass relative flex flex-col overflow-hidden rounded-2xl p-4', fresh && 'ring-2 ring-pink/50')}
      data-testid="my-ticket"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      {fresh && <span className="absolute inset-x-0 top-0 h-1 bg-grad" />}
      <div className="relative flex items-center gap-2">
        <span className="rounded-md bg-violet/8 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet selectable">#{t.code}</span>
        {fresh && <span className="rounded-full bg-pink/10 px-1.5 py-0.5 text-[10px] font-bold text-pink">NEW</span>}
        <span className="ml-auto">
          <StatusChip status={t.status} />
        </span>
      </div>
      <h3 className="relative mt-3 line-clamp-1 text-[15px] font-bold text-ink">{t.subject}</h3>
      <p className="relative mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-soft selectable">{t.description}</p>
      <div className="relative mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
        <PriorityTag priority={t.priority} />
        <span className="ml-auto inline-flex items-center gap-1" title={formatDate(t.createdAt)}>
          <CalendarDays className="size-3" /> {formatDate(t.createdAt)} · {timeAgo(t.createdAt)}
        </span>
      </div>
      {t.agent && (
        <div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-white/70 p-2.5" style={{ boxShadow: `inset 0 0 0 1px ${accent}26` }}>
          <GradientAvatar name={t.agent.name} color={t.agent.avatarColor} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-xs font-bold text-ink">{t.agent.name}</span>
              <span className="truncate text-[11px] font-semibold" style={{ color: accent }}>
                {t.agent.specialty}
              </span>
            </div>
            <div className="flex items-center gap-1 truncate text-[11px] text-ink-soft selectable">
              <Mail className="size-3 shrink-0" /> {t.agent.email}
            </div>
          </div>
        </div>
      )}
    </motion.li>
  )
}

export function SupportPage(): React.JSX.Element {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [dialog, setDialog] = useState(false)
  const [fresh, setFresh] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const refresh = useCallback(async () => {
    try {
      setTickets(await cv.support.myTickets())
    } catch (e) {
      logError('support refresh failed', e)
      setTickets((p) => p ?? [])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onChanged = useCallback(
    (payload?: unknown) => {
      const t = payload as Ticket | undefined
      if (t?.id) {
        setFresh(t.id)
        setFilter('all')
      }
      void refresh()
    },
    [refresh]
  )
  useAppEvent('tickets:changed', onChanged)

  const count = (s: TicketStatus): number => tickets?.filter((t) => t.status === s).length ?? 0
  const filters: { key: Filter; label: string; n: number; color: string }[] = [
    { key: 'all', label: 'All', n: tickets?.length ?? 0, color: '#1e1b3a' },
    { key: 'open', label: STATUS_META.open.label, n: count('open'), color: STATUS_META.open.color },
    { key: 'in_progress', label: STATUS_META.in_progress.label, n: count('in_progress'), color: STATUS_META.in_progress.color },
    { key: 'resolved', label: STATUS_META.resolved.label, n: count('resolved'), color: STATUS_META.resolved.color }
  ]
  const shown = (tickets ?? []).filter((t) => filter === 'all' || t.status === filter)

  return (
    <Page>
      <PageHeader
        icon={<LifeBuoy />}
        title="Support"
        subtitle="Track your tickets. A specialist replies by email, and Vee is in the bubble for quick answers."
        actions={
          <Button variant="gradient" onClick={() => setDialog(true)} data-testid="new-ticket">
            <Plus /> New ticket
          </Button>
        }
      />

      <section data-testid="my-tickets">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">My tickets</h2>
          {tickets && tickets.length > 0 && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Filter tickets">
              {filters.map((f) => {
                const active = filter === f.key
                return (
                  <button
                    key={f.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                      active ? 'text-white' : 'bg-white/70 text-ink-soft hover:bg-white hover:text-ink'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="ticket-filter"
                        className="absolute inset-0 rounded-full"
                        style={{ background: f.color }}
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                      />
                    )}
                    {!active && f.key !== 'all' && <span className="relative size-1.5 rounded-full" style={{ background: f.color }} />}
                    <span className="relative">{f.label}</span>
                    <span className={cn('relative rounded-full px-1.5 text-[10px] font-bold', active ? 'bg-white/25' : 'bg-ink/5')}>{f.n}</span>
                  </button>
                )
              })}
            </div>
          )}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-faint">
            <MessageCircleHeart className="size-3.5 text-pink" /> Most questions get an instant answer from Vee
          </span>
        </div>

        {tickets == null ? (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[214px] rounded-2xl" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            emoji="🎧"
            title="No tickets yet"
            description="Ask Vee in the chat bubble first, she answers most questions instantly. Still stuck? Open a ticket and a specialist will pick it up."
            action={
              <Button variant="gradient" onClick={() => setDialog(true)}>
                <Plus /> Create your first ticket
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <div className="glass flex flex-col items-center justify-center rounded-2xl py-12 text-center">
            <Inbox className="mb-2 size-7 text-ink-faint" />
            <p className="text-sm font-semibold text-ink">No {STATUS_META[filter as TicketStatus]?.label.toLowerCase()} tickets</p>
            <button onClick={() => setFilter('all')} className="mt-1 cursor-pointer text-xs font-semibold text-violet hover:underline">
              Show all tickets
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-4">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((t) => (
                <TicketCard key={t.id} t={t} fresh={t.id === fresh} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
            <DialogDescription>Tell us what’s going on. A specialist will pick it up and reply by email.</DialogDescription>
          </DialogHeader>
          <TicketForm
            onCreated={() => {
              setDialog(false)
              setTimeout(() => sparkle(0.5, 0.3), 150)
            }}
            onCancel={() => setDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </Page>
  )
}
