// OWNER: subagent A (Vault files). In-app file manager: list recordings, move them to the OS Trash.
import { existsSync, readdirSync, renameSync, mkdirSync, statSync } from 'fs'
import { join, resolve, sep, basename } from 'path'
import { shell } from 'electron'
import { CH, type VaultFile } from '../../shared/types'
import { all, get, run } from '../db'
import { getPaths } from '../paths'
import { log } from '../log'
import { requireUser } from './auth'
import { handle, handleResult, ok, fail } from './util'
import { deleteSessionCompletely } from './recording'

interface SessionPaths {
  id: number
  user_id: number
  audio_path: string | null
  screen_path: string | null
  is_demo: number
}

/** All sessions (any user) that reference a file — used to map files → sessions and to protect other users' files. */
function sessionsByPath(): Map<string, SessionPaths> {
  const m = new Map<string, SessionPaths>()
  for (const r of all<SessionPaths>('SELECT id, user_id, audio_path, screen_path, is_demo FROM sessions WHERE audio_path IS NOT NULL OR screen_path IS NOT NULL')) {
    if (r.audio_path) m.set(resolve(r.audio_path), r)
    if (r.screen_path) m.set(resolve(r.screen_path), r)
  }
  return m
}

function scan(dir: string, kind: VaultFile['kind']): Omit<VaultFile, 'sessionId'>[] {
  if (!existsSync(dir)) return []
  const out: Omit<VaultFile, 'sessionId'>[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    const path = join(dir, e.name)
    try {
      const st = statSync(path)
      out.push({ path, name: e.name, kind, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() })
    } catch {
      /* vanished */
    }
  }
  return out
}

/** Only files directly inside the audio / screen recording folders may be deleted from the app. */
function vaultKind(p: string): VaultFile['kind'] | null {
  const { audio, screen } = getPaths()
  const r = resolve(p)
  if (r.startsWith(resolve(audio) + sep) && !r.slice(resolve(audio).length + 1).includes(sep)) return 'audio'
  if (r.startsWith(resolve(screen) + sep) && !r.slice(resolve(screen).length + 1).includes(sep)) return 'screen'
  return null
}

/** shell.trashItem with a clearly-labelled fallback: if the OS has no usable Trash, move into <root>/.trash (still recoverable). */
async function moveToTrash(p: string): Promise<void> {
  try {
    await shell.trashItem(p)
  } catch (e) {
    log.warn('OS Trash unavailable, moving to the vault .trash folder instead:', p, e)
    const dir = join(getPaths().root, '.trash')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    renameSync(p, join(dir, `${Date.now()}-${basename(p)}`))
  }
}

export function registerFiles(): void {
  handle(CH.filesList, (): VaultFile[] => {
    const u = requireUser()
    const p = getPaths()
    const byPath = sessionsByPath()
    const files: VaultFile[] = []
    for (const f of [...scan(p.audio, 'audio'), ...scan(p.screen, 'screen')]) {
      const s = byPath.get(resolve(f.path))
      if (s && Number(s.user_id) !== u.id) continue // another account's recording on this machine — not yours to see
      files.push({ ...f, sessionId: s ? Number(s.id) : null })
    }
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  })

  handleResult(CH.filesTrash, async (paths: string[]) => {
    const u = requireUser()
    if (!Array.isArray(paths) || paths.length === 0) return fail<{ freedBytes: number; trashed: number }>('Nothing selected')
    const byPath = sessionsByPath()
    let freedBytes = 0
    let trashed = 0
    const errors: string[] = []
    const touched = new Set<number>()

    for (const raw of [...new Set(paths.map((x) => resolve(String(x))))]) {
      const kind = vaultKind(raw)
      if (!kind) {
        errors.push(`${basename(raw)} is outside the recordings folders`)
        continue
      }
      const s = byPath.get(raw)
      if (s && Number(s.user_id) !== u.id) {
        errors.push(`${basename(raw)} belongs to another account`)
        continue
      }
      if (!existsSync(raw)) {
        // Already gone (deleted in Finder?) — still clean up the DB reference below.
        if (s) {
          run(`UPDATE sessions SET ${kind}_path = NULL WHERE id = ?`, [s.id])
          touched.add(Number(s.id))
        }
        continue
      }
      try {
        const size = statSync(raw).size
        await moveToTrash(raw)
        freedBytes += size
        trashed++
        if (s) {
          // Null whichever column points at this file.
          if (s.audio_path && resolve(s.audio_path) === raw) run('UPDATE sessions SET audio_path = NULL WHERE id = ?', [s.id])
          if (s.screen_path && resolve(s.screen_path) === raw) run('UPDATE sessions SET screen_path = NULL WHERE id = ?', [s.id])
          touched.add(Number(s.id))
        }
      } catch (e) {
        log.error('Trash failed for', raw, e)
        errors.push(`${basename(raw)}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // Sessions with no recordings left are removed (with their screenshots + transcript files). Demo sessions stay.
    for (const id of touched) {
      const r = get<{ audio_path: string | null; screen_path: string | null; is_demo: number }>(
        'SELECT audio_path, screen_path, is_demo FROM sessions WHERE id = ? AND user_id = ?',
        [id, u.id]
      )
      if (r && !r.is_demo && !r.audio_path && !r.screen_path) {
        log.info('Session has no recordings left — removing', id)
        await deleteSessionCompletely(id, true)
      }
    }

    if (trashed === 0 && errors.length) return fail<{ freedBytes: number; trashed: number }>(errors[0])
    if (errors.length) log.warn('Some files could not be trashed:', errors)
    return ok({ freedBytes, trashed })
  })
}
