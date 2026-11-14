// OWNER: subagent A. Module-level recorder store: survives the panel closing, drives the top-bar button.
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { MAX_SESSION_SECONDS, SCREENSHOT_INTERVAL_SECONDS, type ScreenEvent } from '@shared/types'
import { cv } from '@/lib/api'
import { emit } from '@/lib/events'
import { celebrate } from '@/lib/confetti'
import { logError } from '@/lib/utils'
import { runPostProcessing, type PipelineStage } from '@/features/transcription/pipeline'

export type Phase = 'idle' | 'starting' | 'recording' | 'stopping'

export interface RecState {
  phase: Phase
  panelOpen: boolean
  sessionId: number | null
  elapsed: number // seconds
  hasMic: boolean
  hasScreen: boolean
  hasSystemAudio: boolean
  events: ScreenEvent[]
  pendingShots: number
  lastSavedId: number | null
}

const initial: RecState = {
  phase: 'idle',
  panelOpen: false,
  sessionId: null,
  elapsed: 0,
  hasMic: false,
  hasScreen: false,
  hasSystemAudio: false,
  events: [],
  pendingShots: 0,
  lastSavedId: null
}

let state: RecState = initial
const listeners = new Set<() => void>()
function set(patch: Partial<RecState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useRecorder(): RecState {
  return useSyncExternalStore(subscribe, () => state)
}
export const getRecState = (): RecState => state

export function openPanel(): void {
  set({ panelOpen: true })
}
export function setPanelOpen(open: boolean): void {
  set({ panelOpen: open })
}

// ---------- live media (not part of the React snapshot) ----------
interface Live {
  micStream: MediaStream | null
  screenStream: MediaStream | null
  audioCtx: AudioContext | null
  analyser: AnalyserNode | null
  micRec: MediaRecorder | null
  screenRec: MediaRecorder | null
  micChunks: Blob[]
  screenChunks: Blob[]
  video: HTMLVideoElement | null
  startedAtMs: number
  tick: number | null
  autoStop: number | null
  warned: boolean
  shotTimes: number[]
  shotPromises: Promise<unknown>[]
}
let live: Live | null = null

/** Analyser for the waveform canvas (null when not recording or no mic). */
export const getAnalyser = (): AnalyserNode | null => live?.analyser ?? null

const WARN_AT = MAX_SESSION_SECONDS - 15
const TOAST_ID = 'cv-recording-progress'

function pickMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return candidates.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m)
    } catch {
      return false
    }
  })
}

function errName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
}

function micErrorToast(e: unknown): void {
  const n = errName(e)
  const action = { label: 'Open Settings', onClick: () => (location.hash = '#/app/settings') }
  if (n === 'NotAllowedError' || n === 'SecurityError')
    toast.error('Microphone access is blocked', { description: 'Allow microphone access in Settings → Permissions, then try again.', action })
  else if (n === 'NotFoundError' || n === 'OverconstrainedError')
    toast.warning('No microphone found', { description: 'Plug in or enable a mic — recording the screen only for now.', action })
  else toast.warning('Couldn’t start the microphone', { description: 'Recording the screen only. Check Settings → Permissions.', action })
}

async function getMic(): Promise<MediaStream | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('getUserMedia unavailable'), { name: 'NotFoundError' })
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    logError('Microphone failed', e)
    micErrorToast(e)
    return null
  }
}

async function getScreen(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) return null
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true })
  } catch (e) {
    logError('Screen capture with audio failed, retrying without system audio', e)
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
    } catch (e2) {
      logError('Screen capture failed', e2)
      return null
    }
  }
}

function stopStream(s: MediaStream | null): void {
  s?.getTracks().forEach((t) => {
    try {
      t.stop()
    } catch {
      /* ignore */
    }
  })
}

function makeRecorder(stream: MediaStream, mimes: string[], sink: Blob[]): MediaRecorder | null {
  try {
    const mimeType = pickMime(mimes)
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) sink.push(ev.data)
    }
    rec.onerror = (ev) => logError('MediaRecorder error', ev)
    rec.start(1000)
    return rec
  } catch (e) {
    logError('MediaRecorder could not start', e)
    return null
  }
}

function stopRecorder(rec: MediaRecorder | null): Promise<void> {
  return new Promise((resolve) => {
    if (!rec || rec.state === 'inactive') return resolve()
    const done = (): void => resolve()
    rec.addEventListener('stop', done, { once: true })
    setTimeout(done, 3000) // never hang the UI on a stuck recorder
    try {
      rec.stop()
    } catch {
      resolve()
    }
  })
}

function releaseLive(): void {
  if (!live) return
  if (live.tick) clearInterval(live.tick)
  if (live.autoStop) clearTimeout(live.autoStop)
  stopStream(live.micStream)
  stopStream(live.screenStream)
  if (live.video) {
    live.video.pause()
    live.video.srcObject = null
  }
  if (live.audioCtx && live.audioCtx.state !== 'closed') void live.audioCtx.close().catch(() => undefined)
  live.analyser = null
}

// ---------- screenshots ----------
function captureFrame(video: HTMLVideoElement): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const scale = Math.min(1, 1280 / w)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.7)
}

function takeScreenshot(t: number): void {
  const l = live
  const sessionId = state.sessionId
  if (!l?.video || !sessionId || !state.hasScreen) return
  const url = captureFrame(l.video)
  if (!url) return
  set({ pendingShots: state.pendingShots + 1 })
  // Fire-and-forget: Claude's description arrives whenever it's ready; the recording loop never waits.
  const p = cv.recording
    .screenshot({ sessionId, t, jpegDataUrl: url })
    .then((r) => {
      if (r.ok && r.data && state.sessionId === sessionId) set({ events: [...state.events, r.data] })
    })
    .catch((e) => logError('screenshot failed', e))
    .finally(() => set({ pendingShots: Math.max(0, state.pendingShots - 1) }))
  l.shotPromises.push(p)
}

// ---------- public actions ----------
/** Per-session privacy choice made before recording (Claude may see this session?). */
let nextAiAccess = true
export const setNextAiAccess = (v: boolean): void => void (nextAiAccess = v)

export async function startRecording(): Promise<void> {
  if (state.phase !== 'idle') return
  set({ phase: 'starting', events: [], elapsed: 0, pendingShots: 0, hasMic: false, hasScreen: false, hasSystemAudio: false })

  const mic = await getMic()
  const screen = await getScreen()
  if (!screen) {
    if (mic) toast.warning('Screen capture unavailable — recording your voice only', { description: 'Check Settings → Permissions → Screen Recording.' })
  }
  if (!mic && !screen) {
    toast.error('Nothing to record', {
      description: 'Context Vault needs your microphone or screen. Check Settings → Permissions.',
      action: { label: 'Open Settings', onClick: () => (location.hash = '#/app/settings') }
    })
    set({ phase: 'idle' })
    return
  }

  const startedAtMs = Date.now()
  const created = await cv.recording.create({ startedAt: new Date(startedAtMs).toISOString(), aiAccess: nextAiAccess }).catch((e) => {
    logError('create session failed', e)
    return { ok: false as const, error: String(e), data: undefined }
  })
  if (!created.ok || !created.data) {
    stopStream(mic)
    stopStream(screen)
    toast.error('Couldn’t start a session', { description: created.error ?? 'Please try again.' })
    set({ phase: 'idle' })
    return
  }

  const l: Live = {
    micStream: mic,
    screenStream: screen,
    audioCtx: null,
    analyser: null,
    micRec: null,
    screenRec: null,
    micChunks: [],
    screenChunks: [],
    video: null,
    startedAtMs,
    tick: null,
    autoStop: null,
    warned: false,
    shotTimes: [2, ...Array.from({ length: Math.floor((MAX_SESSION_SECONDS - 1) / SCREENSHOT_INTERVAL_SECONDS) }, (_, i) => (i + 1) * SCREENSHOT_INTERVAL_SECONDS)],
    shotPromises: []
  }
  live = l

  // Mic → recorder + analyser for the live waveform.
  if (mic) {
    l.micRec = makeRecorder(mic, ['audio/webm;codecs=opus', 'audio/webm'], l.micChunks)
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      l.audioCtx = new Ctx()
      const src = l.audioCtx.createMediaStreamSource(mic)
      l.analyser = l.audioCtx.createAnalyser()
      l.analyser.fftSize = 1024
      l.analyser.smoothingTimeConstant = 0.75
      src.connect(l.analyser)
    } catch (e) {
      logError('AudioContext failed (waveform disabled)', e)
    }
    mic.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (state.phase === 'recording') toast.warning('Microphone disconnected', { description: 'The screen keeps recording.' })
    })
  }

  // Screen → recorder (+ loopback system audio if present) + hidden <video> for screenshots.
  const hasSystemAudio = !!screen && screen.getAudioTracks().length > 0
  if (screen) {
    l.screenRec = makeRecorder(screen, ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'], l.screenChunks)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = screen
    void v.play().catch((e) => logError('screen preview play failed', e))
    l.video = v
    screen.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (state.phase !== 'recording') return
      toast.info('Screen sharing stopped — still recording your voice')
      set({ hasScreen: false })
    })
  }
  if (!l.micRec && !l.screenRec) {
    releaseLive()
    live = null
    await cv.recording.finalize({ sessionId: created.data.sessionId, durationS: 0, audio: null, screen: null }).catch(() => undefined)
    toast.error('Recording isn’t supported here', { description: 'MediaRecorder could not start on this device.' })
    set({ phase: 'idle' })
    return
  }

  set({
    phase: 'recording',
    sessionId: created.data.sessionId,
    hasMic: !!l.micRec,
    hasScreen: !!l.screenRec,
    hasSystemAudio
  })
  toast.success('Recording started', { description: 'Switch to any app — the red pill in the top bar shows the 3:00 countdown.' })
  // Tuck the panel away just before the first screenshot (t≈2 s) so Claude sees your work, not the recorder itself.
  if (l.screenRec) window.setTimeout(() => state.phase === 'recording' && setPanelOpen(false), 1400)

  l.tick = window.setInterval(() => {
    const elapsed = Math.min(MAX_SESSION_SECONDS, (Date.now() - l.startedAtMs) / 1000)
    set({ elapsed })
    if (!l.warned && elapsed >= WARN_AT) {
      l.warned = true
      toast.warning('15 seconds left ⏳', { description: 'Recording stops automatically at 3:00.' })
    }
    while (l.shotTimes.length && elapsed >= l.shotTimes[0]) takeScreenshot(l.shotTimes.shift()!)
    if (elapsed >= MAX_SESSION_SECONDS) void stopRecording('auto')
  }, 250)
  // Exactly MAX_SESSION_SECONDS, independent of tick jitter.
  l.autoStop = window.setTimeout(() => void stopRecording('auto'), MAX_SESSION_SECONDS * 1000)
}

const STAGE_TEXT: Record<PipelineStage | 'saving', { title: string; description: string }> = {
  saving: { title: 'Saving your memory…', description: 'Writing audio + screen files to your vault folder' },
  transcribing: { title: 'Transcribing…', description: 'Turning your voice into searchable text' },
  summarizing: { title: 'Summarizing…', description: 'Claude is writing your TL;DR, key points and timeline' },
  done: { title: 'Done 🎉', description: 'Your memory is ready' }
}

export async function stopRecording(reason: 'user' | 'auto' = 'user'): Promise<void> {
  const l = live
  if (state.phase !== 'recording' || !l) return
  const sessionId = state.sessionId!
  const durationS = Math.min(MAX_SESSION_SECONDS, (Date.now() - l.startedAtMs) / 1000)
  set({ phase: 'stopping', elapsed: durationS })
  if (l.tick) clearInterval(l.tick)
  if (l.autoStop) clearTimeout(l.autoStop)
  if (reason === 'auto') toast.info('3:00 reached — recording stopped automatically')

  toast.loading(STAGE_TEXT.saving.title, { id: TOAST_ID, description: STAGE_TEXT.saving.description, duration: Infinity })
  await Promise.all([stopRecorder(l.micRec), stopRecorder(l.screenRec)])
  releaseLive()

  let res: Awaited<ReturnType<typeof cv.recording.finalize>>
  let captured = false
  try {
    const audioBlob = l.micChunks.length ? new Blob(l.micChunks, { type: 'audio/webm' }) : null
    const screenBlob = l.screenChunks.length ? new Blob(l.screenChunks, { type: 'video/webm' }) : null
    const [audio, screen] = await Promise.all([audioBlob?.arrayBuffer() ?? null, screenBlob?.arrayBuffer() ?? null])
    captured = !!(audio || screen)
    res = await cv.recording.finalize({ sessionId, durationS, audio, screen })
  } catch (e) {
    logError('stop/save failed', e)
    res = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  live = null
  // The recorder is free again right away; transcription + summary continue in the background.
  set({ phase: 'idle', sessionId: null, elapsed: 0, events: [], pendingShots: 0 })
  emit('sessions:changed')

  if (!res.ok || !res.data) {
    toast.error(captured ? 'Couldn’t save the recording' : 'Nothing was captured', {
      id: TOAST_ID,
      description: res.error ?? 'No audio or video data arrived — please try again.',
      duration: 6000
    })
    return
  }
  emit('files:changed')
  set({ lastSavedId: sessionId, panelOpen: false })
  void postProcess(sessionId, l.shotPromises)
}

async function postProcess(sessionId: number, shotPromises: Promise<unknown>[]): Promise<void> {
  try {
    // Let in-flight screenshot descriptions land so the summary can use them (bounded wait).
    await Promise.race([Promise.allSettled(shotPromises), new Promise((r) => setTimeout(r, 8000))])
    const result = await runPostProcessing(sessionId, (stage, detail) => {
      if (stage === 'done') return
      const s = STAGE_TEXT[stage]
      toast.loading(s.title, { id: TOAST_ID, description: detail ?? s.description, duration: Infinity })
      emit('sessions:changed')
    }).catch((e) => {
      logError('post-processing failed', e)
      return { ok: false, error: String(e) }
    })
    emit('sessions:changed')
    const open = { label: 'Open summary', onClick: () => (location.hash = `#/app/summary?session=${sessionId}`) }
    if (result.ok) {
      toast.success(STAGE_TEXT.done.title, { id: TOAST_ID, description: 'Your memory is saved and searchable.', duration: 10000, action: open })
      celebrate()
    } else {
      toast.warning('Saved — but processing hit a snag', {
        id: TOAST_ID,
        description: result.error ? `${result.error}. Your files are safe.` : 'Your files are safe in the vault.',
        duration: 10000,
        action: open
      })
    }
  } catch (e) {
    logError('post-processing crashed', e)
    toast.warning('Saved — but processing hit a snag', { id: TOAST_ID, description: 'Your files are safe in the vault.', duration: 8000 })
  }
}

/** Stop without saving: deletes the session row and any screenshots taken so far. */
export async function discardRecording(): Promise<void> {
  const l = live
  if (state.phase !== 'recording' || !l) return
  const sessionId = state.sessionId!
  set({ phase: 'stopping' })
  await Promise.all([stopRecorder(l.micRec), stopRecorder(l.screenRec)])
  releaseLive()
  live = null
  try {
    await Promise.race([Promise.allSettled(l.shotPromises), new Promise((r) => setTimeout(r, 3000))])
    await cv.recording.finalize({ sessionId, durationS: 0, audio: null, screen: null })
    toast('Recording discarded', { description: 'Nothing was saved.' })
  } catch (e) {
    logError('discard failed', e)
    toast.error('Couldn’t discard cleanly', { description: 'Any leftovers will be cleaned up automatically.' })
  } finally {
    set({ phase: 'idle', sessionId: null, events: [], elapsed: 0 })
    emit('sessions:changed')
  }
}

// Make sure devices are released if the window is closed mid-recording.
window.addEventListener('beforeunload', () => releaseLive())
