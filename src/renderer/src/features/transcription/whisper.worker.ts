// OWNER: subagent B. Local Whisper (transformers.js) in a module Web Worker so the UI stays smooth.
// Protocol — in:  { type:'transcribe', id, audio: Float32Array (16 kHz mono) }
//            out: { type:'progress', id, text } | { type:'result', id, chunks:[{start,end,text}], model, device } | { type:'error', id, message }
import { env, pipeline, type ProgressInfo } from '@huggingface/transformers'

type Device = 'webgpu' | 'wasm'
interface ASRChunk {
  timestamp: [number, number | null]
  text: string
}
interface ASROutput {
  text: string
  chunks?: ASRChunk[]
}
type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<ASROutput | ASROutput[]>

interface WorkerScope {
  postMessage(msg: unknown): void
  onmessage: ((e: MessageEvent) => void) | null
}
const ctx = self as unknown as WorkerScope

const MODELS = ['onnx-community/whisper-base.en', 'Xenova/whisper-tiny.en']

env.allowLocalModels = false

let loading: Promise<{ asr: Transcriber; model: string; device: Device }> | null = null
let currentId = 0

const post = (msg: Record<string, unknown>): void => ctx.postMessage(msg)

async function pickDevice(): Promise<Device> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu && (await gpu.requestAdapter())) return 'webgpu'
  } catch {
    /* fall through */
  }
  return 'wasm'
}

function dtypeFor(device: Device, model: string): unknown {
  if (device === 'webgpu') return { encoder_model: 'fp32', decoder_model_merged: model.includes('tiny') ? 'fp32' : 'q4' }
  return 'q8'
}

async function load(): Promise<{ asr: Transcriber; model: string; device: Device }> {
  const preferred = await pickDevice()
  const attempts: [string, Device][] = []
  for (const m of MODELS) {
    attempts.push([m, preferred])
    if (preferred === 'webgpu') attempts.push([m, 'wasm'])
  }
  let lastErr: unknown = null
  for (const [model, device] of attempts) {
    try {
      post({ type: 'progress', id: currentId, text: 'Loading Whisper model…' })
      let lastPct = -1
      const asr = (await pipeline('automatic-speech-recognition', model, {
        device,
        dtype: dtypeFor(device, model) as never,
        progress_callback: (p: ProgressInfo) => {
          if (p.status === 'progress_total' && p.total > 0) {
            const pct = Math.floor(p.progress)
            // Only report real downloads (cache hits finish instantly and don't need a progress bar).
            if (pct !== lastPct && pct < 100) {
              lastPct = pct
              post({ type: 'progress', id: currentId, text: `Downloading Whisper model… ${pct}%` })
            }
          }
        }
      })) as unknown as Transcriber
      return { asr, model, device }
    } catch (e) {
      lastErr = e
      console.warn('[ContextVault] Whisper load failed for', model, device, e)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not load a Whisper model')
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; id: number; audio: Float32Array }
  if (msg?.type !== 'transcribe') return
  currentId = msg.id
  try {
    if (!loading) loading = load()
    let loaded
    try {
      loaded = await loading
    } catch (err) {
      loading = null // allow a retry next time
      throw err
    }
    post({ type: 'progress', id: msg.id, text: `Transcribing on ${loaded.device === 'webgpu' ? 'GPU' : 'CPU'}…` })
    const out = await loaded.asr(msg.audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5
    })
    const res = Array.isArray(out) ? out[0]! : out
    const duration = msg.audio.length / 16000
    const chunks = (res.chunks?.length ? res.chunks : [{ timestamp: [0, duration] as [number, number], text: res.text ?? '' }]).map((c) => ({
      start: Number(c.timestamp?.[0] ?? 0),
      end: Number(c.timestamp?.[1] ?? duration),
      text: String(c.text ?? '')
    }))
    post({ type: 'result', id: msg.id, chunks, model: loaded.model, device: loaded.device })
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
