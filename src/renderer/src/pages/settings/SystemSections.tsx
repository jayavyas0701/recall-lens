// OWNER: subagent D. Storage folder, permissions and appearance sections.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ExternalLink, FolderOpen, FolderSync, HardDrive, Mic, MonitorUp, Palette, RefreshCw, ShieldCheck, Volume2 } from 'lucide-react'
import type { PermissionStatus, PermState, StoragePaths, StorageStats, ThemeMode } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { emit, useAppEvent } from '@/lib/events'
import { loadTheme, saveTheme } from '@/lib/theme'
import { cn, formatBytes, logError } from '@/lib/utils'
import { KV, Section } from './Section'

/* ---------------- Storage ---------------- */
export function StorageSection(): React.JSX.Element {
  const [paths, setPaths] = useState<StoragePaths | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([cv.storage.paths(), cv.storage.stats()])
      setPaths(p)
      setStats(s)
    } catch (e) {
      logError('storage load failed', e)
    }
  }, [])
  useEffect(() => void load(), [load])
  useAppEvent('files:changed', load as () => void)
  useAppEvent('sessions:changed', load as () => void)

  const change = async (): Promise<void> => {
    try {
      const p = await cv.storage.chooseRoot()
      if (!p) return
      setPaths(p)
      toast.success('Storage folder updated', { description: p.root })
      emit('files:changed')
      void load()
    } catch (e) {
      logError('chooseRoot failed', e)
      toast.error('Couldn’t change the folder.')
    }
  }
  const open = async (): Promise<void> => {
    const r = await cv.storage.openFolder('root').catch((e) => ({ ok: false, error: String(e) }))
    if (r.ok) toast.success('Opened your vault folder 📂')
    else toast.error('Couldn’t open the folder', { description: r.error })
  }

  const used = stats ? stats.audioBytes + stats.screenBytes + stats.otherBytes : 0
  const segs = stats
    ? [
        { label: 'Audio', bytes: stats.audioBytes, color: '#7C3AED' },
        { label: 'Screen', bytes: stats.screenBytes, color: '#EC4899' },
        { label: 'Other', bytes: stats.otherBytes, color: '#06B6D4' }
      ]
    : []

  return (
    <Section
      icon={<HardDrive />}
      title="Storage folder"
      description="Recordings are saved here — on this device only."
      gradient="var(--cv-grad-cool)"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void open()}>
            <FolderOpen /> Open
          </Button>
          <Button size="sm" variant="soft" onClick={() => void change()}>
            <FolderSync /> Change folder
          </Button>
        </div>
      }
    >
      {!paths ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <div className="selectable truncate rounded-xl border border-line bg-white/70 px-3 py-2 font-mono text-xs text-ink" title={paths.root}>
            {paths.root}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['audio', 'screen', 'screenshots', 'transcripts'] as const).map((k) => (
              <span key={k} className="rounded-full bg-violet/8 px-2 py-0.5 font-mono text-[10px] text-ink-soft" title={paths[k]}>
                /{paths[k].split(/[\\/]/).pop()}
              </span>
            ))}
          </div>
          {stats && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-ink">{formatBytes(used)} used by Context Vault</span>
                {stats.totalBytes > 0 && <span className="text-ink-faint">{formatBytes(stats.freeBytes)} free on disk</span>}
              </div>
              <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-violet/10">
                {used > 0 &&
                  segs.map((s) => (
                    <motion.div
                      key={s.label}
                      initial={{ width: 0 }}
                      animate={{ width: `${(s.bytes / used) * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      style={{ background: s.color }}
                    />
                  ))}
              </div>
              <div className="mt-2 flex gap-4 text-[11px] text-ink-soft">
                {segs.map((s) => (
                  <span key={s.label} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {s.label} · {formatBytes(s.bytes)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

/* ---------------- Permissions ---------------- */
const PERM_UI: Record<string, { label: string; variant: 'lime' | 'danger' | 'orange' | 'outline' }> = {
  granted: { label: 'Granted', variant: 'lime' },
  supported: { label: 'Supported', variant: 'lime' },
  denied: { label: 'Denied', variant: 'danger' },
  restricted: { label: 'Restricted', variant: 'danger' },
  'not-determined': { label: 'Not asked yet', variant: 'orange' },
  experimental: { label: 'Experimental', variant: 'orange' },
  unknown: { label: 'Unknown', variant: 'outline' },
  unavailable: { label: 'Unavailable', variant: 'outline' }
}

export function PermissionsSection(): React.JSX.Element {
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const [spin, setSpin] = useState(0)

  const check = useCallback(async (notify = false) => {
    try {
      const s = await cv.perms.status()
      setStatus(s)
      if (notify) toast.success('Permissions re-checked', { description: summary(s) })
    } catch (e) {
      logError('perms.status failed', e)
      if (notify) toast.error('Couldn’t read permission status.')
    }
  }, [])
  useEffect(() => void check(), [check])

  const rows: { key: string; icon: React.ReactNode; label: string; hint: string; state: PermState | PermissionStatus['systemAudio'] | undefined; open?: () => Promise<void> }[] = [
    { key: 'mic', icon: <Mic />, label: 'Microphone', hint: 'Captures your voice', state: status?.microphone, open: () => cv.perms.openMicSettings() },
    { key: 'screen', icon: <MonitorUp />, label: 'Screen recording', hint: 'Captures what you see', state: status?.screen, open: () => cv.perms.openScreenSettings() },
    { key: 'sys', icon: <Volume2 />, label: 'System audio', hint: 'Captures call & video audio', state: status?.systemAudio }
  ]
  const canOpen = status?.platform === 'darwin' || status?.platform === 'win32'

  return (
    <Section
      icon={<ShieldCheck />}
      title="Permissions"
      description="Live status from your operating system."
      gradient="var(--cv-grad-fresh)"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSpin((s) => s + 1)
            void check(true)
          }}
        >
          <motion.span key={spin} animate={{ rotate: spin ? 360 : 0 }} transition={{ duration: 0.6 }} className="flex">
            <RefreshCw />
          </motion.span>
          Re-check
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const ui = r.state ? (PERM_UI[r.state] ?? PERM_UI.unknown) : null
          return (
            <div key={r.key} className="flex items-center gap-3 rounded-xl border border-line/80 bg-white/60 px-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-violet/10 text-violet [&_svg]:size-4">{r.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{r.label}</div>
                <div className="text-[11px] text-ink-faint">{r.hint}</div>
              </div>
              {ui ? (
                <motion.span key={`${r.key}-${r.state}-${spin}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                  <Badge variant={ui.variant}>
                    <span className={cn('size-1.5 rounded-full bg-current', ui.variant === 'lime' && 'animate-pulse')} />
                    {ui.label}
                  </Badge>
                </motion.span>
              ) : (
                <Skeleton className="h-5 w-16 rounded-full" />
              )}
              {r.open && canOpen && (
                <Button size="sm" variant="ghost" onClick={() => void r.open!().then(() => toast.message('Opening System Settings…'))} title="Open System Settings">
                  <ExternalLink />
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {status && !canOpen && <p className="mt-2 text-[11px] text-ink-faint">On {status.platform}, access is handled by the app itself — no system settings needed.</p>}
    </Section>
  )
}

function summary(s: PermissionStatus): string {
  return `Mic: ${PERM_UI[s.microphone]?.label ?? s.microphone} · Screen: ${PERM_UI[s.screen]?.label ?? s.screen} · System audio: ${PERM_UI[s.systemAudio]?.label ?? s.systemAudio}`
}

/* ---------------- Appearance ---------------- */
export function AppearanceSection(): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode | null>(null)
  useEffect(() => {
    loadTheme()
      .then(setMode)
      .catch(() => setMode('vibrant'))
  }, [])

  const pick = async (m: ThemeMode): Promise<void> => {
    if (m === mode) return
    setMode(m)
    try {
      await saveTheme(m)
      toast.success(m === 'vibrant' ? 'Vibrant mode on 🌈' : 'Light mode on ☀️')
    } catch (e) {
      logError('saveTheme failed', e)
    }
  }

  return (
    <Section icon={<Palette />} title="Appearance" description="Pick the vibe for your vault." gradient="var(--cv-grad-warm)">
      <div className="grid grid-cols-2 gap-3">
        {(['light', 'vibrant'] as const).map((m) => {
          const on = mode === m
          return (
            <motion.button
              key={m}
              type="button"
              data-theme-option={m}
              onClick={() => void pick(m)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'relative rounded-2xl border-2 p-2.5 text-left transition-colors cursor-pointer',
                on ? 'border-violet bg-violet/5 shadow-glow-violet' : 'border-line bg-white/60 hover:border-violet/30'
              )}
            >
              <Swatch mode={m} />
              <div className="mt-2 flex items-center justify-between px-0.5">
                <span className="text-sm font-bold text-ink">{m === 'light' ? 'Light mode' : 'Vibrant mode'}</span>
                <span className={cn('flex size-4 items-center justify-center rounded-full border-2', on ? 'border-violet' : 'border-line')}>
                  <span className={cn('size-2 rounded-full bg-violet transition-transform duration-300', on ? 'scale-100' : 'scale-0')} />
                </span>
              </div>
            </motion.button>
          )
        })}
      </div>
    </Section>
  )
}

function Swatch({ mode }: { mode: ThemeMode }): React.JSX.Element {
  const vibrant = mode === 'vibrant'
  return (
    <div className="relative h-[72px] overflow-hidden rounded-xl border border-line bg-[#FAFAFF]">
      {vibrant && (
        <>
          <div className="absolute -left-4 -top-6 size-20 rounded-full bg-violet/40 blur-xl" />
          <div className="absolute -right-4 top-2 size-16 rounded-full bg-pink/40 blur-xl" />
          <div className="absolute bottom-[-20px] left-10 size-16 rounded-full bg-orange/40 blur-xl" />
        </>
      )}
      <div className="absolute inset-y-0 left-0 w-6 border-r border-line bg-white/80" />
      <div className="absolute left-8 top-2.5 h-2 w-14 rounded-full bg-grad" />
      <div className={cn('absolute left-8 top-7 h-8 w-[38%] rounded-lg border border-white', vibrant ? 'bg-white/60' : 'bg-white shadow-sm')} />
      <div className={cn('absolute right-2.5 top-7 h-8 w-[30%] rounded-lg border border-white', vibrant ? 'bg-white/60' : 'bg-white shadow-sm')} />
    </div>
  )
}
