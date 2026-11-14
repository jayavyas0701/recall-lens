// OWNER: subagent D. Mock checkout — clearly labeled demo, no inputs, no card data collected.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import type { Billing, Plan } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { billedTotal, money2, perMonth, PLAN_RANK, type PlanDef } from './plans'

export function CheckoutDialog({
  plan,
  billing,
  currentPlan,
  open,
  onOpenChange,
  onConfirm
}: {
  plan: PlanDef | null
  billing: Billing
  currentPlan: Plan
  open: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: () => Promise<boolean>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  if (!plan) return <Dialog open={false} />
  const isUpgrade = PLAN_RANK[plan.id] > PLAN_RANK[currentPlan]
  const free = plan.monthly === 0
  const total = billedTotal(plan, billing)
  const saved = billing === 'yearly' ? plan.monthly * 12 - total : 0

  const confirm = async (): Promise<void> => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 1100)) // pretend to "process"
    const ok = await onConfirm()
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-[460px] overflow-hidden p-0" data-testid="checkout-dialog">
        {/* demo banner */}
        <div className="flex items-center gap-2.5 bg-[repeating-linear-gradient(135deg,#fef3c7_0_14px,#fde68a_14px_28px)] py-3 pl-6 pr-14 text-sm font-bold text-[#92400e]">
          <FlaskConical className="size-4 shrink-0" />
          Demo mode, no real payment
          <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">Mock checkout</span>
        </div>

        <div className="p-6 pt-5">
          <DialogHeader className="mb-5">
            <DialogTitle>{free ? 'Switch to Free' : isUpgrade ? `Upgrade to ${plan.name} ${plan.emoji}` : `Switch to ${plan.name}`}</DialogTitle>
            <DialogDescription>
              {free
                ? 'You’ll keep every recording — they live on your device. Limits go back to 5 sessions.'
                : 'Nothing is charged. This simulates checkout so you can see the full upgrade flow.'}
            </DialogDescription>
          </DialogHeader>

          {!free && (
            <motion.div
              initial={{ rotateX: 25, y: 10, opacity: 0 }}
              animate={{ rotateX: 0, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              style={{ transformPerspective: 800 }}
              className="relative mb-5 h-[120px] overflow-hidden rounded-2xl bg-grad p-4 text-white shadow-glow-violet"
            >
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-xl" />
              <div className="absolute -bottom-12 left-10 size-32 rounded-full bg-white/10 blur-lg" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.16em] opacity-90">Sample card</span>
                <span className="rounded-md bg-white/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">Demo</span>
              </div>
              <div className="relative mt-5 font-display text-2xl font-semibold tracking-[0.12em]">•••• 4242 · Demo</div>
              <div className="relative mt-1 text-[11px] font-medium opacity-80">Not a real card — nothing is stored or charged</div>
            </motion.div>
          )}

          <div className="rounded-2xl border border-line bg-canvas/70 p-4 text-sm">
            <Row label={`${plan.name} plan · ${free ? 'forever' : billing}`} value={free ? '$0.00' : billing === 'yearly' ? `${money2(perMonth(plan, billing))}/mo × 12` : `${money2(plan.monthly)}/mo`} />
            {saved > 0 && <Row label="Yearly discount (20%)" value={`−${money2(saved)}`} accent />}
            <Row label="Tax" value="$0.00" />
            <div className="my-3 h-px bg-line" />
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink">{free ? 'Due today' : `Total ${billing === 'yearly' ? 'per year' : 'per month'}`}</span>
              <span className="font-display text-xl font-bold text-ink">{money2(total)}</span>
            </div>
            <div className="mt-1 text-right text-xs font-semibold text-[#b45309]">Charged today: $0.00 (demo)</div>
          </div>

          <Button data-testid="checkout-confirm" onClick={() => void confirm()} disabled={busy} variant={free ? 'outline' : 'gradient'} size="lg" className="mt-5 w-full">
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Processing demo checkout…
              </>
            ) : free ? (
              'Confirm switch to Free'
            ) : (
              <>
                <Sparkles /> Confirm {plan.name} (demo)
              </>
            )}
          </Button>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-medium text-ink-faint">
            <span className="flex items-center gap-1">
              <Lock className="size-3" /> No payment details collected
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3" /> Cancel anytime
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-ink-soft">{label}</span>
      <span className={accent ? 'font-semibold text-[#4d7c0f]' : 'font-semibold text-ink'}>{value}</span>
    </div>
  )
}
