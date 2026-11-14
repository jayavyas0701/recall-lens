// OWNER: orchestrator. Per-session privacy controls: who/what may access a recording.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, EyeOff, Lock, LockOpen, Plug, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { SessionAccess, SessionRow } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cv } from '@/lib/api'
import { emit } from '@/lib/events'
import { cn } from '@/lib/utils'

const ROWS: { key: keyof SessionAccess; icon: typeof Bot; title: string; on: string; off: string }[] = [
  { key: 'ai', icon: Bot, title: 'Claude AI access', on: 'Transcript & screenshots can be sent to Claude for summaries, answers and screen descriptions.', off: 'Nothing from this session is sent to Claude. Summaries and answers run on-device.' },
  { key: 'mcp', icon: Plug, title: 'Claude Desktop (MCP)', on: 'Other assistants connected to your vault can read this session.', off: 'Hidden from Claude Desktop and every MCP client.' },
  { key: 'search', icon: Search, title: 'Show in search', on: 'Appears in ⌘K search results.', off: 'Never appears in search results.' },
  { key: 'locked', icon: Lock, title: 'Lock with my password', on: 'Transcript, summary and playback are hidden until you re-enter your password.', off: 'Anyone using this signed-in app can open it.' }
]

/** Small icons showing which protections are active. */
export function AccessBadges({ access, className }: { access: SessionAccess; className?: string }): React.JSX.Element | null {
  const items = [
    access.locked && { icon: Lock, label: 'Locked', cls: 'bg-ink/80 text-white' },
    !access.ai && { icon: EyeOff, label: 'No AI', cls: 'bg-pink/15 text-pink' },
    !access.mcp && { icon: Plug, label: 'No MCP', cls: 'bg-violet/12 text-violet' },
    !access.search && { icon: Search, label: 'Unsearchable', cls: 'bg-orange/15 text-[#b45309]' }
  ].filter(Boolean) as { icon: typeof Lock; label: string; cls: string }[]
  if (!items.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {items.map((i) => (
        <span key={i.label} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', i.cls)} title={i.label}>
          <i.icon className="size-3" /> {i.label}
        </span>
      ))}
    </div>
  )
}

/** Access settings dialog for one session. */
export function AccessDialog({ session, open, onOpenChange, onChanged }: { session: SessionRow; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: (s: SessionRow) => void }): React.JSX.Element {
  const [busy, setBusy] = useState<keyof SessionAccess | null>(null)
  const [s, setS] = useState(session)
  useEffect(() => setS(session), [session])

  const toggle = async (key: keyof SessionAccess, value: boolean): Promise<void> => {
    setBusy(key)
    try {
      const r = await cv.sessions.setAccess(s.id, { [key]: value })
      if (!r.ok || !r.data) return void toast.error(r.error ?? 'Could not update access')
      setS(r.data)
      onChanged?.(r.data)
      emit('sessions:changed')
      const msg: Record<string, string> = {
        ai: value ? 'Claude can read this session' : 'Claude access off: this session stays on-device',
        mcp: value ? 'Claude Desktop can read this session' : 'Hidden from Claude Desktop / MCP',
        search: value ? 'Shown in search' : 'Hidden from search',
        locked: value ? 'Locked 🔒 Press “Lock now” or restart to hide it' : 'Lock removed'
      }
      toast.success(msg[key])
    } finally {
      setBusy(null)
    }
  }

  const lockNow = async (): Promise<void> => {
    const r = await cv.sessions.relock(s.id)
    if (!r.ok || !r.data) return void toast.error(r.error ?? 'Could not lock')
    setS(r.data)
    onChanged?.(r.data)
    emit('sessions:changed')
    toast.success('Session locked 🔒')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-grad text-white shadow-glow-violet">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle>Who can access this session?</DialogTitle>
          <DialogDescription className="line-clamp-1">“{s.title}”: you decide, per recording. Changes apply instantly.</DialogDescription>
        </DialogHeader>
        {s.isLockedNow ? (
          <UnlockForm session={s} onUnlocked={(u) => (setS(u), onChanged?.(u))} />
        ) : (
          <div className="flex flex-col gap-2">
            {ROWS.map((row) => {
              const on = s.access[row.key]
              return (
                <motion.label
                  key={row.key}
                  layout={false}
                  className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors', on ? 'border-violet/25 bg-violet/5' : 'border-line bg-white/70')}
                >
                  <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl', on ? 'bg-grad text-white' : 'bg-ink/6 text-ink-soft')}>
                    <row.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{row.title}</span>
                    <span className="block text-xs leading-relaxed text-ink-soft">{on ? row.on : row.off}</span>
                  </span>
                  <Switch checked={on} disabled={busy != null} onCheckedChange={(v) => void toggle(row.key, v)} aria-label={row.title} data-testid={`access-${row.key}`} />
                </motion.label>
              )
            })}
            {s.access.locked && (
              <Button variant="default" className="mt-1" onClick={() => void lockNow()}>
                <Lock /> Lock now
              </Button>
            )}
            <p className="mt-1 text-[11px] text-ink-faint">Audio and video files never leave this device, whatever you choose here.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Password prompt to unlock a locked session for this app run. */
export function UnlockForm({ session, onUnlocked, compact }: { session: SessionRow; onUnlocked: (s: SessionRow) => void; compact?: boolean }): React.JSX.Element {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await cv.sessions.unlock(session.id, pw)
      if (!r.ok || !r.data) return setErr(r.error ?? 'Could not unlock')
      setPw('')
      toast.success('Unlocked 🔓', { description: 'It locks again when you press “Lock now” or restart the app.' })
      onUnlocked(r.data)
      emit('sessions:changed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className={cn('flex flex-col items-center text-center', compact ? 'gap-2' : 'gap-3 py-2')}>
      <motion.div
        className="flex size-14 items-center justify-center rounded-2xl bg-ink text-white shadow-soft"
        animate={err ? { x: [0, -8, 8, -4, 0] } : { y: [0, -4, 0] }}
        transition={err ? { duration: 0.35 } : { duration: 3, repeat: Infinity }}
      >
        <Lock className="size-6" />
      </motion.div>
      <div>
        <div className="font-display text-lg font-bold text-ink">This session is locked</div>
        <div className="text-xs text-ink-soft">Enter your Context Vault password to view it.</div>
      </div>
      <div className="flex w-full max-w-sm gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Your password"
          autoFocus
          data-testid="unlock-password"
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm focus:border-violet/50 focus:outline-none focus:ring-4 focus:ring-violet/10"
        />
        <Button type="submit" variant="gradient" disabled={busy || !pw}>
          {busy ? <Sparkles className="animate-spin" /> : <LockOpen />} Unlock
        </Button>
      </div>
      {err && <div className="text-xs font-semibold text-danger">{err}</div>}
    </form>
  )
}
