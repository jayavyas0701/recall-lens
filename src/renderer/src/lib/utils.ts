// OWNER: orchestrator
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** 125 → "2:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 3720 → "1h 2m", 95 → "1m 35s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  const r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${u[i]}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

export function greeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name.split(' ')[0]} ✨`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

/** Gradient per avatar/agent color key. */
export const GRADIENTS: Record<string, string> = {
  violet: 'linear-gradient(135deg,#7C3AED,#A78BFA)',
  pink: 'linear-gradient(135deg,#EC4899,#F9A8D4)',
  orange: 'linear-gradient(135deg,#F59E0B,#FCD34D)',
  cyan: 'linear-gradient(135deg,#06B6D4,#67E8F9)',
  lime: 'linear-gradient(135deg,#84CC16,#BEF264)'
}
export const ACCENTS: Record<string, string> = {
  violet: '#7C3AED',
  pink: '#EC4899',
  orange: '#F59E0B',
  cyan: '#06B6D4',
  lime: '#84CC16'
}

export const logError = (...a: unknown[]): void =>
  console.error('[ContextVault]', ...a.map((x) => (x instanceof Error || x instanceof DOMException ? `${x.name}: ${x.message}` : x)))
