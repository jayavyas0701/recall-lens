// OWNER: subagent D. One pricing card. Pro gets the ribbon + animated glowing gradient border.
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Crown } from 'lucide-react'
import type { Billing, Plan } from '@shared/types'
import { Button } from '@/components/ui/button'
import { fadeUp } from '@/components/common/Page'
import { cn } from '@/lib/utils'
import { billedTotal, money, money2, perMonth, PLAN_RANK, type PlanDef } from './plans'

const BORDER_GRAD = 'linear-gradient(115deg,#7c3aed,#ec4899,#f59e0b,#06b6d4,#7c3aed,#ec4899)'

export function PricingCard({
  plan,
  billing,
  currentPlan,
  currentBilling,
  onSelect
}: {
  plan: PlanDef
  billing: Billing
  currentPlan: Plan
  currentBilling: Billing
  onSelect: (p: PlanDef) => void
}): React.JSX.Element {
  const featured = plan.id === 'pro'
  const isCurrentPlan = plan.id === currentPlan
  const isCurrent = isCurrentPlan && (plan.id === 'free' || billing === currentBilling)
  const price = perMonth(plan, billing)
  const total = billedTotal(plan, billing)
  const upgrade = PLAN_RANK[plan.id] > PLAN_RANK[currentPlan]

  const cta = isCurrent
    ? 'Current plan'
    : isCurrentPlan
      ? `Switch to ${billing}`
      : upgrade
        ? `Upgrade to ${plan.name}`
        : `Switch to ${plan.name}`

  const inner = (
    <div className={cn('relative flex h-full flex-col rounded-[22px] p-6', featured ? 'bg-white/95' : 'glass')}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl text-xl shadow-soft" style={{ background: plan.accent }}>
          <span className="drop-shadow">{plan.emoji}</span>
        </span>
        <div>
          <h3 className="text-xl font-bold text-ink">{plan.name}</h3>
          <p className="text-xs text-ink-soft">{plan.tagline}</p>
        </div>
      </div>

      <div className="mt-5 flex h-[52px] items-end gap-1.5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${plan.id}-${price}`}
            initial={{ y: 30, opacity: 0, filter: 'blur(4px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: -30, opacity: 0, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn('font-display text-5xl font-bold leading-none tabular-nums', featured ? 'text-grad' : 'text-ink')}
          >
            {money(price)}
          </motion.span>
        </AnimatePresence>
        <span className="mb-1 text-sm font-semibold text-ink-faint">/mo</span>
      </div>
      <div className="mt-1.5 h-5 text-xs font-medium text-ink-soft">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={`${billing}-${plan.id}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {plan.monthly === 0 ? (
              'Free forever · no card needed'
            ) : billing === 'yearly' ? (
              <>
                Billed yearly at <b className="text-ink">{money2(total)}</b>{' '}
                <s className="text-ink-faint">{money2(plan.monthly * 12)}</s>
              </>
            ) : (
              'Billed monthly · cancel anytime'
            )}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="my-5 h-px bg-line" />

      <ul className="flex flex-1 flex-col gap-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: plan.accent }}>
              <Check className="size-3" strokeWidth={3.5} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <Button
        data-plan-cta={plan.id}
        disabled={isCurrent}
        onClick={() => onSelect(plan)}
        variant={isCurrent ? 'soft' : featured ? 'gradient' : 'outline'}
        size="lg"
        className={cn('mt-6 w-full', isCurrent && 'disabled:opacity-100')}
      >
        {isCurrent ? <Check /> : upgrade ? <Crown /> : null}
        {cta}
      </Button>
    </div>
  )

  if (!featured) {
    return (
      <motion.div variants={fadeUp} whileHover={{ y: -8 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="relative h-full">
        {isCurrent && <CurrentTag />}
        {inner}
      </motion.div>
    )
  }

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -10, scale: 1.015 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="relative z-10 h-full">
      {/* soft glow behind the card */}
      <motion.div
        aria-hidden
        className="absolute -inset-1 rounded-[28px] opacity-60 blur-xl"
        style={{ backgroundImage: BORDER_GRAD, backgroundSize: '300% 300%' }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />
      {/* animated gradient border */}
      <motion.div
        className="relative h-full rounded-3xl p-[2.5px]"
        style={{ backgroundImage: BORDER_GRAD, backgroundSize: '300% 300%' }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      >
        {inner}
      </motion.div>
      {/* ribbon */}
      <div className="pointer-events-none absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 18 }}
          className="shimmer relative overflow-hidden rounded-full bg-grad px-4 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white shadow-glow-pink"
        >
          ★ Most Popular
        </motion.div>
      </div>
      {isCurrent && <CurrentTag right />}
    </motion.div>
  )
}

function CurrentTag({ right }: { right?: boolean }): React.JSX.Element {
  return (
    <span
      className={cn(
        'absolute top-4 z-20 rounded-full bg-lime/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#4d7c0f]',
        right ? 'right-4' : 'right-4'
      )}
    >
      Your plan
    </span>
  )
}
