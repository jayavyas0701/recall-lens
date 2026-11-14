// OWNER: orchestrator
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Mic, Monitor, Search } from 'lucide-react'
import type { SearchHit } from '@shared/types'
import { RecordButton } from '@/features/recording/RecordButton'
import { useUser } from '@/lib/auth'
import { cv } from '@/lib/api'
import { formatClock, formatDate, greeting } from '@/lib/utils'

function highlight(text: string, q: string): React.JSX.Element {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0 || !q) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-orange/25 px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

function GlobalSearch(): React.JSX.Element {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setHits([])
      cv.sessions.search(q).then(setHits).catch(() => setHits([]))
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="no-drag relative w-[380px]">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search everything you said or saw…"
        className="h-10 w-full rounded-xl border border-line bg-white/80 pl-10 pr-14 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-violet/50 focus:outline-none focus:ring-4 focus:ring-violet/10"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-faint">⌘K</kbd>
      <AnimatePresence>
        {open && q.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute left-0 right-0 top-12 z-50 max-h-[420px] overflow-y-auto rounded-2xl border border-white bg-white/95 p-2 shadow-[0_20px_60px_-15px_rgb(124_58_237/0.35)] backdrop-blur-xl"
          >
            {hits.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ink-soft">No matches yet — try another word.</div>
            ) : (
              hits.map((h, i) => (
                <button
                  key={i}
                  onMouseDown={() => nav(`/app/summary?session=${h.sessionId}`)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-violet/6 cursor-pointer"
                >
                  <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-white ${h.kind === 'speech' ? 'bg-grad-warm' : 'bg-grad-cool'}`}>
                    {h.kind === 'speech' ? <Mic className="size-3.5" /> : <Monitor className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm text-ink">{highlight(h.text, q.trim())}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">
                      {h.sessionTitle} · {formatDate(h.startedAt)} · at {formatClock(h.t)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TopBar(): React.JSX.Element {
  const user = useUser()
  const nav = useNavigate()
  return (
    <header className="drag relative z-30 flex h-[76px] shrink-0 items-center gap-5 px-8">
      <div className="min-w-0 flex-1">
        <motion.h2 key={user.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="truncate text-xl font-bold text-ink">
          {greeting(user.name)}
        </motion.h2>
        <p className="text-xs text-ink-soft">Your memory, on demand.</p>
      </div>
      <GlobalSearch />
      <div className="no-drag">
        <RecordButton />
      </div>
      {user.plan === 'free' ? (
        <button
          onClick={() => nav('/app/subscriptions')}
          className="no-drag shimmer relative flex h-10 items-center gap-1.5 overflow-hidden rounded-full bg-grad grad-animate px-4 text-sm font-bold text-white shadow-glow-pink transition-transform hover:-translate-y-0.5 cursor-pointer"
        >
          <motion.span className="absolute inset-0 rounded-full" animate={{ boxShadow: ['0 0 0 0 rgba(236,72,153,0.55)', '0 0 0 10px rgba(236,72,153,0)'] }} transition={{ duration: 1.8, repeat: Infinity }} />
          <Crown className="size-4" /> Upgrade to Pro
        </button>
      ) : (
        <div className="no-drag flex h-10 items-center gap-1.5 rounded-full border border-violet/20 bg-violet/8 px-4 text-sm font-bold text-violet">
          <Crown className="size-4" /> {user.plan === 'pro' ? 'Pro' : 'Team'}
        </div>
      )}
    </header>
  )
}
