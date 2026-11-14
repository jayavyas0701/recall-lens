// OWNER: orchestrator. Read-side session queries shared by all tabs.
import bcrypt from 'bcryptjs'
import { CH, type DashboardStats, type SearchHit, type SessionAccess, type SessionDetail, type SessionRow } from '../../shared/types'
import { isLockedNow, markLocked, markUnlocked, unlockedIdsJson } from '../access'
import { all, get, run } from '../db'
import { parseSummary, toEvent, toSegment, toSession } from '../mappers'
import { requireUser } from './auth'
import { handle, handleResult, ok, fail } from './util'

const SESSION_SELECT = `
  SELECT s.*, substr((SELECT group_concat(text, ' ') FROM transcript_segments ts WHERE ts.session_id = s.id), 1, 180) AS snippet
  FROM sessions s`

export function getSessionDetail(id: number, userId: number): SessionDetail | null {
  const r = get(`${SESSION_SELECT} WHERE s.id = ? AND s.user_id = ?`, [id, userId])
  if (!r) return null
  // Locked sessions stay redacted until unlocked with the account password.
  if (isLockedNow(r)) return { ...toSession(r), segments: [], events: [], summary: null }
  return {
    ...toSession(r),
    segments: all('SELECT * FROM transcript_segments WHERE session_id = ? ORDER BY t_start', [id]).map(toSegment),
    events: all('SELECT * FROM screen_events WHERE session_id = ? ORDER BY t', [id]).map(toEvent),
    summary: parseSummary((r as { summary_json?: unknown }).summary_json)
  }
}

export function latestSessionId(userId: number): number | null {
  const r = get<{ id: number }>(
    `SELECT id FROM sessions WHERE user_id = ? AND status != 'recording' ORDER BY started_at DESC, id DESC LIMIT 1`,
    [userId]
  )
  return r ? Number(r.id) : null
}

function streak(userId: number): number {
  const days = new Set(
    all<{ d: string }>(`SELECT DISTINCT date(started_at, 'localtime') AS d FROM sessions WHERE user_id = ?`, [userId]).map((r) => r.d)
  )
  const fmt = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const cur = new Date()
  if (!days.has(fmt(cur))) cur.setDate(cur.getDate() - 1)
  let n = 0
  while (days.has(fmt(cur))) {
    n++
    cur.setDate(cur.getDate() - 1)
  }
  return n
}

function ownedRow(id: number, userId: number): SessionRow | null {
  const r = get(`${SESSION_SELECT} WHERE s.id = ? AND s.user_id = ?`, [id, userId])
  return r ? toSession(r) : null
}

export function registerSessions(): void {
  handleResult(CH.sessionsSetAccess, (id: number, a: Partial<SessionAccess>) => {
    const u = requireUser()
    const cur = ownedRow(Number(id), u.id)
    if (!cur) return fail<SessionRow>('Session not found')
    // Changing anything on a locked session requires unlocking it first.
    if (cur.isLockedNow) return fail<SessionRow>('Unlock this session first.')
    const next = { ...cur.access, ...Object.fromEntries(Object.entries(a ?? {}).filter(([, v]) => typeof v === 'boolean')) } as SessionAccess
    run('UPDATE sessions SET ai_access = ?, mcp_access = ?, search_access = ?, locked = ? WHERE id = ? AND user_id = ?', [
      next.ai ? 1 : 0, next.mcp ? 1 : 0, next.search ? 1 : 0, next.locked ? 1 : 0, cur.id, u.id
    ])
    // A freshly locked session stays viewable until you press "Lock now" or restart the app.
    if (next.locked && !cur.access.locked) markUnlocked(cur.id)
    return ok(ownedRow(cur.id, u.id)!)
  })
  handleResult(CH.sessionsUnlock, async (id: number, password: string) => {
    const u = requireUser()
    const r = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [u.id])
    if (!r || !(await bcrypt.compare(password ?? '', r.password_hash))) return fail<SessionRow>('Wrong password.')
    if (!ownedRow(Number(id), u.id)) return fail<SessionRow>('Session not found')
    markUnlocked(Number(id))
    return ok(ownedRow(Number(id), u.id)!)
  })
  handleResult(CH.sessionsRelock, (id: number) => {
    const u = requireUser()
    const cur = ownedRow(Number(id), u.id)
    if (!cur) return fail<SessionRow>('Session not found')
    if (!cur.access.locked) return fail<SessionRow>('This session isn’t password-locked.')
    markLocked(cur.id)
    return ok(ownedRow(cur.id, u.id)!)
  })

  handle(CH.sessionsList, () => {
    const u = requireUser()
    return all(`${SESSION_SELECT} WHERE s.user_id = ? AND s.status != 'recording' ORDER BY s.started_at DESC, s.id DESC`, [u.id]).map(toSession)
  })
  handle(CH.sessionsGet, (id: number) => getSessionDetail(Number(id), requireUser().id))
  handle(CH.sessionsLatest, () => {
    const u = requireUser()
    const id = latestSessionId(u.id)
    return id ? getSessionDetail(id, u.id) : null
  })
  handleResult(CH.sessionsRename, (id: number, title: string) => {
    const u = requireUser()
    const t = (title ?? '').trim()
    if (!t) return fail('Title can’t be empty')
    run('UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?', [t.slice(0, 120), id, u.id])
    return ok()
  })
  handle(CH.sessionsStats, (): DashboardStats => {
    const u = requireUser()
    const s = get<Record<string, number>>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(duration_s),0) AS dur,
        SUM(CASE WHEN audio_path IS NOT NULL THEN 1 ELSE 0 END) AS ac,
        SUM(CASE WHEN screen_path IS NOT NULL THEN 1 ELSE 0 END) AS sc,
        COALESCE(SUM(CASE WHEN audio_path IS NOT NULL THEN duration_s ELSE 0 END),0) AS ad,
        COALESCE(SUM(CASE WHEN screen_path IS NOT NULL THEN duration_s ELSE 0 END),0) AS sd
       FROM sessions WHERE user_id = ? AND status != 'recording'`,
      [u.id]
    )!
    const q = get<{ n: number }>('SELECT COUNT(*) AS n FROM qa_history WHERE user_id = ?', [u.id])!
    return {
      minutesCaptured: Math.round((Number(s.dur) / 60) * 10) / 10,
      sessions: Number(s.n),
      questionsAsked: Number(q.n),
      streakDays: streak(u.id),
      audioCount: Number(s.ac ?? 0),
      screenCount: Number(s.sc ?? 0),
      audioDurationS: Number(s.ad ?? 0),
      screenDurationS: Number(s.sd ?? 0)
    }
  })
  handle(CH.sessionsSearch, (query: string): SearchHit[] => {
    const u = requireUser()
    const q = (query ?? '').trim()
    if (q.length < 2) return []
    const like = `%${q.replace(/[%_]/g, '')}%`
    const speech = all<Record<string, unknown>>(
      `SELECT s.id AS sid, s.title, s.started_at, ts.t_start AS t, ts.text FROM transcript_segments ts
       JOIN sessions s ON s.id = ts.session_id WHERE s.user_id = ? AND s.search_access = 1 AND (s.locked = 0 OR s.id IN (SELECT value FROM json_each(?))) AND ts.text LIKE ? ORDER BY s.started_at DESC, ts.t_start LIMIT 20`,
      [u.id, unlockedIdsJson(), like]
    )
    // Screen hits match the one-line description and the on-device screen text (app, title, URL, visible text).
    const screen = all<Record<string, unknown>>(
      `SELECT s.id AS sid, s.title, s.started_at, e.t AS t, e.description AS text, e.screen_text AS st FROM screen_events e
       JOIN sessions s ON s.id = e.session_id WHERE s.user_id = ? AND s.search_access = 1 AND (s.locked = 0 OR s.id IN (SELECT value FROM json_each(?))) AND (e.description LIKE ? OR e.screen_text LIKE ?) ORDER BY s.started_at DESC, e.t LIMIT 10`,
      [u.id, unlockedIdsJson(), like, like]
    ).map((r) => {
      const desc = String(r.text)
      const st = r.st == null ? '' : String(r.st)
      if (!st || desc.toLowerCase().includes(q.toLowerCase())) return r
      // Matched only in the screen text: show a short excerpt around the hit.
      const flat = st.replace(/^(App|Title|URL|Visible text):\s*/gm, '').replace(/\s+/g, ' ')
      const i = flat.toLowerCase().indexOf(q.toLowerCase())
      if (i < 0) return r
      let from = Math.max(0, i - 40)
      if (from > 0) from = flat.indexOf(' ', from) + 1 || from
      let end = Math.min(flat.length, i + q.length + 60)
      const sp = flat.lastIndexOf(' ', end)
      if (end < flat.length && sp > i + q.length) end = sp
      const ex = `${from > 0 ? '…' : ''}${flat.slice(from, end).trim()}${end < flat.length ? '…' : ''}`
      return { ...r, text: `${desc} · “${ex}”` }
    })
    const map = (kind: 'speech' | 'screen') => (r: Record<string, unknown>): SearchHit => ({
      sessionId: Number(r.sid),
      sessionTitle: String(r.title),
      startedAt: String(r.started_at),
      t: Number(r.t),
      kind,
      text: String(r.text)
    })
    return [...speech.map(map('speech')), ...screen.map(map('screen'))]
  })
}
