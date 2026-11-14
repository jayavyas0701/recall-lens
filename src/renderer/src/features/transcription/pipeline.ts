// OWNER: subagent B (Transcription + summary). Post-recording pipeline: transcribe → save → summarize.
import type { SessionRow } from '@shared/types'
import { cv } from '@/lib/api'
import { emit } from '@/lib/events'
import { logError } from '@/lib/utils'
import { transcribeSession, type Seg } from './transcribe'

export type PipelineStage = 'transcribing' | 'summarizing' | 'done'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

async function setStatus(id: number, status: SessionRow['status']): Promise<void> {
  try {
    await cv.recording.setStatus(id, status)
  } catch (e) {
    logError('setStatus failed', status, e)
  }
}

/**
 * Called by the recorder (A) after a session's files are saved.
 * Transcribes the session audio, saves segments, then generates the Claude summary.
 * Must never throw: on failure it resolves with { ok:false, error } after doing as much as it can
 * (e.g. a summary from screen events alone).
 */
export async function runPostProcessing(
  sessionId: number,
  onStage: (stage: PipelineStage, detail?: string) => void
): Promise<{ ok: boolean; error?: string }> {
  const stage = (s: PipelineStage, detail?: string): void => {
    try {
      onStage(s, detail)
    } catch (e) {
      logError('onStage callback threw', e)
    }
  }
  let error: string | undefined
  let transcribed = false
  let summarized = false

  try {
    // 1) Transcribe
    await setStatus(sessionId, 'transcribing')
    stage('transcribing')
    emit('sessions:changed')
    let segments: Seg[] | null = null
    try {
      segments = await transcribeSession(sessionId, (detail) => stage('transcribing', detail))
    } catch (e) {
      error = `Transcription failed: ${errMsg(e)}`
      logError(error, e)
    }
    if (segments) {
      const r = await cv.transcripts.save(sessionId, segments).catch((e) => ({ ok: false, error: errMsg(e) }))
      if (r.ok) transcribed = true
      else error = error ?? `Saving transcript failed: ${r.error}`
    }

    // 2) Summarize (works from screen events alone if transcription failed)
    await setStatus(sessionId, 'summarizing')
    stage('summarizing')
    const s = await cv.ai.summarize(sessionId, true).catch((e) => ({ ok: false, error: errMsg(e) }))
    if (s.ok) summarized = true
    else {
      error = error ?? `Summary failed: ${s.error}`
      logError('Summary failed', s.error)
    }
  } catch (e) {
    error = error ?? errMsg(e)
    logError('Post-processing failed', e)
  }

  // 3) Done — 'error' only if nothing useful came out of the pipeline.
  await setStatus(sessionId, transcribed || summarized ? 'ready' : 'error')
  stage('done')
  emit('sessions:changed')
  return error ? { ok: false, error } : { ok: true }
}
