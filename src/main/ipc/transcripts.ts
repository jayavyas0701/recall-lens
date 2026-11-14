import { aiAllowed } from '../access'
// OWNER: subagent B (Transcription). Saving transcripts + optional OpenAI Whisper API transcription.
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { CH, type TranscriptSegment } from '../../shared/types'
import { get, run, transaction } from '../db'
import { env } from '../env'
import { log } from '../log'
import { getPaths } from '../paths'
import { fmtClock } from '../ai/timeWindow'
import { requireUser } from './auth'
import { fail, handleResult, ok } from './util'

type Seg = Omit<TranscriptSegment, 'sessionId' | 'id'>

/** Drop empty / non-speech segments and coerce numbers. */
export function cleanSegments(input: unknown): Seg[] {
  if (!Array.isArray(input)) return []
  return input
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>
      const tStart = Math.max(0, Number(o.tStart) || 0)
      const tEnd = Math.max(tStart, Number(o.tEnd) || tStart)
      const text = String(o.text ?? '').replace(/\s+/g, ' ').trim()
      return { tStart: Math.round(tStart * 100) / 100, tEnd: Math.round(tEnd * 100) / 100, text }
    })
    .filter((s) => s.text && !/^[[(].*[\])]$/.test(s.text) && !/^\[?blank_audio\]?$/i.test(s.text))
    .sort((a, b) => a.tStart - b.tStart)
}

function writeTranscriptFiles(sessionId: number, title: string, startedAt: string, segs: Seg[]): void {
  try {
    const dir = getPaths().transcripts
    const txt = segs.map((s) => `[${fmtClock(s.tStart)}] ${s.text}`).join('\n')
    writeFileSync(join(dir, `session-${sessionId}.txt`), txt ? `${txt}\n` : '')
    writeFileSync(join(dir, `session-${sessionId}.json`), JSON.stringify({ sessionId, title, startedAt, segments: segs }, null, 2))
  } catch (e) {
    log.error('Writing transcript files failed', e)
  }
}

const MIME: Record<string, string> = { '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4' }

/** POSTs the session audio to OpenAI's Whisper API (verbose_json, segment timestamps). */
async function transcribeWithOpenAI(audioPath: string, key: string): Promise<Seg[]> {
  const buf = readFileSync(audioPath)
  if (buf.byteLength > 25 * 1024 * 1024) throw new Error('Audio is larger than the 25 MB API limit')
  const form = new FormData()
  const ext = extname(audioPath).toLowerCase() || '.webm'
  form.append('file', new Blob([buf], { type: MIME[ext] ?? 'audio/webm' }), basename(audioPath) || `audio${ext}`)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error(`OpenAI transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { text?: string; duration?: number; segments?: { start: number; end: number; text: string }[] }
    if (Array.isArray(json.segments) && json.segments.length) {
      return cleanSegments(json.segments.map((s) => ({ tStart: s.start, tEnd: s.end, text: s.text })))
    }
    return cleanSegments(json.text ? [{ tStart: 0, tEnd: json.duration ?? 0, text: json.text }] : [])
  } finally {
    clearTimeout(timer)
  }
}

export function registerTranscripts(): void {
  handleResult(CH.transcriptsSave, (sessionId: number, segments: Seg[]) => {
    const u = requireUser()
    const s = get<{ id: number; title: string; started_at: string }>('SELECT id, title, started_at FROM sessions WHERE id = ? AND user_id = ?', [
      Number(sessionId),
      u.id
    ])
    if (!s) return fail('Session not found')
    const segs = cleanSegments(segments)
    transaction(() => {
      run('DELETE FROM transcript_segments WHERE session_id = ?', [s.id])
      for (const g of segs) run('INSERT INTO transcript_segments(session_id, t_start, t_end, text) VALUES(?,?,?,?)', [s.id, g.tStart, g.tEnd, g.text])
    })
    writeTranscriptFiles(Number(s.id), String(s.title), String(s.started_at), segs)
    log.info(`Saved ${segs.length} transcript segments for session ${s.id}`)
    return ok()
  })

  handleResult(CH.transcriptsRemote, async (sessionId: number) => {
    const u = requireUser()
    const key = env.openaiKey
    if (!key) return fail('OPENAI_API_KEY is not set')
    const s = get<{ audio_path: string | null }>('SELECT audio_path FROM sessions WHERE id = ? AND user_id = ?', [Number(sessionId), u.id])
    if (!s) return fail('Session not found')
    if (!aiAllowed(Number(sessionId))) return fail('Cloud processing is off for this session — using on-device Whisper.')
    if (!s.audio_path || !existsSync(s.audio_path)) return fail('This session has no audio file')
    try {
      return ok(await transcribeWithOpenAI(s.audio_path, key))
    } catch (e) {
      log.error('OpenAI Whisper transcription failed', e)
      return fail(e instanceof Error ? e.message : String(e))
    }
  })
}
