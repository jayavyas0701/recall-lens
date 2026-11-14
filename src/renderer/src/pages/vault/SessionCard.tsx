// OWNER: subagent A. One session in the vault grid.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Clock, FolderOpen, Loader2, Lock, Mic, Monitor, Play, ShieldCheck, Sparkles } from 'lucide-react'
import { AccessBadges, AccessDialog } from '@/components/common/SessionAccess'
import type { SessionRow } from '@shared/types'
import { fadeUp } from '@/components/common/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cv } from '@/lib/api'
import { cn, formatClock, formatDate } from '@/lib/utils'

const PLACEHOLDERS = [
  'linear-gradient(135deg,#7C3AED 0%,#EC4899 100%)',
  'linear-gradient(135deg,#06B6D4 0%,#7C3AED 100%)',
  'linear-gradient(135deg,#EC4899 0%,#F59E0B 100%)',
  'linear-gradient(135deg,#06B6D4 0%,#84CC16 100%)'
]

const STATUS: Partial<Record<SessionRow['status'], { label: string; variant: 'cyan' | 'orange' | 'danger' | 'default' }>> = {
  saved: { label: 'Saved', variant: 'default' },
  transcribing: { label: 'Transcribing…', variant: 'cyan' },
  summarizing: { label: 'Summarizing…', variant: 'orange' },
  error: { label: 'Needs attention', variant: 'danger' }
}

/** Tiny hover tooltip (no extra deps). */
export function Hint({ text, children }: { text: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="group/hint relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[200px] -translate-x-1/2 translate-y-1 rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-soft transition-all duration-150 group-hover/hint:translate-y-0 group-hover/hint:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function SessionCard({ s, onPlay, onOpenSummary }: { s: SessionRow; onPlay: () => void; onOpenSummary: () => void }): React.JSX.Element {
  const [imgOk, setImgOk] = useState(true)
  const [accessOpen, setAccessOpen] = useState(false)
  const locked = s.isLockedNow
  const play = (): void => (locked ? setAccessOpen(true) : onPlay())
  const media = s.screenPath ?? s.audioPath
  const status = STATUS[s.status]
  const working = s.status === 'transcribing' || s.status === 'summarizing'

  return (
    <motion.div variants={fadeUp} layout whileHover={{ y: -5 }} className="glass group flex flex-col overflow-hidden rounded-2xl">
      <button onClick={play} className="relative aspect-[16/9] w-full cursor-pointer overflow-hidden" aria-label={locked ? `Unlock ${s.title}` : `Play ${s.title}`}>
        {locked ? (
          <div className="relative flex size-full flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#1E1B3A,#4C1D95)] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(236,72,153,0.35),transparent_55%)]" />
            <Lock className="relative size-9" />
            <span className="relative text-xs font-bold uppercase tracking-wider">Locked · click to unlock</span>
          </div>
        ) : s.thumbnailPath && imgOk ? (
          <img
            src={cv.storage.mediaUrl(s.thumbnailPath)}
            alt=""
            onError={() => setImgOk(false)}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="relative size-full" style={{ background: PLACEHOLDERS[s.id % PLACEHOLDERS.length] }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.35),transparent_50%)]" />
            <div className="absolute inset-0 flex items-center justify-center text-white/90">
              {s.screenPath ? <Monitor className="size-10" /> : <Mic className="size-10" />}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent" />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-violet shadow-glow-violet backdrop-blur">
            <Play className="ml-0.5 size-6 fill-violet" />
          </span>
        </span>
        <div className="absolute right-3 top-3 flex gap-1.5">
          {s.isDemo && <Badge variant="gradient">Demo</Badge>}
          {status && (
            <Badge variant={status.variant} className="bg-white/90 backdrop-blur">
              {working && <Loader2 className="size-3 animate-spin" />}
              {status.label}
            </Badge>
          )}
        </div>
        <span className="absolute bottom-2.5 right-3 flex items-center gap-1 rounded-full bg-ink/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur tabular-nums">
          <Clock className="size-3" /> {formatClock(s.durationS)}
        </span>
      </button>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-display text-base font-bold text-ink" title={s.title}>
          {s.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
          {formatDate(s.startedAt)}
          {s.audioPath && <Mic className="size-3 text-pink" />}
          {s.screenPath && <Monitor className="size-3 text-cyan" />}
        </p>
        <AccessBadges access={s.access} className="mt-1.5" />
        <p className={cn('mt-2 line-clamp-2 min-h-[2.5rem] text-sm', s.snippet ? 'text-ink-soft' : 'italic text-ink-faint')}>
          {locked ? 'Private session: enter your password to see the transcript.' : s.snippet ? `“${s.snippet}”` : working ? 'Transcribing your words…' : 'No transcript yet.'}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={play}>
            {locked ? <Lock /> : <Play className="fill-violet" />} {locked ? 'Unlock' : 'Play'}
          </Button>
          <Hint text="Who can access this session">
            <Button variant="outline" size="sm" aria-label="Access settings" onClick={() => setAccessOpen(true)} data-testid={`access-btn-${s.id}`}>
              <ShieldCheck />
            </Button>
          </Hint>
          {s.isDemo || !media || locked ? (
            <Hint text={locked ? 'Unlock to show the file' : s.isDemo ? 'Demo sessions have no files on disk' : 'Files were cleaned up'}>
              <Button variant="outline" size="sm" disabled aria-label="Show in folder">
                <FolderOpen />
              </Button>
            </Hint>
          ) : (
            <Hint text="Show in folder">
              <Button variant="outline" size="sm" aria-label="Show in folder" onClick={() => {
                  void cv.storage.showItem(media)
                  toast.success('Showing it in your file manager 📂')
                }}>
                <FolderOpen />
              </Button>
            </Hint>
          )}
          <Button variant="gradient" size="sm" className="ml-auto" onClick={onOpenSummary}>
            <Sparkles /> Summary
          </Button>
        </div>
      </div>
      <AccessDialog session={s} open={accessOpen} onOpenChange={setAccessOpen} />
    </motion.div>
  )
}
