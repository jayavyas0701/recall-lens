// OWNER: orchestrator. Per-session access controls (Claude AI, MCP, search, password lock).
import type { SessionAccess } from '../shared/types'
import { basename } from 'path'
import { get } from './db'

/** Sessions unlocked with the password during this app run (cleared on restart). */
const unlocked = new Set<number>()

export const markUnlocked = (id: number): void => void unlocked.add(id)
export const unlockedIdsJson = (): string => JSON.stringify([...unlocked])
export const markLocked = (id: number): void => void unlocked.delete(id)

/* eslint-disable @typescript-eslint/no-explicit-any */
export function accessFromRow(r: any): SessionAccess {
  return {
    ai: r?.ai_access == null ? true : !!r.ai_access,
    mcp: r?.mcp_access == null ? true : !!r.mcp_access,
    search: r?.search_access == null ? true : !!r.search_access,
    locked: !!r?.locked
  }
}

export function isLockedNow(r: any): boolean {
  return !!r?.locked && !unlocked.has(Number(r.id))
}

export function sessionAccess(id: number): (SessionAccess & { lockedNow: boolean }) | null {
  const r = get('SELECT id, ai_access, mcp_access, search_access, locked FROM sessions WHERE id = ?', [id])
  return r ? { ...accessFromRow(r), lockedNow: isLockedNow(r) } : null
}

/** Claude (cloud AI) may read this session's content right now. */
export function aiAllowed(id: number | null | undefined): boolean {
  if (!id) return true
  const a = sessionAccess(id)
  return !!a && a.ai && !a.lockedNow
}

/** True when a media file belongs to a session that is currently locked (playback/thumbnails blocked). */
export function mediaBlocked(path: string): boolean {
  let r = get('SELECT id, locked FROM sessions WHERE audio_path = ? OR screen_path = ? OR thumbnail_path = ? LIMIT 1', [path, path, path])
  if (!r) {
    const m = /^session-(\d+)-/.exec(basename(path))
    if (m) r = get('SELECT id, locked FROM sessions WHERE id = ?', [Number(m[1])])
  }
  return !!r && isLockedNow(r)
}
