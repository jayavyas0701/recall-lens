// OWNER: subagent D (Feedback). Per-summary ratings stored in the feedback table.
import { CH, type FeedbackInput, type FeedbackRow } from '../../shared/types'
import { all, get, run, nowIso } from '../db'
import { requireUser } from './auth'
import { handle, handleResult, ok, fail } from './util'

const EMOJIS = ['😍', '👍', '😐', '👎']

/* eslint-disable @typescript-eslint/no-explicit-any */
function toFeedback(r: any): FeedbackRow {
  return {
    id: Number(r.id),
    sessionId: r.session_id == null ? null : Number(r.session_id),
    rating: Number(r.rating),
    emoji: r.emoji ?? null,
    comment: String(r.comment ?? ''),
    createdAt: String(r.created_at),
    sessionTitle: r.session_title ?? null
  }
}

const SELECT = `SELECT f.*, s.title AS session_title FROM feedback f LEFT JOIN sessions s ON s.id = f.session_id`

export function registerFeedback(): void {
  handleResult(CH.feedbackSubmit, (i: FeedbackInput) => {
    const u = requireUser()
    const rating = Math.round(Number(i?.rating))
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return fail<FeedbackRow>('Pick between 1 and 5 stars.')
    const emoji = i?.emoji && EMOJIS.includes(i.emoji) ? i.emoji : null
    const comment = String(i?.comment ?? '').trim().slice(0, 2000)
    let sessionId: number | null = i?.sessionId == null ? null : Number(i.sessionId)
    if (sessionId != null && !get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', [sessionId, u.id])) sessionId = null
    const { lastInsertRowid } = run('INSERT INTO feedback(user_id, session_id, rating, emoji, comment, created_at) VALUES(?,?,?,?,?,?)', [
      u.id,
      sessionId,
      rating,
      emoji,
      comment,
      nowIso()
    ])
    return ok(toFeedback(get(`${SELECT} WHERE f.id = ?`, [lastInsertRowid])))
  })

  handle(CH.feedbackList, (): FeedbackRow[] => {
    const u = requireUser()
    return all(`${SELECT} WHERE f.user_id = ? ORDER BY f.created_at DESC, f.id DESC`, [u.id]).map(toFeedback)
  })
}
