// OWNER: subagent D. Plan catalogue for the (mock) pricing page.
import type { Billing, Plan } from '@shared/types'

export interface PlanDef {
  id: Plan
  name: string
  tagline: string
  monthly: number // USD per month when billed monthly
  features: string[]
  emoji: string
  accent: string // gradient for icons / bullets
}

export const YEARLY_DISCOUNT = 0.2

export const PLAN_DEFS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try your second brain',
    monthly: 0,
    emoji: '🌱',
    accent: 'var(--cv-grad-fresh)',
    features: ['5 sessions', '3-minute recording limit', 'Local Whisper transcription', 'Works offline with mock AI']
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For people who never want to forget',
    monthly: 9,
    emoji: '✨',
    accent: 'var(--cv-grad)',
    features: ['Unlimited sessions', 'AI summaries with Claude', 'Ask Claude about any moment', 'Priority support']
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'One shared memory for your crew',
    monthly: 29,
    emoji: '🚀',
    accent: 'var(--cv-grad-cool)',
    features: ['Everything in Pro', 'Shared vaults', 'Admin dashboard', 'Team-wide search']
  }
]

export const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, team: 2 }

/** Price shown per month for the chosen billing period. */
export function perMonth(p: PlanDef, billing: Billing): number {
  return billing === 'yearly' ? +(p.monthly * (1 - YEARLY_DISCOUNT)).toFixed(2) : p.monthly
}

/** Amount billed per period (monthly → one month, yearly → 12 discounted months). */
export function billedTotal(p: PlanDef, billing: Billing): number {
  return billing === 'yearly' ? +(perMonth(p, 'yearly') * 12).toFixed(2) : p.monthly
}

export const money = (n: number): string => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)
export const money2 = (n: number): string => `$${n.toFixed(2)}`
