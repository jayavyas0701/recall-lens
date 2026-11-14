// OWNER: orchestrator. Permissions onboarding stepper.
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, FolderOpen, HardDrive, Mic, Monitor, Settings2, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PermissionStatus, StoragePaths } from '@shared/types'
import { Aurora } from '@/components/common/Aurora'
import { VaultMark, Wordmark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cv } from '@/lib/api'
import { celebrate } from '@/lib/confetti'
import { cn, logError } from '@/lib/utils'

type Live = 'granted' | 'pending' | 'unavailable' | 'denied'

function StatusBadge({ s }: { s: Live }): React.JSX.Element {
  const map = {
    granted: { t: '✅ Granted', c: 'bg-lime/15 text-[#4d7c0f] border-lime/30' },
    pending: { t: '⏳ Pending', c: 'bg-orange/12 text-[#b45309] border-orange/30' },
    denied: { t: '⛔ Denied', c: 'bg-danger/10 text-danger border-danger/25' },
    unavailable: { t: '⚠️ Not available', c: 'bg-ink/5 text-ink-soft border-ink/10' }
  }[s]
  return (
    <motion.span key={s} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('rounded-full border px-3 py-1 text-xs font-bold', map.c)}>
      {map.t}
    </motion.span>
  )
}

function Illustration({ icon: Icon, gradient }: { icon: typeof Mic; gradient: string }): React.JSX.Element {
  return (
    <div className="relative mx-auto flex size-44 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: 'rgba(124,58,237,0.25)' }}
          animate={{ scale: [0.6, 1.25], opacity: [0.8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="relative flex size-28 items-center justify-center rounded-[2rem] text-white shadow-glow-violet"
        style={{ background: gradient }}
        animate={{ y: [0, -6, 0], rotate: [0, -3, 3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon className="size-12" strokeWidth={2.2} />
      </motion.div>
    </div>
  )
}

export function OnboardingPage(): React.JSX.Element {
  const { setUser, user } = useAuth()
  const [step, setStep] = useState(0)
  const [perm, setPerm] = useState<PermissionStatus | null>(null)
  const [mic, setMic] = useState<Live>('pending')
  const [screen, setScreen] = useState<Live>('pending')
  const [sysAudio, setSysAudio] = useState<Live>('pending')
  const [paths, setPaths] = useState<StoragePaths | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const p = await cv.perms.status()
    setPerm(p)
    if (p.microphone === 'granted') setMic('granted')
    else if (p.microphone === 'denied' || p.microphone === 'restricted') setMic('denied')
    if (p.platform === 'darwin') setScreen(p.screen === 'granted' ? 'granted' : p.screen === 'denied' ? 'denied' : 'pending')
    if (p.systemAudio === 'unavailable') setSysAudio('unavailable')
    setPaths(await cv.storage.paths())
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const grantMic = async (): Promise<void> => {
    setBusy(true)
    try {
      const s = await cv.perms.requestMicrophone()
      if (s === 'denied') return setMic('denied')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMic('granted')
      toast.success('Microphone ready 🎙')
    } catch (e) {
      logError('mic permission', e)
      setMic('denied')
      toast.error('Microphone access was blocked. You can enable it in System Settings.')
    } finally {
      setBusy(false)
    }
  }

  const grantScreen = async (): Promise<void> => {
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      stream.getTracks().forEach((t) => t.stop())
      setScreen('granted')
      toast.success('Screen recording ready 🖥')
    } catch (e) {
      logError('screen permission', e)
      setScreen('denied')
      if (perm?.platform === 'darwin') toast.message('macOS needs a quick toggle in System Settings → Privacy → Screen Recording.')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const tryAudio = async (): Promise<void> => {
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      const hasAudio = stream.getAudioTracks().length > 0
      stream.getTracks().forEach((t) => t.stop())
      setSysAudio(hasAudio ? 'granted' : 'unavailable')
      hasAudio ? toast.success('System audio captured 🔊') : toast.message('System audio isn’t available here — your mic will be used.')
    } catch (e) {
      logError('system audio', e)
      setSysAudio('unavailable')
      toast.message('System audio isn’t available here — your mic will be used.')
    } finally {
      setBusy(false)
    }
  }

  const changeFolder = async (): Promise<void> => {
    const p = await cv.storage.chooseRoot()
    if (p) {
      setPaths(p)
      toast.success('Storage folder updated 📁')
    }
  }

  const finish = async (): Promise<void> => {
    setDone(true)
    celebrate()
    const r = await cv.auth.completeOnboarding()
    setTimeout(() => r.data && setUser(r.data), 1800)
  }

  const steps = [
    {
      key: 'mic',
      title: 'Microphone',
      icon: Mic,
      gradient: 'var(--cv-grad-warm)',
      body: 'So Context Vault can capture what you say. Audio is saved as .webm in your vault and transcribed locally with Whisper.',
      status: mic,
      action: mic === 'granted' ? null : (
        <div className="flex gap-2">
          <Button variant="gradient" size="lg" onClick={grantMic} disabled={busy}>
            <Mic /> Grant access
          </Button>
          {mic === 'denied' && (
            <Button variant="outline" size="lg" onClick={() => void cv.perms.openMicSettings()}>
              <Settings2 /> Open Settings
            </Button>
          )}
        </div>
      )
    },
    {
      key: 'screen',
      title: 'Screen recording',
      icon: Monitor,
      gradient: 'var(--cv-grad-cool)',
      body: 'So Claude can remember what you saw. A screenshot every 15 seconds becomes a one-line description like “Searching flights to Tokyo”.',
      status: screen,
      action: screen === 'granted' ? null : (
        <div className="flex gap-2">
          <Button variant="gradient" size="lg" onClick={grantScreen} disabled={busy}>
            <Monitor /> Grant access
          </Button>
          {perm?.platform === 'darwin' && screen === 'denied' && (
            <Button variant="outline" size="lg" onClick={() => void cv.perms.openScreenSettings()}>
              <Settings2 /> Open System Settings
            </Button>
          )}
        </div>
      )
    },
    {
      key: 'audio',
      title: 'System audio',
      icon: Volume2,
      gradient: 'var(--cv-grad-fresh)',
      body:
        sysAudio === 'unavailable'
          ? 'Not available on this OS, mic will be used. You can continue — nothing is blocked.'
          : 'Optionally capture the sound coming from your screen (videos, calls). If your OS doesn’t support it, we’ll simply use the mic.',
      status: sysAudio,
      action:
        sysAudio === 'pending' ? (
          <Button variant="gradient" size="lg" onClick={tryAudio} disabled={busy}>
            <Volume2 /> Try system audio
          </Button>
        ) : null
    },
    {
      key: 'storage',
      title: 'Storage folder',
      icon: HardDrive,
      gradient: 'var(--cv-grad)',
      body: 'Everything lives on this device. Here’s where your vault keeps recordings and transcripts:',
      status: 'granted' as Live,
      action: (
        <div className="w-full">
          <div className="selectable rounded-2xl border border-line bg-white/80 p-4 text-left font-mono text-xs leading-6 text-ink-soft">
            <div className="font-bold text-ink">📁 {paths?.root}</div>
            <div className="pl-4">├─ recordings/audio</div>
            <div className="pl-4">├─ recordings/screen</div>
            <div className="pl-4">└─ transcripts</div>
          </div>
          <Button variant="outline" className="mt-3" onClick={changeFolder}>
            <FolderOpen /> Change folder
          </Button>
        </div>
      )
    }
  ]
  const s = steps[step]

  return (
    <div className="drag relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas">
      <div className="absolute inset-0 opacity-40">
        <Aurora intensity={0.6} />
      </div>
      <div className="absolute left-8 top-9 flex items-center gap-2.5">
        <VaultMark size={30} />
        <Wordmark />
      </div>

      <div className="no-drag relative w-[620px]">
        {/* Stepper */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((st, i) => (
            <div key={st.key} className="flex items-center gap-2">
              <motion.button
                onClick={() => setStep(i)}
                animate={{ scale: i === step ? 1.1 : 1 }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full text-sm font-bold transition-colors cursor-pointer',
                  st.status === 'granted' && i !== step
                    ? 'bg-grad text-white shadow-glow-violet'
                    : i === step
                      ? 'bg-white text-violet ring-2 ring-violet'
                      : i < step
                        ? 'bg-white text-ink-soft ring-1 ring-line'
                        : 'bg-white/70 text-ink-faint'
                )}
                title={st.status === 'granted' ? 'Granted' : i < step ? 'Skipped — you can grant this later in Settings' : undefined}
              >
                {st.status === 'granted' && i !== step ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </motion.button>
              {i < steps.length - 1 && (
                <div className="h-1 w-14 overflow-hidden rounded-full bg-white/70">
                  <motion.div className="h-full bg-grad" animate={{ width: i < step ? '100%' : '0%' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="glass relative flex min-h-[520px] flex-col justify-center overflow-hidden rounded-[28px] p-10 text-center">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6 }}
                  className="mx-auto flex size-28 items-center justify-center rounded-full bg-grad text-white shadow-glow-pink"
                >
                  <Check className="size-14" strokeWidth={3} />
                </motion.div>
                <h2 className="mt-6 font-display text-3xl font-bold text-ink">You’re all set{user ? `, ${user.name.split(' ')[0]}` : ''}!</h2>
                <p className="mt-2 text-ink-soft">Opening your vault…</p>
              </motion.div>
            ) : (
              <motion.div key={s.key} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }}>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-violet">
                  Step {step + 1} of {steps.length}
                </div>
                <Illustration icon={s.icon} gradient={s.gradient} />
                <div className="mt-4 flex items-center justify-center gap-3">
                  <h2 className="font-display text-3xl font-bold text-ink">{s.title}</h2>
                  <StatusBadge s={s.status} />
                </div>
                <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
                <div className="mt-6 flex justify-center">{s.action}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!done && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <span className="text-xs text-ink-faint">You can change any of these later in Settings.</span>
            {step < steps.length - 1 ? (
              <Button variant="default" onClick={() => setStep((v) => v + 1)}>
                {s.status === 'granted' ? 'Next' : 'Skip for now'} <ArrowRight />
              </Button>
            ) : (
              <Button variant="gradient" onClick={finish}>
                Enter my vault <ArrowRight />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
