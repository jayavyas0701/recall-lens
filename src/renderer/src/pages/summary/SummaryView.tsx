// OWNER: subagent B. Summary cards: TL;DR hero, key points, action items, topics and the activity timeline.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ListChecks, Lightbulb, Mic, Monitor, Sparkles, Tags, Waypoints } from 'lucide-react'
import type { SessionDetail, SessionSummary, TimelineItem } from '@shared/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { fadeUp, stagger } from '@/components/common/Page'
import { cv } from '@/lib/api'
import { sparkle } from '@/lib/confetti'
import { cn, formatClock, logError } from '@/lib/utils'

const TOPIC_STYLES = [
  'bg-violet/10 text-violet border-violet/20',
  'bg-pink/10 text-pink border-pink/20',
  'bg-orange/15 text-[#b45309] border-orange/25',
  'bg-cyan/12 text-[#0e7490] border-cyan/25',
  'bg-lime/15 text-[#4d7c0f] border-lime/25'
]

function SectionTitle({ icon, title, extra, gradient = 'bg-grad' }: { icon: React.ReactNode; title: string; extra?: React.ReactNode; gradient?: string }): React.JSX.Element {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className={cn('flex size-8 items-center justify-center rounded-xl text-white shadow-soft [&_svg]:size-4', gradient)}>{icon}</span>
      <h3 className="flex-1 font-display text-base font-semibold text-ink">{title}</h3>
      {extra}
    </div>
  )
}

// ---------- TL;DR ----------
function TldrCard({ summary, detail }: { summary: SessionSummary; detail: SessionDetail }): React.JSX.Element {
  const model = summary.model === 'mock' || summary.model === 'demo' ? 'Demo AI' : summary.model.replace('claude-', 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2')
  return (
    <motion.div variants={fadeUp} className="relative rounded-3xl bg-grad grad-animate p-[2px] shadow-glow-violet">
      <div className="relative overflow-hidden rounded-[calc(1.5rem-2px)] bg-white/95 p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-grad opacity-15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-grad-cool opacity-10 blur-3xl" />
        <div className="relative mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-grad px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-glow-pink">
            <Sparkles className="size-3.5" /> TL;DR
          </span>
          <span className="text-xs font-medium text-ink-faint">
            by {model} · {detail.segments.length} lines · {detail.events.length} screen moments
          </span>
        </div>
        <p className="selectable relative text-[17px] font-medium leading-relaxed text-ink">{summary.tldr}</p>
      </div>
    </motion.div>
  )
}

// ---------- Key points ----------
function KeyPoints({ points }: { points: string[] }): React.JSX.Element | null {
  if (!points.length) return null
  return (
    <motion.div variants={fadeUp} className="glass rounded-2xl p-5">
      <SectionTitle icon={<Lightbulb />} title="Key points" gradient="bg-grad-warm" />
      <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-2.5">
        {points.map((p, i) => (
          <motion.li key={i} variants={fadeUp} className="selectable flex gap-3 text-sm leading-relaxed text-ink">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet/10 font-display text-[11px] font-bold text-violet">{i + 1}</span>
            <span>{p}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  )
}

// ---------- Action items ----------
function ActionItems({ sessionId, items }: { sessionId: number; items: SessionSummary['actionItems'] }): React.JSX.Element {
  const key = `actions:${sessionId}`
  const [done, setDone] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    setDone({})
    cv.settings
      .get(key)
      .then((v) => {
        if (alive && v) setDone(JSON.parse(v) as Record<string, boolean>)
      })
      .catch((e) => logError('Loading action items failed', e))
    return () => {
      alive = false
    }
  }, [key])

  const toggle = (text: string, checked: boolean, e: React.MouseEvent): void => {
    const next = { ...done, [text]: checked }
    setDone(next)
    void cv.settings.set(key, JSON.stringify(next)).catch((err) => logError('Saving action items failed', err))
    if (checked) sparkle(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
  }

  const count = items.filter((a) => done[a.text] ?? a.done).length
  return (
    <motion.div variants={fadeUp} className="glass rounded-2xl p-5">
      <SectionTitle
        icon={<ListChecks />}
        title="Action items"
        gradient="bg-grad-fresh"
        extra={items.length > 0 && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-xs font-bold text-[#4d7c0f]">{count}/{items.length}</span>}
      />
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">No to-dos mentioned in this session. Enjoy the free time ✨</p>
      ) : (
        <ul className="space-y-1">
          {items.map((a, i) => {
            const checked = done[a.text] ?? a.done
            return (
              <li key={i}>
                <div
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={-1}
                  className="group flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-violet/5"
                  onClick={(e) => toggle(a.text, !checked, e)}
                >
                  {/* preventDefault keeps Radix from toggling itself; the row's onClick does the work. */}
                  <Checkbox checked={checked} onClick={(e) => e.preventDefault()} className="mt-0.5" />
                  <span className={cn('selectable text-sm leading-snug transition-all', checked ? 'text-ink-faint line-through' : 'text-ink')}>{a.text}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <AnimatePresence>
        {items.length > 0 && count === items.length && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#4d7c0f]">
            <CheckCircle2 className="size-3.5" /> All done — nice work!
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------- Topics ----------
function Topics({ topics }: { topics: string[] }): React.JSX.Element {
  return (
    <motion.div variants={fadeUp} className="glass rounded-2xl p-5">
      <SectionTitle icon={<Tags />} title="Topics" gradient="bg-grad-cool" />
      {topics.length === 0 ? (
        <p className="text-sm text-ink-soft">No clear topics in this one.</p>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-2">
          {topics.map((t, i) => (
            <motion.span
              key={t}
              variants={fadeUp}
              whileHover={{ y: -2, rotate: i % 2 ? 1.5 : -1.5 }}
              className={cn('cursor-default rounded-full border px-3 py-1 text-sm font-semibold', TOPIC_STYLES[i % TOPIC_STYLES.length])}
            >
              #{t}
            </motion.span>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}

// ---------- Timeline ----------
type Mode = 'highlights' | 'everything'

function rawTimeline(detail: SessionDetail): TimelineItem[] {
  return [
    ...detail.segments.map((s) => ({ t: s.tStart, kind: 'speech' as const, text: s.text })),
    ...detail.events.map((e) => ({ t: e.t, kind: 'screen' as const, text: e.description }))
  ].sort((a, b) => a.t - b.t || (a.kind === 'screen' ? -1 : 1))
}

/** "google.com" or the app name for a screen moment, from the on-device screen text (null for older/demo sessions). */
function screenSource(detail: SessionDetail, t: number): string | null {
  let best: SessionDetail['events'][number] | null = null
  for (const e of detail.events) if (Math.abs(e.t - t) <= 5 && (!best || Math.abs(e.t - t) < Math.abs(best.t - t))) best = e
  const st = best?.screenText
  if (!st) return null
  const url = /^URL:\s*(\S+)/m.exec(st)?.[1]
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* fall through */
    }
  }
  return /^App:\s*(.+)$/m.exec(st)?.[1]?.trim() ?? null
}

function Timeline({ detail, summary }: { detail: SessionDetail; summary: SessionSummary | null }): React.JSX.Element {
  const hasHighlights = !!summary?.timeline.length
  const [mode, setMode] = useState<Mode>(hasHighlights ? 'highlights' : 'everything')
  useEffect(() => setMode(hasHighlights ? 'highlights' : 'everything'), [hasHighlights, detail.id])
  const items = useMemo(() => (mode === 'highlights' && summary ? summary.timeline : rawTimeline(detail)), [mode, summary, detail])

  return (
    <motion.div variants={fadeUp} className="glass rounded-2xl p-5">
      <SectionTitle
        icon={<Waypoints />}
        title="Activity timeline"
        extra={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-3 text-xs text-ink-soft xl:flex">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-grad-warm" /> Speech
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-grad-cool" /> Screen
              </span>
            </span>
            {hasHighlights && (
              <div className="flex rounded-lg bg-violet/8 p-0.5 text-xs font-semibold">
                {(['highlights', 'everything'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn('relative rounded-md px-2.5 py-1 capitalize transition-colors cursor-pointer', mode === m ? 'text-white' : 'text-ink-soft hover:text-violet')}
                  >
                    {mode === m && <motion.span layoutId="tl-mode" className="absolute inset-0 rounded-md bg-grad" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                    <span className="relative">{m}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing on the timeline yet.</p>
      ) : (
        <motion.ol key={mode} variants={stagger} initial="hidden" animate="show" className="relative ml-1">
          <span className="absolute bottom-3 left-[15px] top-3 w-0.5 rounded-full bg-gradient-to-b from-pink/40 via-violet/30 to-cyan/40" />
          {items.map((it, i) => (
            <motion.li key={`${it.t}-${i}`} variants={fadeUp} className="group relative flex gap-3 py-1.5">
              <span
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-white transition-transform group-hover:scale-110',
                  it.kind === 'speech' ? 'bg-grad-warm shadow-glow-pink' : 'bg-grad-cool shadow-glow-violet'
                )}
              >
                {it.kind === 'speech' ? <Mic className="size-3.5" /> : <Monitor className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1 rounded-xl px-3 py-1.5 transition-colors group-hover:bg-white/70">
                <div className="flex items-center gap-2">
                  <span className={cn('font-display text-xs font-bold tabular-nums', it.kind === 'speech' ? 'text-pink' : 'text-[#0e7490]')}>{formatClock(it.t)}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{it.kind === 'speech' ? 'You said' : 'On screen'}</span>
                  {it.kind === 'screen' && screenSource(detail, it.t) && (
                    <span className="truncate rounded-full bg-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-[#0e7490]">{screenSource(detail, it.t)}</span>
                  )}
                </div>
                <p className="selectable text-sm leading-snug text-ink">{it.text}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </motion.div>
  )
}

// ---------- Skeleton ----------
const LOADING_LINES = [
  'Rewinding your memory…',
  'Connecting the dots…',
  'Highlighting the good bits…',
  'Untangling your thoughts…',
  'Asking Claude nicely…',
  'Polishing the timeline…',
  'Finding your to-dos…'
]

export function SummarySkeleton({ message }: { message?: string }): React.JSX.Element {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LOADING_LINES.length), 1600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="space-y-4">
      <div className="relative rounded-3xl bg-grad grad-animate p-[2px] opacity-90">
        <div className="space-y-3 rounded-[calc(1.5rem-2px)] bg-white/95 p-6">
          <div className="flex items-center gap-3">
            <motion.span
              className="flex size-8 items-center justify-center rounded-full bg-grad text-white"
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <Sparkles className="size-4" />
            </motion.span>
            <AnimatePresence mode="wait">
              <motion.span key={message ?? i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="font-display text-sm font-semibold text-violet">
                {message ?? LOADING_LINES[i]}
              </motion.span>
            </AnimatePresence>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <div className="glass space-y-3 rounded-2xl p-5">
        <Skeleton className="h-5 w-32" />
        {[0, 1, 2, 3].map((k) => (
          <Skeleton key={k} className="h-3.5" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="glass space-y-3 rounded-2xl p-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="glass space-y-3 rounded-2xl p-5">
          <Skeleton className="h-5 w-20" />
          <div className="flex flex-wrap gap-2">
            {[60, 80, 50, 72, 64].map((w) => (
              <div key={w} style={{ width: w }}>
                <Skeleton className="h-7 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SummaryView({ detail, summary }: { detail: SessionDetail; summary: SessionSummary }): React.JSX.Element {
  return (
    <motion.div key={detail.id + summary.generatedAt} variants={stagger} initial="hidden" animate="show" className="space-y-4">
      <TldrCard summary={summary} detail={detail} />
      <KeyPoints points={summary.keyPoints} />
      <div className="grid grid-cols-2 gap-4">
        <ActionItems sessionId={detail.id} items={summary.actionItems} />
        <Topics topics={summary.topics} />
      </div>
      <Timeline detail={detail} summary={summary} />
    </motion.div>
  )
}
