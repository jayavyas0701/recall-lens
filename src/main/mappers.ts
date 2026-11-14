// OWNER: orchestrator. Row → shared type mappers.
import { accessFromRow, isLockedNow } from './access'
import type { SessionRow, SessionSummary, User, TranscriptSegment, ScreenEvent, Agent, Ticket } from '../shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toUser(r: any): User {
  return {
    id: Number(r.id),
    name: String(r.name),
    email: String(r.email),
    avatarColor: String(r.avatar_color ?? 'violet'),
    plan: (r.plan ?? 'free') as User['plan'],
    onboarded: !!r.onboarded,
    createdAt: String(r.created_at)
  }
}

export function toSession(r: any): SessionRow {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    title: String(r.title ?? 'Untitled session'),
    startedAt: String(r.started_at),
    durationS: Number(r.duration_s ?? 0),
    audioPath: r.audio_path ?? null,
    screenPath: r.screen_path ?? null,
    thumbnailPath: r.thumbnail_path ?? null,
    status: (r.status ?? 'saved') as SessionRow['status'],
    isDemo: !!r.is_demo,
    snippet: isLockedNow(r) ? '' : String(r.snippet ?? ''),
    hasSummary: !!r.summary_json,
    access: accessFromRow(r),
    isLockedNow: isLockedNow(r)
  }
}

export function parseSummary(json: unknown): SessionSummary | null {
  if (!json || typeof json !== 'string') return null
  try {
    return JSON.parse(json) as SessionSummary
  } catch {
    return null
  }
}

export function toSegment(r: any): TranscriptSegment {
  return { id: Number(r.id), sessionId: Number(r.session_id), tStart: Number(r.t_start), tEnd: Number(r.t_end), text: String(r.text) }
}

export function toEvent(r: any): ScreenEvent {
  return {
    id: Number(r.id),
    sessionId: Number(r.session_id),
    t: Number(r.t),
    description: String(r.description),
    screenshotPath: r.screenshot_path ?? null,
    screenText: r.screen_text ?? null
  }
}

export function toAgent(r: any): Agent {
  return { id: Number(r.id), name: String(r.name), email: String(r.email), avatarColor: String(r.avatar_color), specialty: String(r.specialty) }
}

export function toTicket(r: any): Ticket {
  return {
    id: Number(r.id),
    code: String(r.code),
    userId: r.user_id == null ? null : Number(r.user_id),
    agentId: Number(r.agent_id),
    subject: String(r.subject),
    description: String(r.description),
    priority: r.priority,
    status: r.status,
    createdAt: String(r.created_at),
    agent: r.agent_name
      ? { id: Number(r.agent_id), name: String(r.agent_name), email: String(r.agent_email), avatarColor: String(r.agent_color), specialty: String(r.agent_specialty) }
      : undefined
  }
}
