// OWNER: orchestrator. Local email/password auth with bcryptjs. Session persists in settings table.
import bcrypt from 'bcryptjs'
import { CH, type User } from '../../shared/types'
import { get, run, nowIso } from '../db'
import { toUser } from '../mappers'
import { handle, handleResult, ok, fail } from './util'

let currentUserId: number | null = null
const SESSION_KEY = 'auth:currentUserId'

export function restoreSession(): void {
  const r = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [SESSION_KEY])
  const id = r ? Number(r.value) : NaN
  if (id && get('SELECT id FROM users WHERE id = ?', [id])) currentUserId = id
}

function setSession(id: number | null): void {
  currentUserId = id
  if (id == null) run('DELETE FROM settings WHERE key = ?', [SESSION_KEY])
  else run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [SESSION_KEY, String(id)])
}

export function currentUser(): User | null {
  if (currentUserId == null) return null
  const r = get('SELECT * FROM users WHERE id = ?', [currentUserId])
  return r ? toUser(r) : null
}

/** Throws if nobody is signed in. Use in every user-scoped handler. */
export function requireUser(): User {
  const u = currentUser()
  if (!u) throw new Error('Not signed in')
  return u
}

const COLORS = ['violet', 'pink', 'orange', 'cyan', 'lime']
const emailOk = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export function registerAuth(): void {
  handleResult(CH.authSignUp, async (i: { name: string; email: string; password: string }) => {
    const name = (i.name ?? '').trim()
    const email = (i.email ?? '').trim().toLowerCase()
    if (!name) return fail('Please tell us your name.')
    if (!emailOk(email)) return fail('That email doesn’t look right.')
    if ((i.password ?? '').length < 8) return fail('Use at least 8 characters for your password.')
    if (get('SELECT id FROM users WHERE email = ?', [email])) return fail('An account with that email already exists — try signing in.')
    const hash = await bcrypt.hash(i.password, 10)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const { lastInsertRowid } = run(
      'INSERT INTO users(name, email, password_hash, avatar_color, plan, onboarded, created_at) VALUES(?,?,?,?,?,?,?)',
      [name, email, hash, color, 'free', 0, nowIso()]
    )
    run('INSERT INTO subscriptions(user_id, plan, billing, status, started_at) VALUES(?,?,?,?,?)', [lastInsertRowid, 'free', 'monthly', 'active', nowIso()])
    setSession(lastInsertRowid)
    return ok(currentUser()!)
  })

  handleResult(CH.authSignIn, async (i: { email: string; password: string }) => {
    const email = (i.email ?? '').trim().toLowerCase()
    const r = get<{ id: number; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = ?', [email])
    if (!r || !(await bcrypt.compare(i.password ?? '', r.password_hash))) return fail('Email or password is incorrect.')
    setSession(Number(r.id))
    return ok(currentUser()!)
  })

  handle(CH.authSignOut, () => setSession(null))
  handle(CH.authCurrent, () => currentUser())

  handleResult(CH.authUpdateProfile, (i: { name?: string; avatarColor?: string }) => {
    const u = requireUser()
    const name = i.name?.trim() || u.name
    const color = i.avatarColor && COLORS.includes(i.avatarColor) ? i.avatarColor : u.avatarColor
    run('UPDATE users SET name = ?, avatar_color = ? WHERE id = ?', [name, color, u.id])
    return ok(currentUser()!)
  })

  handleResult(CH.authCompleteOnboarding, () => {
    const u = requireUser()
    run('UPDATE users SET onboarded = 1 WHERE id = ?', [u.id])
    return ok(currentUser()!)
  })
}
