// OWNER: orchestrator. Tiny app-wide event bus so tabs refresh when data changes.
import { useEffect } from 'react'

export type AppEvent =
  | 'sessions:changed' // a session was created, finalized, deleted, transcribed or summarized
  | 'files:changed' // files were trashed
  | 'user:changed' // profile / plan changed
  | 'qa:changed' // a question was asked
  | 'recording:open' // request to open the recorder (e.g. from an empty state)
  | 'tickets:changed'

type Handler = (payload?: unknown) => void
const handlers = new Map<AppEvent, Set<Handler>>()

export function emit(event: AppEvent, payload?: unknown): void {
  handlers.get(event)?.forEach((h) => h(payload))
}

export function on(event: AppEvent, h: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set())
  handlers.get(event)!.add(h)
  return () => handlers.get(event)?.delete(h)
}

export function useAppEvent(event: AppEvent, h: Handler): void {
  useEffect(() => on(event, h), [event, h])
}
