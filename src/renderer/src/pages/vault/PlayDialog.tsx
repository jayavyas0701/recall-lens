// OWNER: subagent A. In-app player for a session (video + synced mic audio, or audio only, or transcript for demo sessions).
import { useEffect, useRef, useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import type { SessionDetail, SessionRow } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cv } from '@/lib/api'
import { DIALOG_POP } from '@/features/recording/dialogFix'
import { formatClock, formatDate, formatDuration, logError } from '@/lib/utils'

/** MediaRecorder WebM files have no duration header; nudge Chromium to compute it so the scrubber works. */
function fixWebmDuration(el: HTMLMediaElement): void {
  const onMeta = (): void => {
    if (el.duration === Infinity || Number.isNaN(el.duration)) {
      const reset = (): void => {
        el.removeEventListener('timeupdate', reset)
        el.currentTime = 0
      }
      el.addEventListener('timeupdate', reset)
      el.currentTime = 1e101
    }
  }
  el.addEventListener('loadedmetadata', onMeta, { once: true })
}

export function PlayDialog({ session, onOpenChange, onOpenSummary }: { session: SessionRow | null; onOpenChange: (o: boolean) => void; onOpenSummary: (id: number) => void }): React.JSX.Element {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!session) return setDetail(null)
    setLoading(true)
    cv.sessions
      .get(session.id)
      .then(setDetail)
      .catch((e) => logError('session detail failed', e))
      .finally(() => setLoading(false))
  }, [session])

  // Keep the separate mic track in sync with the screen video.
  useEffect(() => {
    const v = videoRef.current
    const a = audioRef.current
    if (v) fixWebmDuration(v)
    if (a) fixWebmDuration(a)
    if (!v || !a) return
    const play = (): void => void a.play().catch(() => undefined)
    const pause = (): void => a.pause()
    const seek = (): void => {
      if (Math.abs(a.currentTime - v.currentTime) > 0.3) a.currentTime = v.currentTime
    }
    v.addEventListener('play', play)
    v.addEventListener('pause', pause)
    v.addEventListener('seeked', seek)
    v.addEventListener('timeupdate', seek)
    return () => {
      v.removeEventListener('play', play)
      v.removeEventListener('pause', pause)
      v.removeEventListener('seeked', seek)
      v.removeEventListener('timeupdate', seek)
    }
  }, [session, detail])

  const s = session
  const hasMedia = !!(s && (s.screenPath || s.audioPath))
  const segments = detail?.segments ?? []

  return (
    <Dialog open={!!s} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-[760px] ${DIALOG_POP}`} onOpenAutoFocus={(e) => e.preventDefault()}>
        {s && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                <span className="truncate">{s.title}</span>
                {s.isDemo && <Badge variant="gradient">Demo</Badge>}
              </DialogTitle>
              <DialogDescription>
                {formatDate(s.startedAt)} · {formatDuration(s.durationS)}
              </DialogDescription>
            </DialogHeader>

            {hasMedia ? (
              <div className="overflow-hidden rounded-2xl bg-ink">
                {s.screenPath ? (
                  <video ref={videoRef} src={cv.storage.mediaUrl(s.screenPath)} controls autoPlay className="aspect-video w-full bg-ink" />
                ) : (
                  <div className="flex flex-col items-center gap-4 bg-grad px-6 py-8">
                    <div className="flex h-16 items-end gap-1">
                      {Array.from({ length: 28 }).map((_, i) => (
                        <span
                          key={i}
                          className="w-1.5 rounded-full bg-white/80"
                          style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%`, animation: `float ${1.2 + (i % 5) * 0.2}s ease-in-out infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {s.audioPath && (
                  <audio
                    ref={audioRef}
                    src={cv.storage.mediaUrl(s.audioPath)}
                    controls={!s.screenPath}
                    autoPlay={!s.screenPath}
                    className={s.screenPath ? 'hidden' : 'w-full bg-white p-2'}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-violet/15 bg-violet/5 px-4 py-3 text-sm text-ink-soft">
                <Sparkles className="size-4 shrink-0 text-violet" />
                {s.isDemo ? 'Demo sessions don’t have media files — here’s what was said instead.' : 'The media files for this session were cleaned up — the transcript is still here.'}
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft">
                <FileText className="size-3.5" /> Transcript
              </div>
              <div className="selectable max-h-[260px] space-y-1 overflow-y-auto pr-2">
                {loading && !detail ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-5 w-3/5" />
                  </div>
                ) : segments.length === 0 ? (
                  <p className="py-3 text-sm text-ink-faint">{s.status === 'ready' ? 'No speech was detected in this session.' : 'The transcript will appear here once it’s ready.'}</p>
                ) : (
                  segments.map((seg, i) => (
                    <div key={seg.id ?? i} className="flex gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-violet/5">
                      <span className="mt-0.5 shrink-0 rounded-md bg-pink/10 px-1.5 py-0.5 text-[11px] font-bold text-pink tabular-nums">{formatClock(seg.tStart)}</span>
                      <span className="text-ink">{seg.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="gradient" onClick={() => onOpenSummary(s.id)}>
                <Sparkles /> Open summary
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
