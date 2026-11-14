// OWNER: subagent C (Support). Shared display metadata + helpers for the support widget and page.
import type { Priority, TicketStatus } from '@shared/types'

export const PRIORITY_META: Record<Priority, { label: string; color: string; soft: string; text: string; emoji: string }> = {
  low: {
    label: 'Low',
    color: '#06B6D4',
    soft: 'rgb(6 182 212 / 0.12)',
    text: '#0e7490',
    emoji: '🌱'
  },
  medium: {
    label: 'Medium',
    color: '#F59E0B',
    soft: 'rgb(245 158 11 / 0.15)',
    text: '#b45309',
    emoji: '⚡'
  },
  high: {
    label: 'High',
    color: '#EC4899',
    soft: 'rgb(236 72 153 / 0.12)',
    text: '#be185d',
    emoji: '🔥'
  }
}

export const STATUS_META: Record<TicketStatus, { label: string; color: string; soft: string; text: string }> = {
  open: {
    label: 'Open',
    color: '#7C3AED',
    soft: 'rgb(124 58 237 / 0.10)',
    text: '#6d28d9'
  },
  in_progress: {
    label: 'In progress',
    color: '#F59E0B',
    soft: 'rgb(245 158 11 / 0.15)',
    text: '#b45309'
  },
  resolved: {
    label: 'Resolved',
    color: '#84CC16',
    soft: 'rgb(132 204 22 / 0.16)',
    text: '#4d7c0f'
  }
}

export const firstName = (name: string): string => name.split(/\s+/)[0] ?? name

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return ''
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 14) return `${d}d ago`
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  })
}
