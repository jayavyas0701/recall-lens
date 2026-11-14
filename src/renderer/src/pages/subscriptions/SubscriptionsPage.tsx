// OWNER: subagent D. Plans & billing (mock checkout only).
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Crown, HardDrive, Infinity as InfinityIcon, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react'
import type { Billing, DashboardStats, SubscriptionInfo } from '@shared/types'
import { Page, PageHeader, stagger, fadeUp } from '@/components/common/Page'
import { CountUp } from '@/components/common/CountUp'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { useUser } from '@/lib/auth'
import { emit, useAppEvent } from '@/lib/events'
import { celebrate } from '@/lib/confetti'
import { logError } from '@/lib/utils'
import { BillingToggle } from './BillingToggle'
import { PricingCard } from './PricingCard'
import { CheckoutDialog } from './CheckoutDialog'
import { PLAN_DEFS, PLAN_RANK, type PlanDef } from './plans'

export function SubscriptionsPage(): React.JSX.Element {
  const user = useUser()
  const [info, setInfo] = useState<SubscriptionInfo | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [billing, setBilling] = useState<Billing>('monthly')
  const [selected, setSelected] = useState<PlanDef | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async (syncBilling = false) => {
    try {
      const [s, st] = await Promise.all([cv.subs.get(), cv.sessions.stats().catch(() => null)])
      setInfo(s)
      setStats(st)
      if (syncBilling && s.plan !== 'free') setBilling(s.billing)
    } catch (e) {
      logError('subs.get failed', e)
      toast.error('Couldn’t load your plan — showing defaults.')
    }
  }, [])

  useEffect(() => {
    void load(true)
  }, [load])
  const reload = useCallback(() => void load(), [load])
  useAppEvent('sessions:changed', reload)
  useAppEvent('user:changed', reload)

  const currentPlan = info?.plan ?? user.plan
  const currentBilling = info?.billing ?? 'monthly'

  const choose = (p: PlanDef): void => {
    setSelected(p)
    setOpen(true)
  }

  const confirm = async (): Promise<boolean> => {
    if (!selected) return false
    const wasUpgrade = PLAN_RANK[selected.id] > PLAN_RANK[currentPlan]
    try {
      const r = await cv.subs.upgrade({ plan: selected.id, billing })
      if (!r.ok) {
        toast.error(r.error ?? 'Plan change failed.')
        return false
      }
      if (wasUpgrade) {
        celebrate()
        toast.success(`Welcome to ${selected.name}! ${selected.emoji}`, { description: 'Demo upgrade complete — no payment was taken.' })
      } else if (selected.id === currentPlan) {
        toast.success(`Switched to ${billing} billing`, { description: 'Demo mode — nothing was charged.' })
      } else {
        toast.success(`You’re now on ${selected.name}`, { description: 'Your recordings stay right where they are.' })
      }
      emit('user:changed')
      await load()
      return true
    } catch (e) {
      logError('subs.upgrade failed', e)
      toast.error('Something went wrong — please try again.')
      return false
    }
  }

  return (
    <Page>
      <PageHeader
        icon={<Crown />}
        title={
          <>
            Plans that grow with your <span className="text-grad">memory</span>
          </>
        }
        subtitle="Start free. Upgrade when your vault fills up. (Demo build — checkout is simulated.)"
        actions={<BillingToggle value={billing} onChange={setBilling} />}
      />

      <UsageMeter info={info} stats={stats} />

      <motion.div variants={stagger} initial="hidden" animate="show" className="mt-8 grid grid-cols-3 items-stretch gap-6">
        {PLAN_DEFS.map((p) => (
          <PricingCard key={p.id} plan={p} billing={billing} currentPlan={currentPlan} currentBilling={currentBilling} onSelect={choose} />
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-7 flex items-center justify-center gap-8 text-xs font-semibold text-ink-soft">
        <Trust icon={<RefreshCcw />} text="Cancel or switch anytime" />
        <Trust icon={<HardDrive />} text="Recordings stay on your device" />
        <Trust icon={<ShieldCheck />} text="Demo mode — no real payments" />
      </motion.div>

      <CheckoutDialog plan={selected} billing={billing} currentPlan={currentPlan} open={open} onOpenChange={setOpen} onConfirm={confirm} />
    </Page>
  )
}

function Trust({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:text-violet">
      {icon}
      {text}
    </span>
  )
}

function UsageMeter({ info, stats }: { info: SubscriptionInfo | null; stats: DashboardStats | null }): React.JSX.Element {
  if (!info) return <Skeleton className="h-[104px] w-full rounded-2xl" />
  const unlimited = info.sessionLimit == null
  const pct = unlimited ? 100 : (info.sessionsUsed / Math.max(1, info.sessionLimit!)) * 100
  const left = unlimited ? Infinity : Math.max(0, info.sessionLimit! - info.sessionsUsed)
  const minutes = stats?.minutesCaptured ?? 0
  const near = !unlimited && left <= 1

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="glass relative flex items-center gap-8 overflow-hidden rounded-2xl px-6 py-5" data-testid="usage-meter">
      <div className="absolute -left-10 -top-16 size-48 rounded-full bg-grad opacity-10 blur-3xl" />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">Sessions this plan</span>
          <span className="font-display text-sm font-semibold text-ink">
            {unlimited ? (
              <span className="flex items-center gap-1 text-grad">
                <InfinityIcon className="size-4 text-violet" /> unlimited
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold">
                  <CountUp value={info.sessionsUsed} />
                </span>
                <span className="text-ink-faint"> / {info.sessionLimit} used</span>
              </>
            )}
          </span>
        </div>
        <Progress
          value={pct}
          className="mt-2.5 h-3"
          barClassName={unlimited ? 'grad-animate opacity-80' : near ? 'bg-grad-warm' : undefined}
        />
        <div className="mt-2 text-xs text-ink-soft">
          {unlimited ? (
            <>
              {info.sessionsUsed} sessions recorded so far — record as many as you like.
              {info.renewsAt && <> Renews {new Date(info.renewsAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} (demo).</>}
            </>
          ) : left === 0 ? (
            <>You’ve used every free session. Upgrade to keep recording — demo sessions never count.</>
          ) : (
            <>
              {left} free {left === 1 ? 'session' : 'sessions'} left. Demo sessions don’t count toward your limit.
            </>
          )}
        </div>
      </div>
      <div className="relative h-14 w-px bg-line" />
      <div className="relative flex items-center gap-3">
        <motion.span
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
          className="flex size-12 items-center justify-center rounded-2xl bg-grad-warm text-2xl shadow-glow-pink"
        >
          🧠
        </motion.span>
        <div>
          <div className="font-display text-2xl font-bold text-ink">
            <CountUp value={minutes} decimals={minutes > 0 && minutes < 10 ? 1 : 0} suffix=" min" />
          </div>
          <div className="flex items-center gap-1 text-xs text-ink-soft">
            <Sparkles className="size-3 text-pink" />
            {minutes > 0 ? `remembered so you don’t have to` : 'your vault is ready for its first memory'}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
