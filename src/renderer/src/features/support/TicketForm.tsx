// OWNER: subagent C (Support). Ticket form used in the chat widget and the Support page dialog.
import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { Priority, Ticket } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { cv } from '@/lib/api'
import { emit } from '@/lib/events'
import { cn, logError } from '@/lib/utils'
import { PRIORITY_META, firstName } from './meta'

export function PrioritySelect({ value, onChange, layoutGroup }: { value: Priority; onChange: (p: Priority) => void; layoutGroup: string }): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="Priority" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-white/70 p-1">
      {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
        const m = PRIORITY_META[p]
        const active = value === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={cn(
              'relative flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
              active ? 'text-white' : 'text-ink-soft hover:bg-violet/5'
            )}
          >
            {active && (
              <motion.span
                layoutId={`prio-${layoutGroup}`}
                className="absolute inset-0 rounded-lg"
                style={{
                  background: m.color,
                  boxShadow: `0 6px 18px -6px ${m.color}`
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              />
            )}
            <span className="relative">{m.emoji}</span>
            <span className="relative">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TicketForm({
  initialSubject = '',
  initialDescription = '',
  onCreated,
  onCancel,
  compact = false
}: {
  initialSubject?: string
  initialDescription?: string
  onCreated: (t: Ticket) => void
  onCancel?: () => void
  compact?: boolean
}): React.JSX.Element {
  const uid = useId()
  const [subject, setSubject] = useState(initialSubject)
  const [description, setDescription] = useState(initialDescription)
  const [priority, setPriority] = useState<Priority>('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    if (subject.trim().length < 3) return setError('Add a short subject so we know what it’s about.')
    if (description.trim().length < 5) return setError('Tell us a little more in the description.')
    setError(null)
    setBusy(true)
    try {
      const r = await cv.support.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        priority
      })
      if (!r.ok || !r.data) {
        setError(r.error ?? 'Could not create the ticket.')
        toast.error(r.error ?? 'Could not create the ticket.')
        return
      }
      const t = r.data
      toast.success(`Ticket #${t.code} created`, {
        description: t.agent ? `Assigned to ${firstName(t.agent.name)} · ${t.agent.specialty}` : undefined
      })
      emit('tickets:changed', t)
      onCreated(t)
    } catch (err) {
      logError('createTicket failed', err)
      setError('Something went wrong — please try again.')
      toast.error('Something went wrong creating your ticket.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-subject`}>Subject</Label>
        <Input
          id={`${uid}-subject`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Recording won’t start"
          maxLength={140}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-desc`}>Description</Label>
        <Textarea
          id={`${uid}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened? What did you expect?"
          className={compact ? 'min-h-[96px]' : 'min-h-[120px]'}
          maxLength={4000}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Priority</Label>
        <PrioritySelect value={priority} onChange={setPriority} layoutGroup={uid} />
      </div>
      {error && <p className="rounded-lg bg-danger/8 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
      <div className={cn('flex gap-2', compact ? 'mt-1' : 'mt-2 justify-end')}>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className={compact ? 'flex-1' : ''}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="gradient" disabled={busy} className={compact ? 'flex-[2]' : ''}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
          {busy ? 'Routing…' : 'Submit ticket'}
        </Button>
      </div>
    </form>
  )
}
