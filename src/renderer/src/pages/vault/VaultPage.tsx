// OWNER: subagent A. Tab 1 — "My Vault": stats, folder tiles, session library.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowUpRight, Clock, Flame, Layers, Library, MessageCircleQuestion, Mic, Sparkles, Wand2 } from 'lucide-react'
import type { DashboardStats, SessionRow } from '@shared/types'
import { Page, PageHeader, fadeUp, stagger } from '@/components/common/Page'
import { StatCard } from '@/components/common/StatCard'
import { TiltCard } from '@/components/common/TiltCard'
import { EmptyState } from '@/components/common/EmptyState'
import { CountUp } from '@/components/common/CountUp'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { emit, useAppEvent } from '@/lib/events'
import { formatDuration, logError } from '@/lib/utils'
import { SessionCard } from './SessionCard'
import { PlayDialog } from './PlayDialog'

function Equalizer(): React.JSX.Element {
  return (
    <div className="flex h-14 items-end gap-1.5" aria-hidden>
      {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8].map((h, i) => (
        <motion.span
          key={i}
          className="w-2 rounded-full bg-white/85"
          animate={{ height: [`${h * 40}%`, `${h * 100}%`, `${h * 55}%`] }}
          transition={{ duration: 1 + i * 0.13, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function MiniScreen(): React.JSX.Element {
  return (
    <div className="w-28 rounded-xl border border-white/50 bg-white/20 p-1.5 shadow-lg backdrop-blur" aria-hidden>
      <div className="mb-1.5 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-white/80" />
        ))}
      </div>
      <div className="space-y-1">
        <motion.div className="h-1.5 rounded-full bg-white/80" animate={{ width: ['40%', '85%', '40%'] }} transition={{ duration: 3, repeat: Infinity }} />
        <div className="h-1.5 w-3/5 rounded-full bg-white/50" />
        <div className="grid grid-cols-3 gap-1 pt-0.5">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="h-5 rounded-md bg-white/45" animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FolderTile({
  emoji,
  title,
  count,
  durationS,
  gradient,
  art,
  onClick
}: {
  emoji: string
  title: string
  count: number
  durationS: number
  gradient: string
  art: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <motion.div variants={fadeUp}>
      <TiltCard onClick={onClick} max={8} className="rounded-3xl">
        <div className="relative h-[172px] overflow-hidden rounded-3xl p-6 text-white shadow-[0_24px_60px_-24px_rgb(124_58_237/0.6)]" style={{ background: gradient }}>
          {/* gloss */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent" />
          <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/20 blur-2xl" />
          <div className="relative flex h-full items-stretch justify-between gap-4" style={{ transform: 'translateZ(30px)' }}>
            <div className="flex flex-col">
              <span className="text-3xl drop-shadow">{emoji}</span>
              <h3 className="mt-2 font-display text-2xl font-bold">{title}</h3>
              <p className="mt-0.5 text-sm font-medium text-white/85">
                <span className="font-bold text-white">
                  <CountUp value={count} />
                </span>{' '}
                {count === 1 ? 'file' : 'files'} · {formatDuration(durationS)} total
              </p>
              <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                Open folder <ArrowUpRight className="size-3.5" />
              </span>
            </div>
            <div className="flex items-center">{art}</div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  )
}

export function VaultPage(): React.JSX.Element {
  const nav = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [playing, setPlaying] = useState<SessionRow | null>(null)
  const [loadingDemo, setLoadingDemo] = useState(false)

  const load = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([cv.sessions.stats(), cv.sessions.list()])
      setStats(st)
      setSessions(list)
    } catch (e) {
      logError('vault load failed', e)
      setSessions((s) => s ?? [])
      toast.error('Couldn’t load your vault', { description: 'Please try again in a moment.' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useAppEvent('sessions:changed', load)
  useAppEvent('files:changed', load)

  const openFolder = async (kind: 'audio' | 'screen'): Promise<void> => {
    const r = await cv.storage.openFolder(kind)
    if (r.ok) toast.success(kind === 'audio' ? 'Opened your audio recordings folder 🎙' : 'Opened your screen recordings folder 🖥')
    else toast.error('Couldn’t open the folder', { description: r.error })
  }

  const loadDemo = async (): Promise<void> => {
    setLoadingDemo(true)
    const r = await cv.demo.loadSession()
    setLoadingDemo(false)
    if (r.ok) {
      toast.success('Demo session loaded ✈️', { description: 'A 3-minute Tokyo trip-planning session is in your vault.' })
      emit('sessions:changed')
    } else toast.error('Couldn’t load the demo session', { description: r.error })
  }

  const openSummary = (id: number): void => void nav(`/app/summary?session=${id}`)
  const loading = !stats || !sessions

  return (
    <Page>
      <PageHeader
        title="My Vault"
        subtitle="Every memory you’ve captured — playable, searchable, and stored only on this device."
        icon={<Library />}
        actions={
          <Button variant="gradient" onClick={() => emit('recording:open')}>
            <Mic /> New recording
          </Button>
        }
      />

      {/* Dashboard widgets */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-4 gap-4">
          <StatCard label="Minutes captured" value={stats.minutesCaptured} decimals={stats.minutesCaptured % 1 ? 1 : 0} icon={<Clock />} />
          <StatCard label="Sessions" value={stats.sessions} icon={<Layers />} gradient="var(--cv-grad-cool)" />
          <StatCard label="Questions asked" value={stats.questionsAsked} icon={<MessageCircleQuestion />} gradient="var(--cv-grad-fresh)" />
          <StatCard label="Streak 🔥" value={stats.streakDays} suffix={stats.streakDays === 1 ? ' day' : ' days'} icon={<Flame />} gradient="var(--cv-grad-warm)" />
        </motion.div>
      )}

      {/* Folder tiles */}
      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-5">
          <Skeleton className="h-[172px] rounded-3xl" />
          <Skeleton className="h-[172px] rounded-3xl" />
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-5 grid grid-cols-2 gap-5">
          <FolderTile
            emoji="🎙"
            title="Audio Recordings"
            count={stats.audioCount}
            durationS={stats.audioDurationS}
            gradient="linear-gradient(135deg,#DB2777 0%,#F43F5E 45%,#F97316 100%)"
            art={<Equalizer />}
            onClick={() => void openFolder('audio')}
          />
          <FolderTile
            emoji="🖥"
            title="Screen Recordings"
            count={stats.screenCount}
            durationS={stats.screenDurationS}
            gradient="linear-gradient(135deg,#7C3AED 0%,#4F46E5 50%,#06B6D4 100%)"
            art={<MiniScreen />}
            onClick={() => void openFolder('screen')}
          />
        </motion.div>
      )}

      {/* Sessions */}
      <div className="mb-4 mt-8 flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Your sessions</h2>
          <p className="text-xs text-ink-soft">{sessions ? `${sessions.length} ${sessions.length === 1 ? 'memory' : 'memories'} · newest first` : 'Loading…'}</p>
        </div>
        {sessions && sessions.length > 0 && !sessions.some((s) => s.isDemo) && (
          <Button variant="ghost" size="sm" onClick={() => void loadDemo()} disabled={loadingDemo}>
            <Wand2 /> Add demo session
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass overflow-hidden rounded-2xl">
              <Skeleton className="aspect-[16/9] rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          emoji="🎙️"
          title="Your vault is empty — for now"
          description="Record up to 3 minutes of screen + voice. Context Vault transcribes it, summarizes it and lets you ask Claude about it later."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="gradient" size="lg" onClick={() => emit('recording:open')}>
                <Mic /> Record your first memory
              </Button>
              <Button variant="outline" size="lg" onClick={() => void loadDemo()} disabled={loadingDemo}>
                <Sparkles /> {loadingDemo ? 'Loading…' : 'Load demo session'}
              </Button>
            </div>
          }
        />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-3 gap-5">
          {sessions.map((s) => (
            <SessionCard key={s.id} s={s} onPlay={() => setPlaying(s)} onOpenSummary={() => openSummary(s.id)} />
          ))}
        </motion.div>
      )}

      <PlayDialog
        session={playing}
        onOpenChange={(o) => !o && setPlaying(null)}
        onOpenSummary={(id) => {
          setPlaying(null)
          openSummary(id)
        }}
      />
    </Page>
  )
}
