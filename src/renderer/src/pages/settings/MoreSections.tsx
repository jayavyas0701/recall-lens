// OWNER: subagent D. Demo, AI & privacy, feedback history and account sections.
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Bot, CheckCircle2, KeyRound, Loader2, LogOut, MessageSquareHeart, Plane, Sparkles, TriangleAlert } from 'lucide-react'
import { MODELS, type FeedbackRow } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { emit } from '@/lib/events'
import { sparkle } from '@/lib/confetti'
import { formatDate, logError } from '@/lib/utils'
import { StarRating } from '@/features/feedback/StarRating'
import { KV, Section } from './Section'

/* ---------------- Demo ---------------- */
export function DemoSection(): React.JSX.Element {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)

  const load = async (e: React.MouseEvent): Promise<void> => {
    setBusy(true)
    const x = e.clientX / window.innerWidth
    const y = e.clientY / window.innerHeight
    try {
      const r = await cv.demo.loadSession()
      if (!r.ok || !r.data) throw new Error(r.error ?? 'Could not load demo')
      const id = r.data.id
      sparkle(x, y)
      setTimeout(() => sparkle(x - 0.08, y - 0.05), 180)
      emit('sessions:changed')
      toast.success('Demo session loaded — Tokyo trip ✈️', {
        description: '3 minutes of transcript, screen events and a summary.',
        action: { label: 'Open summary', onClick: () => nav(`/app/summary?session=${id}`) },
        duration: 7000
      })
    } catch (err) {
      logError('demo.loadSession failed', err)
      toast.error('Couldn’t load the demo session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={<Sparkles />} title="Demo safety net" description="One click seeds a realistic 3-minute session." gradient="var(--cv-grad-warm)">
      <div className="flex items-center gap-4 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/10 via-pink/8 to-violet/10 p-4">
        <motion.span
          animate={{ x: [0, 6, 0], y: [0, -4, 0], rotate: [0, 4, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-soft"
        >
          🗼
        </motion.span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">Tokyo trip planning</div>
          <div className="text-xs text-ink-soft">Flights, hotels & ramen — transcript, screen events and summary included.</div>
        </div>
        <Button variant="gradient" onClick={(e) => void load(e)} disabled={busy} data-testid="load-demo">
          {busy ? <Loader2 className="animate-spin" /> : <Plane />}
          Load demo session
        </Button>
      </div>
    </Section>
  )
}

/* ---------------- AI & privacy ---------------- */
function ApiKeyForm(): React.JSX.Element {
  const { info, refresh } = useAuth()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const connected = !!info?.hasAnthropicKey

  const save = async (value: string): Promise<void> => {
    setBusy(true)
    try {
      const r = await cv.app.setAnthropicKey(value)
      if (!r.ok) return void toast.error(r.error ?? 'Could not save the key')
      await refresh()
      setKey('')
      setEditing(false)
      if (value) {
        sparkle(0.75, 0.5)
        toast.success('Live Claude is on ✨', { description: 'New screenshots, summaries and answers now use Claude. Hit “Regenerate” on a summary to refresh it.' })
      } else toast.message('API key removed — back to demo mode.')
    } finally {
      setBusy(false)
    }
  }

  if (connected && !editing)
    return (
      <div className="mb-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <KeyRound /> Replace key
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void save('')} disabled={busy}>
          Remove key
        </Button>
      </div>
    )
  return (
    <form
      className="mb-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save(key)
      }}
    >
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Paste your key: sk-ant-…"
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white/80 px-3 font-mono text-xs text-ink placeholder:font-sans placeholder:text-ink-faint focus:border-violet/50 focus:outline-none focus:ring-4 focus:ring-violet/10"
        data-testid="api-key-input"
      />
      <Button type="submit" variant="gradient" size="sm" disabled={busy || key.trim().length < 10} className="h-9">
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Turn on live AI
      </Button>
    </form>
  )
}

export function AiPrivacySection(): React.JSX.Element {
  const { info } = useAuth()
  return (
    <Section icon={<Bot />} title="AI & privacy" description="What runs where — in plain language." gradient="var(--cv-grad-cool)">
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-line/80 bg-white/60 px-3 py-2.5">
        <KeyRound className="size-4 text-violet" />
        <span className="flex-1 text-sm font-semibold text-ink">Anthropic API key</span>
        {info == null ? (
          <Skeleton className="h-5 w-20 rounded-full" />
        ) : info.hasAnthropicKey ? (
          <Badge variant="lime">
            <CheckCircle2 className="size-3" /> Connected
          </Badge>
        ) : (
          <Badge variant="orange">
            <TriangleAlert className="size-3" /> Not set · mock AI
          </Badge>
        )}
      </div>
      <ApiKeyForm />
      <p className="-mt-1 mb-3 text-[11px] leading-relaxed text-ink-faint">
        Saved only on this Mac in <code className="font-mono">~/ContextVault/.env</code> (owner-only). Get a key at console.anthropic.com.
      </p>
      <KV k="Summaries & answers" v={<code className="rounded bg-violet/8 px-1.5 py-0.5 font-mono text-xs text-violet">{MODELS.smart}</code>} />
      <KV k="Support bot & screenshots" v={<code className="rounded bg-cyan/10 px-1.5 py-0.5 font-mono text-xs text-[#0e7490]">{MODELS.fast}</code>} />
      <KV k="Speech-to-text" v="Whisper, on this device" />
      <KV k="Database" v={info?.dbPath ?? '…'} mono />
      <div className="mt-3 rounded-xl bg-lime/10 p-3 text-xs leading-relaxed text-ink-soft">
        <b className="text-[#4d7c0f]">🔒 Your recordings never leave this device.</b> Audio and video stay in your storage folder. Only transcript text and
        screenshots are sent to the Anthropic API{info && !info.hasAnthropicKey ? ' — and right now nothing is sent at all, because mock AI is on' : ''}.
      </div>
    </Section>
  )
}

/* ---------------- Feedback history ---------------- */
export function FeedbackHistorySection(): React.JSX.Element {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const load = useCallback(async () => {
    try {
      setRows(await cv.feedback.list())
    } catch (e) {
      logError('feedback.list failed', e)
      setRows([])
    }
  }, [])
  useEffect(() => void load(), [load])

  const avg = rows?.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : 0

  return (
    <Section
      icon={<MessageSquareHeart />}
      title="Your feedback"
      description="Ratings you’ve given to summaries."
      action={
        rows && rows.length > 0 ? (
          <Badge variant="default" className="mt-1">
            ★ {avg.toFixed(1)} avg · {rows.length}
          </Badge>
        ) : null
      }
    >
      {rows == null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-violet/25 bg-white/40 px-4 py-6 text-center">
          <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 2.5, repeat: Infinity }} className="text-3xl">
            💌
          </motion.span>
          <div className="mt-2 text-sm font-bold text-ink">No feedback yet</div>
          <div className="text-xs text-ink-soft">Rate a summary on the Summary tab and it’ll show up here.</div>
        </div>
      ) : (
        <div className="-mr-2 flex max-h-[268px] flex-col gap-2 overflow-y-auto pr-2" data-testid="feedback-list">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.04 }}
                className="flex gap-3 rounded-xl border border-line/80 bg-white/60 px-3 py-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet/8 text-lg">{r.emoji ?? '⭐'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <StarRating value={r.rating} size={13} readOnly />
                    <span className="shrink-0 text-[11px] text-ink-faint">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-ink">{r.sessionTitle ?? (r.sessionId ? 'Deleted session' : 'General feedback')}</div>
                  {r.comment && <div className="selectable mt-0.5 line-clamp-2 text-xs text-ink-soft">“{r.comment}”</div>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  )
}

/* ---------------- Account ---------------- */
export function AccountSection(): React.JSX.Element {
  const { signOut, user } = useAuth()
  return (
    <Section icon={<LogOut />} title="Account" description={`Signed in as ${user?.email ?? ''}`} gradient="linear-gradient(135deg,#ef4444,#ec4899)">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-soft">Logging out keeps all your recordings safely on this device.</p>
        <Button
          variant="outline"
          className="hover:border-danger/40 hover:text-danger"
          onClick={() => {
            toast.success('Logged out — see you soon 👋')
            void signOut()
          }}
        >
          <LogOut /> Log out
        </Button>
      </div>
    </Section>
  )
}
