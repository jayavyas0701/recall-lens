// OWNER: subagent D (Feedback). "How was this summary?" card shown under each summary.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Heart, Loader2, MessageSquareHeart, Send } from 'lucide-react'
import type { FeedbackRow } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { cv } from '@/lib/api'
import { sparkle } from '@/lib/confetti'
import { cn, logError } from '@/lib/utils'
import { StarRating } from './StarRating'

export const REACTIONS = [
  { emoji: '😍', label: 'Loved it' },
  { emoji: '👍', label: 'Helpful' },
  { emoji: '😐', label: 'Meh' },
  { emoji: '👎', label: 'Not useful' }
] as const

const RATING_WORDS = ['', 'Not great', 'Could be better', 'Pretty good', 'Really useful', 'Spot on!']

export function FeedbackCard({ sessionId }: { sessionId: number | null }): React.JSX.Element | null {
  const [mode, setMode] = useState<'loading' | 'form' | 'thanks'>('loading')
  const [existing, setExisting] = useState<FeedbackRow | null>(null)
  const [rating, setRating] = useState(0)
  const [emoji, setEmoji] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    setMode('loading')
    setJustSent(false)
    setRating(0)
    setEmoji(null)
    setComment('')
    cv.feedback
      .list()
      .then((rows) => {
        if (!alive) return
        const prev = sessionId == null ? null : (rows.find((r) => r.sessionId === sessionId) ?? null)
        setExisting(prev)
        setMode(prev ? 'thanks' : 'form')
      })
      .catch((e) => {
        logError('feedback.list failed', e)
        if (alive) setMode('form')
      })
    return () => {
      alive = false
    }
  }, [sessionId])

  const submit = async (): Promise<void> => {
    if (!rating) {
      toast.message('Tap a star first ⭐', { description: 'How useful was this summary?' })
      return
    }
    setBusy(true)
    try {
      const r = await cv.feedback.submit({ sessionId, rating, emoji, comment })
      if (!r.ok || !r.data) throw new Error(r.error ?? 'Could not save feedback')
      const rect = submitRef.current?.getBoundingClientRect()
      if (rect) sparkle((rect.left + rect.width / 2) / window.innerWidth, (rect.top + rect.height / 2) / window.innerHeight)
      else sparkle()
      setExisting(r.data)
      setJustSent(true)
      setMode('thanks')
      toast.success('Thanks for the feedback! 💜', { description: 'It helps make your summaries even better.' })
    } catch (e) {
      logError('feedback.submit failed', e)
      toast.error('Couldn’t save your feedback — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const again = (): void => {
    setRating(0)
    setEmoji(null)
    setComment('')
    setJustSent(false)
    setMode('form')
  }

  return (
    <div className="glass relative overflow-hidden rounded-2xl" data-testid="feedback-card">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-grad opacity-10 blur-2xl" />
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'loading' && (
          <motion.div key="loading" exit={{ opacity: 0 }} className="flex h-[76px] items-center gap-3 px-5 text-sm text-ink-faint">
            <Loader2 className="size-4 animate-spin" /> Loading feedback…
          </motion.div>
        )}

        {mode === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="relative p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-grad text-white shadow-glow-violet">
                  <MessageSquareHeart className="size-5" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink">How was this summary?</h3>
                  <p className="h-4 text-xs text-ink-soft">{rating ? RATING_WORDS[rating] : 'Your rating stays on this device.'}</p>
                </div>
              </div>
              <StarRating value={rating} onChange={setRating} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {REACTIONS.map((r) => {
                const on = emoji === r.emoji
                return (
                  <motion.button
                    key={r.emoji}
                    type="button"
                    aria-pressed={on}
                    title={r.label}
                    onClick={() => setEmoji(on ? null : r.emoji)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors cursor-pointer',
                      on ? 'border-violet/40 bg-violet/10 text-violet shadow-soft' : 'border-line bg-white/70 text-ink-soft hover:border-violet/25'
                    )}
                  >
                    <motion.span
                      key={on ? 'on' : 'off'}
                      animate={on ? { scale: [1, 1.6, 0.9, 1.15, 1], rotate: [0, -12, 10, 0] } : { scale: 1 }}
                      transition={{ duration: 0.55 }}
                      className="text-lg leading-none"
                    >
                      {r.emoji}
                    </motion.span>
                    {r.label}
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence initial={false}>
              {(rating > 0 || emoji) && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="flex items-end gap-3 pt-4">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Anything we should know? (optional)"
                      className="min-h-[64px] flex-1"
                      maxLength={2000}
                    />
                    <Button ref={submitRef} variant="gradient" onClick={() => void submit()} disabled={busy} className="h-11 px-5" data-testid="feedback-submit">
                      {busy ? <Loader2 className="animate-spin" /> : <Send />}
                      Submit
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {mode === 'thanks' && (
          <motion.div key="thanks" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative flex items-center gap-4 px-5 py-4">
            <div className="relative">
              <motion.span
                initial={justSent ? { scale: 0, rotate: -30 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 12 }}
                className="flex size-11 items-center justify-center rounded-full bg-grad-warm text-white shadow-glow-pink"
              >
                <Heart className="size-5 fill-white" />
              </motion.span>
              {justSent &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-pink"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: Math.cos((i / 6) * Math.PI * 2) * 30, y: Math.sin((i / 6) * Math.PI * 2) * 30, opacity: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                  />
                ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-ink">{justSent ? 'Thanks!' : 'Thanks for your feedback'}</h3>
                {existing?.emoji && <span className="text-lg leading-none">{existing.emoji}</span>}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-soft">
                {existing && <StarRating value={existing.rating} size={14} readOnly />}
                {existing?.comment ? <span className="truncate">“{existing.comment}”</span> : <span>Your rating helps tune future summaries.</span>}
              </div>
            </div>
            <Button variant="link" size="sm" onClick={again} className="shrink-0" data-testid="feedback-again">
              Give more feedback
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
