// OWNER: subagent A. Tab 2 — "Clean Up": open the folder, storage meter, in-app file manager with recoverable delete.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowUpRight, Brush, FolderOpen, Mic, Monitor, PieChart as PieIcon, RotateCcw, Trash2 } from 'lucide-react'
import type { SessionRow, StorageStats, VaultFile } from '@shared/types'
import { Page, PageHeader, fadeUp, stagger } from '@/components/common/Page'
import { TiltCard } from '@/components/common/TiltCard'
import { CountUp } from '@/components/common/CountUp'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cv } from '@/lib/api'
import { DIALOG_POP } from '@/features/recording/dialogFix'
import { emit, useAppEvent } from '@/lib/events'
import { sparkle } from '@/lib/confetti'
import { cn, formatBytes, formatDate, logError } from '@/lib/utils'
import { StorageMeter } from './StorageMeter'

type Filter = 'all' | 'audio' | 'screen'

function Segmented({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Record<Filter, number> }): React.JSX.Element {
  const opts: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'audio', label: 'Audio' },
    { id: 'screen', label: 'Screen' }
  ]
  return (
    <div className="relative flex rounded-xl bg-violet/8 p-1" role="tablist">
      {opts.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('relative z-10 flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors', value === o.id ? 'text-white' : 'text-ink-soft hover:text-violet')}
        >
          {value === o.id && <motion.span layoutId="cv-cleanup-pill" className="absolute inset-0 -z-10 rounded-lg bg-grad shadow-glow-violet" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
          {o.label}
          <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', value === o.id ? 'bg-white/25' : 'bg-violet/10 text-violet')}>{counts[o.id]}</span>
        </button>
      ))}
    </div>
  )
}

function FreedOverlay({ bytes, onDone }: { bytes: number; onDone: () => void }): React.JSX.Element {
  const mb = bytes / (1024 * 1024)
  const big = mb >= 1
  useEffect(() => {
    sparkle(0.5, 0.45)
    const a = setTimeout(() => sparkle(0.35, 0.5), 250)
    const b = setTimeout(() => sparkle(0.65, 0.5), 500)
    const c = setTimeout(onDone, 3200)
    return () => [a, b, c].forEach(clearTimeout)
  }, [onDone])
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/10 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div
        initial={{ scale: 0.6, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="relative overflow-hidden rounded-[2rem] bg-white px-14 py-10 text-center shadow-[0_40px_100px_-30px_rgb(124_58_237/0.6)]"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-grad opacity-25 blur-3xl" />
        <motion.div className="relative text-5xl" animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.8 }}>
          🧹
        </motion.div>
        <p className="relative mt-3 text-sm font-bold uppercase tracking-[0.2em] text-ink-soft">Freed up</p>
        <p className="relative font-display text-6xl font-bold text-grad">
          <CountUp value={big ? mb : bytes / 1024} decimals={big ? 1 : 0} duration={1.4} suffix={big ? ' MB' : ' KB'} />
        </p>
        <p className="relative mt-2 text-sm text-ink-soft">Moved to your Trash — restore anytime.</p>
      </motion.div>
    </motion.div>
  )
}

export function CleanupPage(): React.JSX.Element {
  const [files, setFiles] = useState<VaultFile[] | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [titles, setTitles] = useState<Record<number, SessionRow>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [freed, setFreed] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [f, st, list] = await Promise.all([cv.files.list(), cv.storage.stats(), cv.sessions.list()])
      setFiles(f)
      setStats(st)
      setTitles(Object.fromEntries(list.map((s) => [s.id, s])))
      setSelected((sel) => new Set([...sel].filter((p) => f.some((x) => x.path === p))))
    } catch (e) {
      logError('cleanup load failed', e)
      setFiles((x) => x ?? [])
      toast.error('Couldn’t read your recordings folder')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useAppEvent('files:changed', load)
  useAppEvent('sessions:changed', load)

  const counts = useMemo(
    () => ({
      all: files?.length ?? 0,
      audio: files?.filter((f) => f.kind === 'audio').length ?? 0,
      screen: files?.filter((f) => f.kind === 'screen').length ?? 0
    }),
    [files]
  )
  const visible = useMemo(() => (files ?? []).filter((f) => filter === 'all' || f.kind === filter), [files, filter])
  const selectedFiles = useMemo(() => (files ?? []).filter((f) => selected.has(f.path)), [files, selected])
  const selectedBytes = selectedFiles.reduce((n, f) => n + f.sizeBytes, 0)
  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.path))
  const someVisibleSelected = visible.some((f) => selected.has(f.path))
  const affectedSessions = useMemo(() => {
    const ids = new Set(selectedFiles.map((f) => f.sessionId).filter((x): x is number => x != null))
    // A session disappears when all of its remaining files are selected.
    return [...ids].filter((id) => (files ?? []).filter((f) => f.sessionId === id).every((f) => selected.has(f.path)))
  }, [selectedFiles, files, selected])

  const toggle = (p: string): void =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })
  const toggleAll = (): void =>
    setSelected((s) => {
      const n = new Set(s)
      if (allVisibleSelected) visible.forEach((f) => n.delete(f.path))
      else visible.forEach((f) => n.add(f.path))
      return n
    })

  const openRoot = async (): Promise<void> => {
    const r = await cv.storage.openFolder('recordings')
    if (r.ok) toast.success('Opened your recordings folder 📂')
    else toast.error('Couldn’t open the folder', { description: r.error })
  }

  const doDelete = async (): Promise<void> => {
    setDeleting(true)
    const paths = selectedFiles.map((f) => f.path)
    try {
      const r = await cv.files.trash(paths)
      if (!r.ok || !r.data) {
        toast.error('Couldn’t move files to the Trash', { description: r.error })
        return
      }
      setConfirm(false)
      setSelected(new Set())
      // Let rows animate out immediately, then refresh from disk.
      setFiles((f) => (f ?? []).filter((x) => !paths.includes(x.path)))
      if (r.data.freedBytes > 0) setFreed(r.data.freedBytes)
      toast.success(`${r.data.trashed} ${r.data.trashed === 1 ? 'file' : 'files'} moved to the Trash`, {
        description: 'Changed your mind? Restore them from your system Trash.'
      })
      emit('files:changed')
      emit('sessions:changed')
    } catch (e) {
      logError('trash failed', e)
      toast.error('Couldn’t move files to the Trash')
    } finally {
      setDeleting(false)
    }
  }

  const closeFreed = useCallback(() => setFreed(null), [])
  const loading = !files || !stats

  return (
    <Page>
      <PageHeader title="Clean Up" subtitle="Free up space safely — deleted recordings go to your Trash, so nothing is lost by accident." icon={<Brush />} />

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-5 gap-5">
        {/* Open folder tile */}
        <motion.div variants={fadeUp} className="col-span-2">
          <TiltCard onClick={() => void openRoot()} max={7} className="h-full rounded-3xl">
            <div
              className="relative flex h-full min-h-[212px] flex-col overflow-hidden rounded-3xl p-6 text-white shadow-[0_24px_60px_-24px_rgb(6_182_212/0.6)]"
              style={{ background: 'linear-gradient(135deg,#06B6D4 0%,#7C3AED 70%,#A855F7 100%)' }}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-white/5 to-transparent" />
              <motion.div
                className="pointer-events-none absolute -bottom-6 -right-4 text-[120px] leading-none opacity-90 drop-shadow-xl"
                animate={{ y: [0, -8, 0], rotate: [0, -3, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              >
                📂
              </motion.div>
              <div className="relative flex size-11 items-center justify-center rounded-2xl bg-white/25 backdrop-blur">
                <FolderOpen className="size-5" />
              </div>
              <h3 className="relative mt-4 font-display text-2xl font-bold">Open recordings folder</h3>
              <p className="relative mt-1 max-w-[230px] text-sm text-white/85">See every audio, screen and transcript file in your file manager.</p>
              <span className="relative mt-auto inline-flex w-fit items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                Open in file manager <ArrowUpRight className="size-3.5" />
              </span>
            </div>
          </TiltCard>
        </motion.div>

        {/* Storage meter */}
        <motion.div variants={fadeUp} className="glass col-span-3 rounded-3xl p-5">
          <div className="mb-2 flex items-center gap-2">
            <PieIcon className="size-4 text-violet" />
            <h3 className="font-display text-base font-bold text-ink">Storage</h3>
          </div>
          {stats ? (
            <StorageMeter stats={stats} />
          ) : (
            <div className="flex items-center gap-6">
              <Skeleton className="size-[176px] rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* File manager */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass mt-5 overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-line/80 px-5 py-4">
          <h3 className="mr-2 font-display text-base font-bold text-ink">Recordings</h3>
          <Segmented value={filter} onChange={setFilter} counts={counts} />
          <div className="ml-auto flex items-center gap-3">
            <AnimatePresence>
              {selected.size > 0 && (
                <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} className="text-sm text-ink-soft">
                  <span className="font-bold text-ink">{selected.size}</span> selected · {formatBytes(selectedBytes)}
                </motion.span>
              )}
            </AnimatePresence>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <RotateCcw /> Clear
              </Button>
            )}
            <Button variant="danger" size="sm" disabled={selected.size === 0} onClick={() => setConfirm(true)}>
              <Trash2 /> Delete{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-[36px_minmax(0,1fr)_96px_96px_150px_40px] items-center gap-3 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          <Checkbox
            checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
            onCheckedChange={toggleAll}
            disabled={visible.length === 0}
            aria-label="Select all"
          />
          <span>Name</span>
          <span>Type</span>
          <span className="text-right">Size</span>
          <span>Date</span>
          <span />
        </div>

        <div className="max-h-[440px] overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="space-y-2 px-3 py-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="text-4xl">✨</div>
              <p className="mt-2 font-display text-lg font-bold text-ink">{counts.all === 0 ? 'Squeaky clean!' : `No ${filter} files`}</p>
              <p className="mt-1 text-sm text-ink-soft">{counts.all === 0 ? 'There are no recordings on disk right now.' : 'Try another filter.'}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {visible.map((f, i) => {
                const on = selected.has(f.path)
                const session = f.sessionId != null ? titles[f.sessionId] : undefined
                return (
                  <motion.div
                    key={f.path}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
                    exit={{ opacity: 0, x: 60, height: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.35 } }}
                    onClick={() => toggle(f.path)}
                    className={cn(
                      'group grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_96px_96px_150px_40px] items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 transition-colors',
                      on ? 'bg-violet/8' : 'hover:bg-violet/[0.04]'
                    )}
                  >
                    <span onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={on} onCheckedChange={() => toggle(f.path)} aria-label={`Select ${f.name}`} />
                    </span>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl text-white', f.kind === 'audio' ? 'bg-grad-warm' : 'bg-grad-cool')}>
                        {f.kind === 'audio' ? <Mic className="size-4" /> : <Monitor className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink" title={f.name}>
                          {f.name}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">{session ? session.title : f.sessionId != null ? 'Linked session' : 'Not linked to a session'}</span>
                      </span>
                    </span>
                    <span>
                      <Badge variant={f.kind === 'audio' ? 'pink' : 'cyan'}>{f.kind === 'audio' ? 'Audio' : 'Screen'}</Badge>
                    </span>
                    <span className="text-right text-sm font-semibold text-ink tabular-nums">{formatBytes(f.sizeBytes)}</span>
                    <span className="text-sm text-ink-soft">{formatDate(f.modifiedAt)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void cv.storage.showItem(f.path)
                        toast.success('Showing it in your file manager 📂')
                      }}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint opacity-0 transition-all hover:bg-violet/10 hover:text-violet group-hover:opacity-100"
                      aria-label="Show in folder"
                      title="Show in folder"
                    >
                      <FolderOpen className="size-4" />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* Confirm */}
      <Dialog open={confirm} onOpenChange={(o) => !deleting && setConfirm(o)}>
        <DialogContent className={DIALOG_POP}>
          <DialogHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
              <Trash2 className="size-6" />
            </div>
            <DialogTitle>
              Move {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} to the Trash?
            </DialogTitle>
            <DialogDescription>
              This frees up <span className="font-semibold text-ink">{formatBytes(selectedBytes)}</span>. You can restore the files from your system Trash.
            </DialogDescription>
          </DialogHeader>
          {affectedSessions.length > 0 && (
            <div className="rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-ink">
              {affectedSessions.length === 1 ? '1 session has' : `${affectedSessions.length} sessions have`} no recordings left after this, so{' '}
              {affectedSessions.length === 1 ? 'it' : 'they'} will be removed from your vault along with screenshots and transcript.
              <ul className="mt-1.5 list-inside list-disc text-xs text-ink-soft">
                {affectedSessions.slice(0, 4).map((id) => (
                  <li key={id} className="truncate">
                    {titles[id]?.isDemo ? `${titles[id]?.title} (demo — kept)` : (titles[id]?.title ?? `Session #${id}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void doDelete()} disabled={deleting}>
              <Trash2 /> {deleting ? 'Moving…' : 'Move to Trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>{freed != null && <FreedOverlay bytes={freed} onDone={closeFreed} />}</AnimatePresence>
    </Page>
  )
}
