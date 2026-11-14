// OWNER: subagent B. "Ask Claude" chat panel — streaming answers grounded in the selected session.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Copy, Eraser, Globe, MessageCircleQuestion, Sparkles, Video, Lock } from 'lucide-react'
import { toast } from 'sonner'
import type { AskMode, SessionDetail } from '@shared/types'
import { cv } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { MODELS } from '@shared/types'
import { emit } from '@/lib/events'
import { cn, formatClock, logError } from '@/lib/utils'
import { Markdown } from './Markdown'
import { selectWindow } from './timeWindow'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  question?: string
  streaming?: boolean
  error?: boolean
}

function contextHint(detail: SessionDetail | null, question: string): string | null {
  if (!detail) return null
  const sel = selectWindow(question, detail.durationS, detail.segments, detail.events)
  const n = sel.segments.length
  const m = sel.events.length
  return `${formatClock(sel.window.start)}–${formatClock(sel.window.end)} · ${n} line${n === 1 ? '' : 's'} · ${m} screen event${m === 1 ? '' : 's'}`
}

function ClaudeAvatar({ pulse }: { pulse?: boolean }): React.JSX.Element {
  return (
    <span className={cn('relative flex size-7 shrink-0 items-center justify-center rounded-full bg-grad text-white shadow-glow-violet', pulse && 'animate-pulse-ring')}>
      <Sparkles className="size-3.5" />
    </span>
  )
}

function TypingDots(): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-1.5 rounded-full bg-violet/60" animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </span>
  )
}

const Caret = (): React.JSX.Element => <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse rounded-full bg-violet" />

export function AskPanel({ sessionId, detail, firstName }: { sessionId: number; detail: SessionDetail | null; firstName: string }): React.JSX.Element {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const busyRef = useRef(false)
  const [mode, setModeState] = useState<AskMode>('smart')
  const isPrivate = !!detail && !detail.access.ai
  useEffect(() => {
    cv.settings.get('askMode').then((m) => (m === 'recording' || m === 'smart') && setModeState(m)).catch(() => undefined)
  }, [])
  const setMode = (m: AskMode): void => {
    setModeState(m)
    void cv.settings.set('askMode', m)
    toast.message(m === 'smart' ? 'Smart mode: your recording + Claude’s knowledge & the web' : 'Recording only: answers strictly from this session')
  }

  const suggestions = [
    `Hey, I'm ${firstName}. What did I talk about in the last minute?`,
    'What was I searching for?',
    'Summarize my last conversation.'
  ]

  // Load previous Q&A for this session.
  useEffect(() => {
    let alive = true
    setMessages([])
    cv.ai
      .history(sessionId)
      .then((rows) => {
        if (!alive) return
        setMessages(
          rows.flatMap((r) => [
            { id: `q${r.id}`, role: 'user' as const, text: r.question },
            { id: `a${r.id}`, role: 'assistant' as const, text: r.answer, question: r.question }
          ])
        )
      })
      .catch((e) => logError('Loading chat history failed', e))
    return () => {
      alive = false
    }
  }, [sessionId])

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.some((m) => m.streaming) ? 'auto' : 'smooth' })
  }, [messages])

  // Auto-grow the textarea.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim()
      if (!question || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setInput('')
      const base = `${Date.now()}`
      const aId = `a-${base}`
      setMessages((m) => [...m, { id: `q-${base}`, role: 'user', text: question }, { id: aId, role: 'assistant', text: '', question, streaming: true }])
      let acc = ''
      const patch = (p: Partial<Msg>): void => setMessages((m) => m.map((x) => (x.id === aId ? { ...x, ...p } : x)))
      try {
        const r = await cv.ai.ask({ sessionId, question, mode }, (delta) => {
          acc += delta
          patch({ text: acc })
        })
        if (r.ok) patch({ text: r.data ?? acc, streaming: false })
        else {
          patch({ text: r.error ?? 'Something went wrong — please try again.', streaming: false, error: true })
          toast.error('Claude could not answer', { description: r.error })
        }
        emit('qa:changed')
      } catch (e) {
        logError('Ask failed', e)
        patch({ text: 'Something went wrong — please try again.', streaming: false, error: true })
        toast.error('Claude could not answer')
      } finally {
        busyRef.current = false
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [sessionId, mode]
  )

  const copy = (text: string): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Answer copied'))
      .catch(() => toast.error('Could not copy'))
  }

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-3xl">
      {/* Header */}
      <div className="relative flex items-center gap-3 border-b border-line/80 px-5 py-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-grad grad-animate" />
        <span className="flex size-10 items-center justify-center rounded-2xl bg-grad text-white shadow-glow-violet">
          <MessageCircleQuestion className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink">Ask Claude</h3>
            <AiModeBadge />
          </div>
          {isPrivate ? (
            <p className="truncate text-xs font-semibold text-pink">🔒 No access to “{detail?.title}” · you turned it off</p>
          ) : (
            <p className="truncate text-xs text-ink-soft">
              {mode === 'smart' ? 'Knows ' : 'Answers only from '}
              {detail ? `“${detail.title}”` : 'this session'}
              {mode === 'smart' ? ' · can answer anything' : ''}
            </p>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            disabled={busy}
            title="Clear the chat view (history is kept)"
            className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-violet/8 hover:text-violet disabled:opacity-40 cursor-pointer"
          >
            <Eraser className="size-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
          <ClaudeAvatar />
          <div className="rounded-2xl rounded-tl-md border border-white bg-white/85 px-3.5 py-2.5 text-sm text-ink shadow-soft">
            <p className="font-display text-[15px] font-semibold">
              Hi {firstName}{' '}
              <motion.span className="inline-block origin-[70%_70%]" animate={{ rotate: [0, 18, -8, 18, 0] }} transition={{ duration: 1.6, delay: 0.4 }}>
                👋
              </motion.span>
            </p>
            <p className="font-medium">{mode === 'smart' ? 'Ask me anything — about this session or beyond' : 'Ask me anything about this session'}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {mode === 'smart'
                ? 'I check your recording first, then use my own knowledge and a quick web search when needed — and I’ll say which is which.'
                : 'I only use what you said and what was on your screen — try a suggestion below.'}
            </p>
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
                <div className="selectable max-w-[85%] rounded-2xl rounded-br-md bg-grad px-3.5 py-2.5 text-sm font-medium leading-relaxed text-white shadow-glow-pink">{m.text}</div>
              </motion.div>
            ) : (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-2.5">
                <ClaudeAvatar pulse={m.streaming && !m.text} />
                <div className="min-w-0 max-w-[88%]">
                  <div
                    className={cn(
                      'selectable rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm text-ink shadow-soft backdrop-blur',
                      m.error ? 'border-danger/20 bg-danger/5 text-danger' : 'border-white bg-white/85'
                    )}
                  >
                    {m.streaming && !m.text ? <TypingDots /> : <Markdown text={m.text} trailing={m.streaming ? <Caret /> : undefined} />}
                  </div>
                  {!m.streaming && !m.error && (
                    <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-ink-faint">
                      {!isPrivate && m.question && contextHint(detail, m.question) && <span className="leading-tight">Context used: {contextHint(detail, m.question)}</span>}
                      <button onClick={() => copy(m.text)} className="ml-auto rounded p-0.5 opacity-0 transition-opacity hover:text-violet group-hover:opacity-100 cursor-pointer" title="Copy answer">
                        <Copy className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>

      {/* Input + suggestions */}
      <div className="border-t border-line/80 bg-white/40 px-4 pb-4 pt-3">
        {isPrivate && detail && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-pink/25 bg-pink/8 px-3 py-2 text-xs text-ink">
            <Lock className="size-3.5 shrink-0 text-pink" />
            <span className="flex-1 leading-snug">
              <b>Claude can’t see this session.</b> Nothing from it is sent. {mode === 'smart' ? 'General questions still work.' : ''}
            </span>
            <button
              onClick={async () => {
                const r = await cv.sessions.setAccess(detail.id, { ai: true })
                if (r.ok) {
                  toast.success('Claude can now read this session')
                  emit('sessions:changed')
                } else toast.error(r.error ?? 'Could not change access')
              }}
              className="shrink-0 rounded-lg bg-white px-2 py-1 font-bold text-violet shadow-soft hover:bg-violet/5 cursor-pointer"
              data-testid="allow-claude"
            >
              Allow Claude
            </button>
          </div>
        )}
        <div className="mb-2 flex items-center gap-1 rounded-xl bg-violet/8 p-1 text-xs font-bold" role="radiogroup" aria-label="Answer mode">
          {(
            [
              { m: 'smart', icon: Globe, label: 'Smart', hint: 'Your recording + Claude’s knowledge & web search' },
              { m: 'recording', icon: Video, label: 'Recording only', hint: 'Strictly from this session — never guesses' }
            ] as const
          ).map(({ m, icon: Icon, label, hint }) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              title={hint}
              onClick={() => mode !== m && setMode(m)}
              disabled={busy}
              data-testid={`ask-mode-${m}`}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 transition-all cursor-pointer disabled:cursor-default',
                mode === m ? 'bg-white text-violet shadow-soft' : 'text-ink-soft hover:text-ink'
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-white/90 p-1.5 pl-3.5 shadow-soft transition-all focus-within:border-violet/50 focus-within:ring-4 focus-within:ring-violet/10">
          <textarea
            ref={inputRef}
            data-testid="ask-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder={mode === 'smart' ? 'Ask anything — your session, places, ideas…' : 'Ask about this session…'}
            className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            data-testid="ask-send"
            onClick={() => void send(input)}
            disabled={busy || !input.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-grad text-white shadow-glow-violet transition-opacity disabled:opacity-40 cursor-pointer"
            title="Send (Enter)"
          >
            <ArrowUp className="size-4" />
          </motion.button>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <motion.button
              key={s}
              data-testid={`ask-suggestion-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07 }}
              whileHover={{ y: -2 }}
              onClick={() => void send(s)}
              disabled={busy}
              className={cn(
                'max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer',
                i === 0 && 'border-pink/25 bg-pink/8 text-pink hover:bg-pink/15',
                i === 1 && 'border-cyan/30 bg-cyan/10 text-[#0e7490] hover:bg-cyan/15',
                i === 2 && 'border-violet/25 bg-violet/8 text-violet hover:bg-violet/15'
              )}
            >
              {s}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Makes it obvious whether answers come from live Claude or the offline demo engine. */
function AiModeBadge(): React.JSX.Element | null {
  const { info } = useAuth()
  if (!info) return null
  return info.hasAnthropicKey ? (
    <span title={`Live answers from ${MODELS.smart} via the Anthropic API`} className="inline-flex items-center gap-1 rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold text-[#4d7c0f]">
      <span className="size-1.5 rounded-full bg-lime" /> Live · {MODELS.smart}
    </span>
  ) : (
    <span title="No ANTHROPIC_API_KEY set — answers come from an offline demo engine that reads your transcript and screen activity" className="inline-flex items-center gap-1 rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-bold text-[#b45309]">
      <span className="size-1.5 rounded-full bg-orange" /> Demo mode · offline
    </span>
  )
}
