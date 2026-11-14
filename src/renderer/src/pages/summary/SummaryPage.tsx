// OWNER: subagent B. Tab 3 — "Summary & Ask Claude".
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, Clock, FlaskConical, Mic, RefreshCw, Sparkles, Wand2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { SessionDetail, SessionRow } from '@shared/types'
import { Page } from '@/components/common/Page'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FeedbackCard } from '@/features/feedback/FeedbackCard'
import { cv } from '@/lib/api'
import { useUser } from '@/lib/auth'
import { emit, useAppEvent } from '@/lib/events'
import { formatDate, formatDuration, logError } from '@/lib/utils'
import { AskPanel } from './AskPanel'
import { SessionPicker } from './SessionPicker'
import { AccessBadges, AccessDialog, UnlockForm } from '@/components/common/SessionAccess'
import { SummarySkeleton, SummaryView } from './SummaryView'

const PROCESSING: Partial<Record<SessionRow['status'], string>> = {
  transcribing: 'Transcribing your audio…',
  summarizing: 'Claude is summarizing your session…'
}

/** Height available inside the app's scrolling content area, so the chat panel can be full-height + sticky. */
function useScrollAreaHeight(ref: React.RefObject<HTMLElement | null>): number {
  const [h, setH] = useState(() => window.innerHeight - 140)
  useLayoutEffect(() => {
    let p = ref.current?.parentElement ?? null
    while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement
    if (!p) return
    const el = p
    const update = (): void => setH(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return h
}

export function SummaryPage(): React.JSX.Element {
  const user = useUser()
  const firstName = user.name.split(/\s+/)[0] || user.name
  const [params, setParams] = useSearchParams()
  const selected = params.get('session') ? Number(params.get('session')) : null

  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const autoTried = useRef(new Set<number>())
  const rootRef = useRef<HTMLDivElement>(null)
  const areaH = useScrollAreaHeight(rootRef)

  const resolvedId = selected ?? sessions?.[0]?.id ?? null

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await cv.sessions.list())
    } catch (e) {
      logError('Loading sessions failed', e)
      setSessions([])
    }
  }, [])

  const [accessOpen, setAccessOpen] = useState(false)
  const loadDetail = useCallback(async (id: number) => {
    try {
      const d = await cv.sessions.get(id)
      setDetail(d)
      return d
    } catch (e) {
      logError('Loading session failed', e)
      return null
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (resolvedId == null) {
      setDetail(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    // Deep link to a session we haven't listed yet (e.g. just recorded) → refresh the list too.
    if (selected != null && sessions && !sessions.some((x) => x.id === selected)) void loadSessions()
    cv.sessions
      .get(resolvedId)
      .then((d) => {
        if (!alive) return
        setDetail(d)
        if (!d && selected != null && sessions) {
          toast.info('That session is gone — showing your latest one')
          setParams({}, { replace: true })
        }
      })
      .catch((e) => logError('Loading session failed', e))
      .finally(() => alive && setDetailLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId])

  const refresh = useCallback(() => {
    void loadSessions()
    if (resolvedId != null) void loadDetail(resolvedId)
  }, [loadSessions, loadDetail, resolvedId])
  useAppEvent('sessions:changed', refresh)

  const generate = useCallback(
    async (force: boolean) => {
      if (resolvedId == null) return
      setGenerating(true)
      const id = toast.loading(force ? 'Regenerating summary…' : 'Summarizing your session…')
      try {
        const r = await cv.ai.summarize(resolvedId, force)
        if (r.ok) {
          toast.success(force ? 'Fresh summary ready ✨' : 'Summary ready ✨', { id })
          await Promise.all([loadDetail(resolvedId), loadSessions()])
        } else toast.error('Could not summarize', { id, description: r.error })
      } catch (e) {
        logError('Summarize failed', e)
        toast.error('Could not summarize', { id })
      } finally {
        setGenerating(false)
      }
    },
    [resolvedId, loadDetail, loadSessions]
  )

  // Summarize automatically the first time a ready session without a summary is opened.
  useEffect(() => {
    if (!detail || detail.isLockedNow || detail.summary || generating || PROCESSING[detail.status] || detail.status === 'recording') return
    if (autoTried.current.has(detail.id)) return
    autoTried.current.add(detail.id)
    void generate(false)
  }, [detail, generating, generate])

  const loadDemo = async (): Promise<void> => {
    const r = await cv.demo.loadSession()
    if (r.ok) {
      toast.success('Demo session loaded 🗼', { description: 'A 3-minute Tokyo trip-planning session.' })
      emit('sessions:changed')
    } else toast.error('Could not load the demo', { description: r.error })
  }

  // ---------- Empty ----------
  if (sessions && sessions.length === 0) {
    return (
      <Page>
        <div className="mx-auto mt-10 max-w-xl">
          <EmptyState
            emoji="🧠"
            title="No memories to summarize yet"
            description="Record a session (up to 3 minutes) and Claude will turn it into a TL;DR, key points, a timeline and action items — then you can ask it anything."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="gradient" onClick={() => emit('recording:open')}>
                  <Mic /> Record your first memory
                </Button>
                <Button variant="outline" onClick={() => void loadDemo()}>
                  <FlaskConical /> Load demo session
                </Button>
              </div>
            }
          />
        </div>
      </Page>
    )
  }

  const processing = detail ? PROCESSING[detail.status] : undefined
  const showSkeleton = !detail || detailLoading || generating || (!detail.summary && !!processing) || (!detail.summary && detail.status !== 'error')
  const panelHeight = Math.max(480, areaH - 48)

  return (
    <Page className="pb-6">
      <div ref={rootRef} className="flex items-start gap-6">
        {/* Left: summary */}
        <div className="min-w-0 flex-1 pb-4">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet">
                <Wand2 className="size-3.5" /> Summary &amp; Ask Claude
              </div>
              {detail ? (
                <motion.h1 key={detail.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="line-clamp-2 text-[28px] font-bold leading-tight text-ink">
                  {detail.title}
                </motion.h1>
              ) : (
                <Skeleton className="mt-1 h-8 w-72" />
              )}
              {detail && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 font-medium shadow-soft">
                    <CalendarDays className="size-3.5 text-violet" /> {formatDate(detail.startedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 font-medium shadow-soft">
                    <Clock className="size-3.5 text-pink" /> {formatDuration(detail.durationS)}
                  </span>
                  {detail.isDemo && <Badge variant="orange">Demo session</Badge>}
                  {processing && (
                    <Badge variant="cyan" className="animate-pulse">
                      {detail.status}…
                    </Badge>
                  )}
                  {detail.status === 'error' && <Badge variant="danger">Processing hit a snag</Badge>}
                  <AccessBadges access={detail.access} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-1">
              <SessionPicker sessions={sessions ?? []} value={selected} onChange={(id) => setParams(id == null ? {} : { session: String(id) })} />
              <Button variant="outline" onClick={() => setAccessOpen(true)} disabled={!detail} title="Choose who can access this session" data-testid="open-access">
                <ShieldCheck /> Access
              </Button>
              <Button variant="outline" onClick={() => void generate(true)} disabled={!detail || detail.isLockedNow || generating || !!processing} title="Ask Claude for a fresh summary">
                <RefreshCw className={generating ? 'animate-spin' : ''} /> Regenerate
              </Button>
            </div>
          </div>

          {detail?.isLockedNow ? (
            <div className="glass rounded-3xl p-10">
              <UnlockForm session={detail} onUnlocked={() => void loadDetail(detail.id)} />
            </div>
          ) : showSkeleton || !detail?.summary ? (
            detail && !detail.summary && detail.status === 'error' && !generating ? (
              <div className="glass rounded-2xl p-6 text-sm text-ink-soft">
                <p className="mb-3 font-semibold text-ink">We couldn't process this session automatically.</p>
                <Button variant="gradient" onClick={() => void generate(true)}>
                  <Sparkles /> Try summarizing again
                </Button>
              </div>
            ) : (
              <SummarySkeleton message={processing} />
            )
          ) : (
            <>
              <SummaryView detail={detail} summary={detail.summary} />
              <div className="mt-4">
                <FeedbackCard sessionId={detail.id} />
              </div>
            </>
          )}
        </div>

        {/* Right: Ask Claude */}
        <aside className="sticky top-6 w-[400px] shrink-0" style={{ height: panelHeight }}>
          {resolvedId != null ? (
            <AskPanel sessionId={resolvedId} detail={detail && detail.id === resolvedId ? detail : null} firstName={firstName} />
          ) : (
            <div className="glass h-full space-y-3 rounded-3xl p-5">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-16" />
            </div>
          )}
        </aside>
      </div>
      {detail && <AccessDialog session={detail} open={accessOpen} onOpenChange={setAccessOpen} onChanged={() => void loadDetail(detail.id)} />}
    </Page>
  )
}
