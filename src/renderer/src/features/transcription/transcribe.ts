// OWNER: subagent B. Picks a transcription engine (OpenAI API if configured, else local Whisper in a worker).
import type { TranscriptSegment } from '@shared/types'
import { cv } from '@/lib/api'
import { logError } from '@/lib/utils'

export type Seg = Omit<TranscriptSegment, 'sessionId' | 'id'>
type Progress = (detail: string) => void

interface WorkerResult {
  chunks: { start: number; end: number; text: string }[]
  model: string
  device: string
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: WorkerResult) => void; reject: (e: Error) => void; onProgress: Progress }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; id: number; text?: string; message?: string } & Partial<WorkerResult>
    const p = pending.get(m.id)
    if (!p) return
    if (m.type === 'progress' && m.text) p.onProgress(m.text)
    else if (m.type === 'result') {
      pending.delete(m.id)
      p.resolve({ chunks: m.chunks ?? [], model: m.model ?? '', device: m.device ?? '' })
    } else if (m.type === 'error') {
      pending.delete(m.id)
      const msg = m.message || 'Transcription failed'
      p.reject(new Error(/fetch|network|load/i.test(msg) ? `Couldn't load the Whisper model — are you offline? (${msg})` : msg))
    }
  }
  w.onerror = (e) => {
    logError('Whisper worker crashed', e.message)
    for (const [, p] of pending) p.reject(new Error(e.message || 'Whisper worker crashed'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  worker = w
  return w
}

/** Fetch + decode the session audio to 16 kHz mono. Returns null when there is no usable audio. */
async function loadAudio(audioPath: string): Promise<Float32Array | null> {
  const res = await fetch(cv.storage.mediaUrl(audioPath))
  if (!res.ok) throw new Error(`Could not read audio (${res.status})`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 1024) return null
  const ac = new AudioContext({ sampleRate: 16000 })
  try {
    const audio = await ac.decodeAudioData(buf)
    if (!audio.length) return null
    const out = new Float32Array(audio.length)
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c)
      for (let i = 0; i < ch.length; i++) out[i] += ch[i]! / audio.numberOfChannels
    }
    return out
  } finally {
    void ac.close().catch(() => undefined)
  }
}

/** True when the signal is essentially silence. */
function isSilent(a: Float32Array): boolean {
  let peak = 0
  let sum = 0
  for (let i = 0; i < a.length; i += 4) {
    const v = Math.abs(a[i]!)
    if (v > peak) peak = v
    sum += v * v
  }
  const rms = Math.sqrt(sum / Math.max(1, a.length / 4))
  return peak < 0.01 || rms < 0.0015
}

const NOISE = /^\s*(\[.*\]|\(.*\)|♪+|\.+|-+)\s*$/

export function chunksToSegments(chunks: WorkerResult['chunks']): Seg[] {
  return chunks
    .map((c) => ({ tStart: Math.max(0, c.start), tEnd: Math.max(c.start, c.end), text: c.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text && !NOISE.test(s.text) && !/blank_audio/i.test(s.text))
}

export async function transcribeLocal(sessionId: number, onProgress: Progress): Promise<Seg[]> {
  const detail = await cv.sessions.get(sessionId)
  if (!detail?.audioPath) return []
  onProgress('Preparing audio…')
  const audio = await loadAudio(detail.audioPath)
  if (!audio || isSilent(audio)) return []
  const id = nextId++
  const w = getWorker()
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    // Stage safety: never sit on "Transcribing…" forever (slow model download on venue Wi-Fi).
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('Transcription timed out — summarizing from your screen activity instead.'))
    }, 150_000)
    pending.set(id, {
      resolve: (r: WorkerResult) => (window.clearTimeout(timer), resolve(r)),
      reject: (e: unknown) => (window.clearTimeout(timer), reject(e)),
      onProgress
    })
    w.postMessage({ type: 'transcribe', id, audio }, [audio.buffer])
  })
  return chunksToSegments(result.chunks)
}

/** OpenAI Whisper API when OPENAI_API_KEY is set (falls back to local), else local Whisper. */
export async function transcribeSession(sessionId: number, onProgress: Progress): Promise<Seg[]> {
  try {
    const info = await cv.app.info()
    if (info.hasOpenAIKey) {
      onProgress('Transcribing with OpenAI Whisper…')
      const r = await cv.transcripts.transcribeRemote(sessionId)
      if (r.ok && r.data) return r.data
      logError('Remote transcription failed, falling back to local Whisper:', r.error)
    }
  } catch (e) {
    logError('Remote transcription errored, falling back to local Whisper', e)
  }
  return transcribeLocal(sessionId, onProgress)
}
