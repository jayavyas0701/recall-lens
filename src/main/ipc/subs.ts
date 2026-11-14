// OWNER: subagent D (Subscriptions). Mock billing only — no payment provider, no card data ever touched.
import { CH, PLAN_LIMITS, type Billing, type Plan, type SubscriptionInfo, type User } from '../../shared/types'
import { get, run, nowIso } from '../db'
import { toUser } from '../mappers'
import { requireUser } from './auth'
import { log } from '../log'
import { handle, handleResult, ok, fail } from './util'

const PLANS: Plan[] = ['free', 'pro', 'team']
const BILLINGS: Billing[] = ['monthly', 'yearly']

interface SubRow {
  plan: string
  billing: string
  started_at: string
  renews_at: string | null
}

/** Make sure the user has a subscriptions row (older accounts / seeded users may not). */
function ensureSubRow(userId: number, plan: Plan): SubRow {
  let r = get<SubRow>('SELECT plan, billing, started_at, renews_at FROM subscriptions WHERE user_id = ?', [userId])
  if (!r) {
    run('INSERT INTO subscriptions(user_id, plan, billing, status, started_at) VALUES(?,?,?,?,?)', [userId, plan, 'monthly', 'active', nowIso()])
    r = get<SubRow>('SELECT plan, billing, started_at, renews_at FROM subscriptions WHERE user_id = ?', [userId])!
  }
  return r
}

function addPeriod(from: Date, billing: Billing): Date {
  const d = new Date(from)
  if (billing === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

export function registerSubs(): void {
  handle(CH.subsGet, (): SubscriptionInfo => {
    const u = requireUser()
    const sub = ensureSubRow(u.id, u.plan)
    const used = get<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND is_demo = 0 AND status != 'recording'", [u.id])
    const billing = (BILLINGS.includes(sub.billing as Billing) ? sub.billing : 'monthly') as Billing
    return {
      plan: u.plan,
      billing,
      sessionsUsed: Number(used?.n ?? 0),
      sessionLimit: PLAN_LIMITS[u.plan] ?? null,
      renewsAt: u.plan === 'free' ? null : sub.renews_at
    }
  })

  handleResult(CH.subsUpgrade, (i: { plan: Plan; billing: Billing }) => {
    const u = requireUser()
    const plan = i?.plan
    const billing = i?.billing ?? 'monthly'
    if (!PLANS.includes(plan)) return fail<User>('Unknown plan.')
    if (!BILLINGS.includes(billing)) return fail<User>('Unknown billing period.')
    ensureSubRow(u.id, u.plan)
    const now = new Date()
    const renews = plan === 'free' ? null : addPeriod(now, billing).toISOString()
    run('UPDATE users SET plan = ? WHERE id = ?', [plan, u.id])
    run("UPDATE subscriptions SET plan = ?, billing = ?, status = 'active', started_at = ?, renews_at = ? WHERE user_id = ?", [
      plan,
      billing,
      nowIso(),
      renews,
      u.id
    ])
    log.info(`Mock plan change for user ${u.id}: ${u.plan} → ${plan} (${billing})`)
    const r = get('SELECT * FROM users WHERE id = ?', [u.id])
    return ok(toUser(r))
  })
}
