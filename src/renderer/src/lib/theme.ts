// OWNER: orchestrator. light / vibrant theme toggle (persisted per user via settings).
import type { ThemeMode } from '@shared/types'
import { cv } from './api'

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode
}

export async function loadTheme(): Promise<ThemeMode> {
  const m = ((await cv.settings.get('theme')) as ThemeMode | null) ?? 'vibrant'
  applyTheme(m)
  return m
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  applyTheme(mode)
  await cv.settings.set('theme', mode)
}
