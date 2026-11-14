// OWNER: subagent C (Support). Floating support chatbot ("Vee") with in-widget ticket creation.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, MessageCircleHeart, SendHorizontal, Ticket as TicketIcon, X } from 'lucide-react'
import type { ChatMessage, Ticket } from '@shared/types'
import { cv } from '@/lib/api'
import { sparkle } from '@/lib/confetti'
import { cn, logError } from '@/lib/utils'
import { TicketForm } from './TicketForm'
import { TicketAssignedCard } from './TicketAssignedCard'
import { firstName } from './meta'

type Item = { id: number; kind: 'bot' | 'user'; text: string } | { id: number; kind: 'ticket'; ticket: Ticket }

const SEEN_KEY = 'cv:support:seen'
const QUICK_REPLIES = ['Recording won’t start', 'Where are my files?', 'Is my data private?']
const GREETING =
  'Hi! I’m Vee, your Context Vault helper. 👋 Ask me anything about recording, your files, privacy or plans — or create a ticket and a human specialist will jump in.'

let nextId = 1

/** Renders **bold** segments and keeps line breaks. */
function RichText({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function BotAvatar({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-grad text-white shadow-glow-violet ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      🤖
    </div>
  )
}

function TypingDots(): React.JSX.Element {
  return (
    <div className="flex items-end gap-2" aria-label="Vee is typing">
      <BotAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-soft">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-violet"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut'
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function SupportWidget(): React.JSX.Element | null {
  // On Summary & Ask the right column is the chat panel, so dock the bubble bottom-left instead of covering the composer.
  const onSummary = useLocation().pathname.startsWith('/app/summary')
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'chat' | 'ticket'>('chat')
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const [items, setItems] = useState<Item[]>(() => [{ id: nextId++, kind: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggle = useCallback(() => {
    setOpen((o) => !o)
    if (!seen) {
      setSeen(true)
      try {
        localStorage.setItem(SEEN_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  }, [seen])

  // Close on Escape (unless a modal dialog elsewhere is handling it).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Auto-scroll to the newest message (again after spring animations settle, and when the chat view remounts).
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])
  useEffect(() => {
    if (view !== 'chat' || !open) return
    const raf = requestAnimationFrame(() => scrollToBottom())
    const t = setTimeout(() => scrollToBottom(), 450)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [items, typing, view, open, scrollToBottom])

  useEffect(() => {
    if (open && view === 'chat') setTimeout(() => inputRef.current?.focus(), 250)
  }, [open, view])

  const userTurns = items.filter((i) => i.kind === 'user').length

  const send = async (text: string): Promise<void> => {
    const q = text.trim()
    if (!q || typing) return
    setInput('')
    const userItem: Item = { id: nextId++, kind: 'user', text: q }
    const history: ChatMessage[] = [...items, userItem]
      .filter((i): i is Extract<Item, { kind: 'bot' | 'user' }> => i.kind !== 'ticket')
      .map((i) => ({
        role: i.kind === 'user' ? 'user' : 'assistant',
        content: i.text
      }))
    setItems((prev) => [...prev, userItem])
    setTyping(true)
    const started = Date.now()
    let answer: string
    try {
      const r = await cv.support.chat(history)
      answer = r.ok && r.data ? r.data : 'Sorry, I hit a snag answering that. 😅 Tap “Create a ticket” and a human will help you out.'
    } catch (e) {
      logError('support chat failed', e)
      answer = 'Sorry, I hit a snag answering that. 😅 Tap “Create a ticket” and a human will help you out.'
    }
    // Keep the typing indicator visible for a natural beat.
    const wait = Math.max(0, 700 - (Date.now() - started))
    setTimeout(() => {
      setTyping(false)
      setItems((prev) => [...prev, { id: nextId++, kind: 'bot', text: answer }])
    }, wait)
  }

  const onCreated = (t: Ticket): void => {
    setView('chat')
    setItems((prev) => [
      ...prev,
      { id: nextId++, kind: 'ticket', ticket: t },
      {
        id: nextId++,
        kind: 'bot',
        text: t.agent
          ? `${firstName(t.agent.name)} from ${t.agent.specialty} has it now and will reply by email. You can follow it any time on the Support page. 💜`
          : 'Your ticket is in! You can follow it on the Support page. 💜'
      }
    ])
    setTimeout(() => sparkle(0.86, 0.55), 250)
  }

  const lastUserText = ([...items].reverse().find((i) => i.kind === 'user') as { text: string } | undefined)?.text ?? ''
  // Prefill the ticket subject with what the user last asked Vee (if it reads like a subject).
  const draftSubject = lastUserText.length <= 100 ? lastUserText : ''

  return (
    <div
      className={`no-drag pointer-events-none fixed bottom-6 z-40 flex flex-col ${onSummary ? 'left-[184px] bottom-[110px]! items-start' : 'right-6 items-end'}`}
    >
      <AnimatePresence>
        {open && (
          <motion.section
            key="window"
            aria-label="Context Vault Support chat"
            initial={{ opacity: 0, scale: 0.6, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.7,
              y: 24,
              transition: { duration: 0.18 }
            }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{ transformOrigin: onSummary ? 'bottom left' : 'bottom right' }}
            className={`pointer-events-auto absolute bottom-[72px] ${onSummary ? 'left-0' : 'right-0'} flex h-[560px] max-h-[calc(100vh-120px)] w-[380px] flex-col overflow-hidden rounded-3xl border border-white bg-white/80 shadow-[0_30px_80px_-20px_rgb(124_58_237/0.5)] backdrop-blur-2xl`}
            data-testid="support-window"
          >
            {/* Header */}
            <header className="relative flex items-center gap-3 overflow-hidden bg-grad grad-animate px-4 py-3.5 text-white">
              <div className="pointer-events-none absolute -right-6 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
              {view === 'ticket' ? (
                <button
                  onClick={() => setView('chat')}
                  className="relative flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/20 transition hover:bg-white/30"
                  aria-label="Back to chat"
                >
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <div className="relative">
                  <div className="flex size-10 items-center justify-center rounded-full bg-white text-xl shadow-soft">🤖</div>
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-lime ring-2 ring-white" />
                </div>
              )}
              <div className="relative min-w-0 flex-1">
                <div className="font-display text-[15px] font-bold leading-tight">{view === 'ticket' ? 'Create a ticket' : 'Vee 🤖'}</div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                  {view === 'ticket' ? (
                    'A specialist will reply by email'
                  ) : (
                    <>
                      Context Vault Support <span className="size-1 rounded-full bg-white/70" /> <span className="size-1.5 rounded-full bg-lime" /> Online
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="relative flex size-8 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/20"
                aria-label="Close support chat"
              >
                <X className="size-4" />
              </button>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              {view === 'chat' ? (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  onAnimationComplete={() => scrollToBottom()}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {/* Messages */}
                  <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-violet/[0.04] to-pink/[0.04] px-4 py-4">
                    <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Today</div>
                    {items.map((it) =>
                      it.kind === 'ticket' ? (
                        <div key={it.id} className="pl-9">
                          <TicketAssignedCard ticket={it.ticket} />
                        </div>
                      ) : it.kind === 'bot' ? (
                        <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2">
                          <BotAvatar />
                          <div className="selectable max-w-[82%] whitespace-pre-line rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-ink shadow-soft">
                            <RichText text={it.text} />
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={it.id}
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className="flex justify-end"
                        >
                          <div className="selectable max-w-[82%] whitespace-pre-line rounded-2xl rounded-br-md bg-grad px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-glow-violet">
                            {it.text}
                          </div>
                        </motion.div>
                      )
                    )}
                    {userTurns === 0 && !typing && (
                      <motion.div
                        initial="hidden"
                        animate="show"
                        variants={{
                          show: {
                            transition: {
                              staggerChildren: 0.07,
                              delayChildren: 0.2
                            }
                          }
                        }}
                        className="flex flex-wrap gap-1.5 pl-9"
                      >
                        {QUICK_REPLIES.map((q) => (
                          <motion.button
                            key={q}
                            variants={{
                              hidden: { opacity: 0, y: 6 },
                              show: { opacity: 1, y: 0 }
                            }}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => send(q)}
                            className="cursor-pointer rounded-full border border-violet/25 bg-white px-3 py-1.5 text-xs font-semibold text-violet shadow-sm transition-colors hover:border-violet/50 hover:bg-violet/5"
                          >
                            {q}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                    {items.some((i) => i.kind === 'ticket') && (
                      <div className="pl-9">
                        <button
                          onClick={() => {
                            nav('/app/support')
                            setOpen(false)
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-violet hover:underline"
                        >
                          View my tickets <ArrowRight className="size-3" />
                        </button>
                      </div>
                    )}
                    {typing && <TypingDots />}
                  </div>

                  {/* Composer */}
                  <div className="border-t border-line/70 bg-white/85 px-3 pb-3 pt-2.5">
                    <button
                      onClick={() => setView('ticket')}
                      className="mb-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-pink/40 bg-pink/[0.05] py-2 text-xs font-bold text-pink transition hover:border-pink/70 hover:bg-pink/10"
                    >
                      <TicketIcon className="size-3.5" /> Create a ticket
                    </button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void send(input)
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Vee anything…"
                        maxLength={1000}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-violet/50 focus:outline-none focus:ring-4 focus:ring-violet/10"
                      />
                      <motion.button
                        type="submit"
                        whileTap={{ scale: 0.9 }}
                        disabled={!input.trim() || typing}
                        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-grad text-white shadow-glow-violet transition disabled:cursor-default disabled:opacity-40"
                        aria-label="Send message"
                      >
                        <SendHorizontal className="size-4" />
                      </motion.button>
                    </form>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ticket"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
                >
                  <div className="mb-3 flex items-start gap-2 rounded-xl bg-violet/[0.06] px-3 py-2.5 text-[12px] leading-snug text-ink-soft">
                    <span className="text-base leading-none">🎧</span>
                    <span>A real person from our support team picks this up and replies by email, usually within a few hours.</span>
                  </div>
                  <TicketForm compact initialSubject={draftSubject} onCreated={onCreated} onCancel={() => setView('chat')} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Bubble */}
      <div className="group pointer-events-auto relative">
        {!open && (
          <span className="pointer-events-none absolute right-[68px] top-1/2 -translate-y-1/2 translate-x-2 whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-soft transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
            Need help?
            <span className="absolute -right-1 top-1/2 size-2 -translate-y-1/2 rotate-45 bg-ink" />
          </span>
        )}
        <motion.button
          onClick={toggle}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          aria-label={open ? 'Close support chat' : 'Open support chat'}
          aria-expanded={open}
          data-testid="support-bubble"
          className={cn(
            'relative flex size-14 cursor-pointer items-center justify-center rounded-full bg-grad grad-animate text-white shadow-glow-violet ring-4 ring-white/70',
            !open && 'animate-bounce-soft'
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? 'x' : 'chat'}
              initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {open ? <X className="size-6" /> : <MessageCircleHeart className="size-6" />}
            </motion.span>
          </AnimatePresence>
          {!seen && !open && (
            <span className="absolute right-0.5 top-0.5 flex size-3.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-pink opacity-75" />
              <span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-pink" />
            </span>
          )}
        </motion.button>
      </div>
    </div>
  )
}
