// OWNER: orchestrator. Simple key/value settings, scoped per signed-in user.
import { CH } from '../../shared/types'
import { get, run } from '../db'
import { currentUser } from './auth'
import { handle } from './util'

const scoped = (key: string): string => {
  const u = currentUser()
  return u ? `u${u.id}:${key}` : `global:${key}`
}

export function getSetting(key: string): string | null {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [scoped(key)])?.value ?? null
}

export function setSetting(key: string, value: string): void {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [scoped(key), value])
}

export function registerSettings(): void {
  handle(CH.settingsGet, (key: string) => getSetting(key))
  handle(CH.settingsSet, (key: string, value: string) => setSetting(key, value))
}
