// OWNER: subagent A. The recorder panel: big record button inside a draining 3:00 ring, live waveform, "what Claude sees" ticker.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, EyeOff, Eye, Loader2, Lock, Mic, MicOff, Minimize2, Monitor, MonitorOff, Sparkles, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import { MAX_SESSION_SECONDS, SCREENSHOT_INTERVAL_SECONDS, type SubscriptionInfo } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cv } from '@/lib/api'
import { cn, formatClock, logError } from '@/lib/utils'
import { discardRecording, setNextAiAccess, setPanelOpen, startRecording, stopRecording, useRecorder } from './recorder'
import { Switch } from '@/components/ui/switch'
import { Waveform } from './Waveform'
import { DIALOG_POP } from './dialogFix'

const RING = 252
const STROKE = 12
const R = (RING - STROKE) / 2
const C = 2 * Math.PI * R
const SHOT_MARKS = Array.from({ length: MAX_SESSION_SECONDS / SCREENSHOT_INTERVAL_SECONDS }, (_, i) => i * SCREENSHOT_INTERVAL_SECONDS)

function CountdownRing({ elapsed, recording }: { elapsed: number; recording: boolean }): React.JSX.Element {
  const frac = Math.min(1, elapsed / MAX_SESSION_SECONDS)
  const warn = elapsed >= MAX_SESSION_SECONDS - 15
  return (
    <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="absolute inset-0 -rotate-90">
      <defs>
        <linearGradient id="cv-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="0.55" stopColor="#EC4899" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="cv-ring-warn" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EF4444" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="#ECE9FB" strokeWidth={STROKE} />
      <circle
        cx={RING / 2}
        cy={RING / 2}
        r={R}
        fill="none"
        stroke={warn ? 'url(#cv-ring-warn)' : 'url(#cv-ring)'}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * frac}
        style={{ transition: 'stroke-dashoffset 0.25s linear' }}
      />
      {/* screenshot markers: light up once Claude has had a look */}
      {SHOT_MARKS.map((t) => {
        const a = (t / MAX_SESSION_SECONDS) * 2 * Math.PI
        const x = RING / 2 + R * Math.cos(a)
        const y = RING / 2 + R * Math.sin(a)
        const passed = recording && elapsed >= Math.max(2, t)
        return <circle key={t} cx={x} cy={y} r={passed ? 2.2 : 2.6} fill={passed ? '#ffffff' : '#C4B5FD'} opacity={passed ? 0.95 : 0.9} />
      })}
    </svg>
  )
}

function Chip({ on, onIcon, offIcon, label }: { on: boolean; onIcon: React.ReactNode; offIcon: React.ReactNode; label: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold [&_svg]:size-3.5',
        on ? 'bg-lime/15 text-[#4d7c0f]' : 'bg-ink/5 text-ink-faint'
      )}
    >
      {on ? onIcon : offIcon}
      {label}
    </span>
  )
}

export function RecorderPanel(): React.JSX.Element {
  const s = useRecorder()
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const recording = s.phase === 'recording'
  const busy = s.phase === 'starting' || s.phase === 'stopping'

  useEffect(() => {
    if (!s.panelOpen || s.phase !== 'idle') return
    cv.subs
      .get()
      .then(setSub)
      .catch((e) => logError('subs.get failed', e))
  }, [s.panelOpen, s.phase])

  useEffect(() => {
    if (!recording) setConfirmDiscard(false)
  }, [recording])

  const overLimit = !!sub && sub.plan === 'free' && sub.sessionLimit != null && sub.sessionsUsed >= sub.sessionLimit
  const remaining = MAX_SESSION_SECONDS - s.elapsed
  const latest = s.events[s.events.length - 1]
  const nextShot = (() => {
    if (!recording || !s.hasScreen) return null
    const next = s.elapsed < 2 ? 2 : (Math.floor(s.elapsed / SCREENSHOT_INTERVAL_SECONDS) + 1) * SCREENSHOT_INTERVAL_SECONDS
    return next >= MAX_SESSION_SECONDS ? null : Math.ceil(next - s.elapsed)
  })()

  // Per-session privacy: decide BEFORE recording whether Claude may see it (remembered as your default).
  const [aiAccess, setAiAccess] = useState(true)
  const [aiLocked, setAiLocked] = useState<boolean | null>(null) // value used by the current recording
  useEffect(() => {
    cv.settings.get('privacy:aiDefault').then((v) => v === '0' && setAiAccess(false)).catch(() => undefined)
  }, [])
  useEffect(() => setNextAiAccess(aiAccess), [aiAccess])
  useEffect(() => {
    if (s.phase === 'recording' && aiLocked == null) setAiLocked(aiAccess)
    if (s.phase === 'idle') setAiLocked(null)
  }, [s.phase, aiAccess, aiLocked])
  const changeAi = (v: boolean): void => {
    setAiAccess(v)
    void cv.settings.set('privacy:aiDefault', v ? '1' : '0')
  }

  const onBigButton = (): void => {
    if (recording) void stopRecording('user')
    else if (s.phase === 'idle') void startRecording()
  }

  return (
    <Dialog open={s.panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent className={cn('max-w-[580px] overflow-hidden p-0', DIALOG_POP)}>
        <div className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-grad opacity-20 blur-3xl" />
        <div className="relative px-7 pt-6">
          <div className="flex items-center gap-2">
            <DialogTitle className="flex items-center gap-2">
              {recording ? (
                <>
                  <span className="relative flex size-3">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-70" />
                    <span className="relative inline-flex size-3 rounded-full bg-danger" />
                  </span>
                  Recording your memory
                </>
              ) : (
                <>Record a memory</>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1">
            {recording
              ? 'You can minimize this — recording keeps going in the top bar.'
              : 'Up to 3 minutes of screen + voice. Claude gets a quick look every 15 seconds.'}
          </DialogDescription>
        </div>

        {/* Free-plan soft limit: friendly, never blocking */}
        <AnimatePresence>
          {overLimit && s.phase === 'idle' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="relative mx-7 mt-4 overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-ink">
                <Sparkles className="size-4 shrink-0 text-orange" />
                <span className="flex-1">
                  You’ve used {sub!.sessionsUsed} of {sub!.sessionLimit} free sessions. Pro gives you unlimited — but you can still record anyway.
                </span>
                <a
                  href="#/app/subscriptions"
                  onClick={() => setPanelOpen(false)}
                  className="shrink-0 font-semibold text-violet underline-offset-4 hover:underline"
                >
                  Upgrade
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Big button + countdown ring */}
        <div className="relative flex flex-col items-center pt-6">
          <div className="relative" style={{ width: RING, height: RING }}>
            <CountdownRing elapsed={s.elapsed} recording={recording || s.phase === 'stopping'} />
            <div className="absolute inset-0 flex items-center justify-center">
              {recording &&
                [0, 0.8].map((d) => (
                  <motion.span
                    key={d}
                    className="absolute size-[172px] rounded-full bg-danger/25"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.28, opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, delay: d, ease: 'easeOut' }}
                  />
                ))}
              <motion.button
                onClick={onBigButton}
                disabled={busy}
                whileHover={busy ? undefined : { scale: 1.04 }}
                whileTap={busy ? undefined : { scale: 0.95 }}
                data-testid="cv-big-record"
                aria-label={recording ? 'Stop and save recording' : 'Start recording'}
                className={cn(
                  'relative flex size-[172px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-full font-display font-bold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-pink/30 disabled:cursor-wait',
                  recording
                    ? 'border-4 border-danger/15 bg-white text-danger shadow-[0_20px_50px_-15px_rgb(239_68_68/0.55)]'
                    : 'text-white shadow-[0_20px_50px_-12px_rgb(236_72_153/0.65)]'
                )}
                style={recording ? undefined : { background: 'radial-gradient(circle at 30% 25%, #FB7185 0%, #EF4444 45%, #DB2777 100%)' }}
              >
                {!recording && <span className="pointer-events-none absolute inset-2 rounded-full bg-gradient-to-b from-white/35 to-transparent" />}
                {s.phase === 'starting' ? (
                  <>
                    <Loader2 className="size-9 animate-spin" />
                    <span className="text-sm">Getting ready…</span>
                  </>
                ) : s.phase === 'stopping' ? (
                  <>
                    <Loader2 className="size-9 animate-spin text-violet" />
                    <span className="text-sm text-violet">Saving…</span>
                  </>
                ) : recording ? (
                  <>
                    <Square className="size-9 fill-danger" />
                    <span className="text-base">Stop & save</span>
                    <span className="text-xs font-semibold text-ink-soft tabular-nums">{formatClock(remaining)} left</span>
                  </>
                ) : (
                  <>
                    <Mic className="size-10" />
                    <span className="text-lg">{overLimit ? 'Record anyway' : 'Start'}</span>
                    <span className="text-xs font-semibold text-white/80">3:00 max</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>

          {/* Timer */}
          <div className="mt-4 flex items-center gap-3">
            <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wider', recording ? 'bg-danger/10 text-danger' : 'bg-ink/5 text-ink-faint')}>
              <motion.span
                className={cn('size-2 rounded-full', recording ? 'bg-danger' : 'bg-ink-faint')}
                animate={recording ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
              REC
            </span>
            <span className="font-display text-3xl font-bold tabular-nums text-ink">{formatClock(s.elapsed)}</span>
            <span className="font-display text-lg font-semibold text-ink-faint">/ {formatClock(MAX_SESSION_SECONDS)}</span>
          </div>
        </div>

        <div className="relative space-y-3 px-7 pb-6 pt-4">
          {/* Waveform */}
          <div className="relative rounded-2xl bg-violet/[0.05] px-4 py-2">
            <Waveform active={recording && s.hasMic} className="block h-14 w-full" />
            {recording && !s.hasMic && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-soft shadow-soft">
                  <MicOff className="size-3.5" /> No microphone — recording the screen only
                </span>
              </span>
            )}
          </div>

          {/* Capture chips */}
          <div className="flex flex-wrap items-center gap-2">
            {s.phase === 'idle' ? (
              <>
                <Chip on onIcon={<Mic />} offIcon={<MicOff />} label="Microphone" />
                <Chip on onIcon={<Monitor />} offIcon={<MonitorOff />} label="Screen" />
                <Chip on onIcon={<Eye />} offIcon={<Eye />} label="Screenshot every 15 s" />
              </>
            ) : (
              <>
                <Chip on={s.hasMic} onIcon={<Mic />} offIcon={<MicOff />} label={s.hasMic ? 'Mic on' : 'No mic'} />
                <Chip on={s.hasScreen} onIcon={<Monitor />} offIcon={<MonitorOff />} label={s.hasScreen ? 'Screen on' : 'No screen'} />
                <Chip on={s.hasSystemAudio} onIcon={<Volume2 />} offIcon={<VolumeX />} label={s.hasSystemAudio ? 'System audio' : 'No system audio'} />
              </>
            )}
          </div>

          {/* Privacy choice for this session */}
          {s.phase === 'idle' ? (
            <label className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors', aiAccess ? 'border-violet/25 bg-violet/5' : 'border-pink/30 bg-pink/5')}>
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl text-white', aiAccess ? 'bg-grad' : 'bg-ink')}>
                {aiAccess ? <Bot className="size-4" /> : <EyeOff className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">{aiAccess ? 'Let Claude see this session' : 'Private session: on-device only'}</span>
                <span className="block text-xs text-ink-soft">
                  {aiAccess ? 'Screenshots + transcript go to Claude for descriptions, summary and answers.' : 'Nothing is sent to Claude. Descriptions and summary are made on this Mac.'}
                </span>
              </span>
              <Switch checked={aiAccess} onCheckedChange={changeAi} aria-label="Let Claude see this session" data-testid="rec-ai-access" />
            </label>
          ) : (
            aiLocked === false && (
              <div className="flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-xs font-bold text-white">
                <EyeOff className="size-4" /> Private session: nothing leaves this device
              </div>
            )
          )}

          {/* What Claude sees */}
          <div className="glass relative overflow-hidden rounded-2xl px-4 py-3">
            <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              <span>👀 What Claude sees</span>
              <span className="flex items-center gap-1.5 normal-case tracking-normal text-ink-faint">
                {s.pendingShots > 0 && (
                  <>
                    <Loader2 className="size-3 animate-spin" /> looking…
                  </>
                )}
                {s.pendingShots === 0 && nextShot != null && <>next look in {nextShot}s</>}
                {s.events.length > 0 && <span className="rounded-full bg-violet/10 px-1.5 py-0.5 font-semibold text-violet">{s.events.length}</span>}
              </span>
            </div>
            <div className="relative h-10 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={latest?.id ?? latest?.t ?? `none-${s.phase}`}
                  initial={{ y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -18, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="line-clamp-2 text-sm text-ink"
                >
                  {latest ? (
                    <>
                      <span className="mr-1.5 rounded-md bg-cyan/12 px-1.5 py-0.5 text-[11px] font-bold text-[#0e7490] tabular-nums">{formatClock(latest.t)}</span>
                      {latest.description}
                    </>
                  ) : recording ? (
                    s.hasScreen ? (
                      <span className="text-ink-soft">Taking the first snapshot in a moment…</span>
                    ) : (
                      <span className="text-ink-soft">Screen isn’t being captured, so Claude can’t see anything this time.</span>
                    )
                  ) : (
                    <span className="text-ink-soft">One-line notes like “Searching flights to Tokyo” — so you can later ask “what was I looking at?”</span>
                  )}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            {recording ? (
              <>
                <Button
                  variant={confirmDiscard ? 'danger' : 'ghost'}
                  size="sm"
                  onClick={() => (confirmDiscard ? void discardRecording() : setConfirmDiscard(true))}
                  className={confirmDiscard ? '' : 'text-danger hover:bg-danger/8 hover:text-danger'}
                >
                  <Trash2 /> {confirmDiscard ? 'Really discard?' : 'Discard'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPanelOpen(false)}>
                    <Minimize2 /> Minimize
                  </Button>
                  <Button variant="gradient" size="sm" onClick={() => void stopRecording('user')}>
                    <Square className="fill-white" /> Stop & save
                  </Button>
                </div>
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                <Lock className="size-3.5 text-violet" /> {(aiLocked ?? aiAccess) ? 'Recordings stay on this device. Only screenshots + text are sent to Claude.' : 'Private session: nothing is sent to Claude. Everything stays on this device.'}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
