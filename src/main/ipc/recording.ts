// OWNER: subagent A (Recording). Session lifecycle: create → screenshots (described by Claude) → finalize (files saved locally).
import { existsSync, readdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { shell } from 'electron'
import {
  CH,
  MAX_SESSION_SECONDS,
  type CreateSessionInput,
  type FinalizeSessionInput,
  type ScreenEvent,
  type ScreenshotInput,
  type SessionRow
} from '../../shared/types'
import { all, get, run, nowIso } from '../db'
import { toEvent, toSession } from '../mappers'
import { getPaths } from '../paths'
import { describeScreenshot } from '../ai/client'
import { aiAllowed } from '../access'
import { captureScreenContext, captureWindow } from '../screen/context'
import { formatScreenText } from '../screen/describe'
import { log } from '../log'
import { requireUser } from './auth'
import { handle, handleResult, ok, fail } from './util'

const STATUSES: SessionRow['status'][] = ['recording', 'saved', 'transcribing', 'summarizing', 'ready', 'error']
const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** 2026-11-13T19:42 → "20261113-1942" (local time) */
function stamp(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

/** "Session · Nov 13, 7:42 PM" */
export function friendlyTitle(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `Session · ${date}, ${time}`
}

function ownedSession(id: number, userId: number): Record<string, unknown> | undefined {
  return get('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [Number(id), userId])
}

/** Move a file to the OS Trash (recoverable). Never throws. */
async function trashQuietly(p: string | null | undefined): Promise<void> {
  if (!p || !existsSync(p)) return
  try {
    await shell.trashItem(p)
  } catch (e) {
    log.warn('Could not trash', p, e)
  }
}

/** Screenshot files that belong to a session (by DB reference and by file-name prefix). */
export function sessionScreenshotFiles(sessionId: number): string[] {
  const dir = getPaths().screenshots
  const out = new Set<string>()
  for (const r of all<{ p: string | null }>('SELECT screenshot_path AS p FROM screen_events WHERE session_id = ?', [sessionId])) {
    if (r.p && r.p.startsWith(dir)) out.add(r.p)
  }
  const thumb = get<{ p: string | null }>('SELECT thumbnail_path AS p FROM sessions WHERE id = ?', [sessionId])?.p
  if (thumb && thumb.startsWith(dir) && basename(thumb).startsWith(`session-${sessionId}-`)) out.add(thumb)
  try {
    for (const f of readdirSync(dir)) if (f.startsWith(`session-${sessionId}-`)) out.add(join(dir, f))
  } catch {
    /* folder may not exist */
  }
  return [...out]
}

/** Delete a session row (and its rows in child tables) plus its screenshots. */
export async function deleteSessionCompletely(sessionId: number, alsoTranscripts = false): Promise<void> {
  const shots = sessionScreenshotFiles(sessionId)
  run('DELETE FROM transcript_segments WHERE session_id = ?', [sessionId])
  run('DELETE FROM screen_events WHERE session_id = ?', [sessionId])
  run('DELETE FROM sessions WHERE id = ?', [sessionId])
  for (const s of shots) await trashQuietly(s)
  if (alsoTranscripts) {
    const dir = getPaths().transcripts
    try {
      for (const f of readdirSync(dir)) if (f.startsWith(`session-${sessionId}-`) || f === `session-${sessionId}.txt` || f === `session-${sessionId}.json`) await trashQuietly(join(dir, f))
    } catch {
      /* ignore */
    }
  }
}

/** Sessions left in 'recording' (app crashed / closed mid-recording) for > 10 minutes are cleaned up. */
async function cleanupStale(userId: number): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const stale = all<{ id: number }>("SELECT id FROM sessions WHERE user_id = ? AND status = 'recording' AND started_at < ?", [userId, cutoff])
  for (const s of stale) {
    log.info('Removing stale unfinished session', s.id)
    await deleteSessionCompletely(Number(s.id))
  }
}

function sessionRow(id: number): SessionRow {
  return toSession(
    get(
      `SELECT s.*, substr((SELECT group_concat(text, ' ') FROM transcript_segments ts WHERE ts.session_id = s.id), 1, 180) AS snippet
       FROM sessions s WHERE s.id = ?`,
      [id]
    )
  )
}

export function registerRecording(): void {
  handleResult(CH.recCreate, async (input: CreateSessionInput) => {
    const u = requireUser()
    await cleanupStale(u.id).catch((e) => log.warn('stale cleanup failed', e))
    const startedAt = input?.startedAt && !Number.isNaN(Date.parse(input.startedAt)) ? input.startedAt : nowIso()
    const { lastInsertRowid } = run(
      'INSERT INTO sessions(user_id, title, started_at, duration_s, status, is_demo, ai_access, created_at) VALUES(?,?,?,?,?,?,?,?)',
      [u.id, friendlyTitle(startedAt), startedAt, 0, 'recording', 0, input?.aiAccess === false ? 0 : 1, nowIso()]
    )
    log.info('Recording session created', lastInsertRowid)
    return ok({ sessionId: lastInsertRowid })
  })

  handleResult(CH.recScreenshot, async (input: ScreenshotInput) => {
    // Capture the frontmost window/URL the instant the screenshot arrives — before any slow work.
    const windowP = captureWindow()
    const u = requireUser()
    const id = Number(input?.sessionId)
    if (!ownedSession(id, u.id)) return fail<ScreenEvent>('Session not found')
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(input.jpegDataUrl ?? '')
    if (!m) return fail<ScreenEvent>('Screenshot must be a JPEG data URL')
    const base64 = m[1]
    const t = Math.max(0, Math.min(MAX_SESSION_SECONDS, Number(input.t) || 0))
    const file = join(getPaths().screenshots, `session-${id}-t${pad(Math.round(t), 3)}.jpg`)
    writeFileSync(file, Buffer.from(base64, 'base64'))

    // On-device context (window, URL, OCR). Only with an API key does the screenshot + this text go to Anthropic.
    const ctx = await captureScreenContext(windowP, file)
    const description = await describeScreenshot(base64, t, ctx, aiAllowed(id))
    const screenText = formatScreenText(ctx)
    log.info(`Screen context t=${Math.round(t)}s: app=${ctx.app ? 'yes' : 'no'} title=${ctx.title?.length ?? 0}ch url=${ctx.url ? 'yes' : 'no'} ocr=${ctx.ocr?.length ?? 0}ch`)

    // The session may have been discarded while we were looking at the screenshot.
    const s = ownedSession(id, u.id)
    if (!s) {
      await trashQuietly(file)
      return fail<ScreenEvent>('Session was discarded')
    }
    const { lastInsertRowid } = run('INSERT INTO screen_events(session_id, t, description, screenshot_path, screen_text) VALUES(?,?,?,?,?)', [
      id,
      t,
      description,
      file,
      screenText
    ])
    if (!s.thumbnail_path) run('UPDATE sessions SET thumbnail_path = ? WHERE id = ?', [file, id])
    return ok(toEvent(get('SELECT * FROM screen_events WHERE id = ?', [lastInsertRowid])))
  })

  handleResult(CH.recFinalize, async (input: FinalizeSessionInput) => {
    const u = requireUser()
    const id = Number(input?.sessionId)
    const s = ownedSession(id, u.id)
    if (!s) return fail<SessionRow>('Session not found')

    // Nothing captured (or the user pressed Discard) → remove the session entirely.
    if (!input.audio && !input.screen) {
      await deleteSessionCompletely(id)
      log.info('Recording session discarded', id)
      return ok<SessionRow>()
    }

    const p = getPaths()
    const tag = `session-${id}-${stamp(String(s.started_at))}.webm`
    let audioPath: string | null = null
    let screenPath: string | null = null
    if (input.audio && input.audio.byteLength > 0) {
      audioPath = join(p.audio, tag)
      writeFileSync(audioPath, Buffer.from(input.audio))
    }
    if (input.screen && input.screen.byteLength > 0) {
      screenPath = join(p.screen, tag)
      writeFileSync(screenPath, Buffer.from(input.screen))
    }
    const duration = Math.max(0, Math.min(MAX_SESSION_SECONDS, Number(input.durationS) || 0))
    run('UPDATE sessions SET duration_s = ?, audio_path = ?, screen_path = ?, status = ? WHERE id = ?', [
      Math.round(duration * 10) / 10,
      audioPath,
      screenPath,
      'saved',
      id
    ])
    log.info('Recording saved', { id, audioPath, screenPath, duration })
    return ok(sessionRow(id))
  })

  handle(CH.recSetStatus, (sessionId: number, status: SessionRow['status']) => {
    const u = requireUser()
    if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`)
    run('UPDATE sessions SET status = ? WHERE id = ? AND user_id = ?', [status, Number(sessionId), u.id])
  })
}
