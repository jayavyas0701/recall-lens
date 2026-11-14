// OWNER: subagent D. Profile: name + avatar gradient.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, Loader2, Mail, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { GradientAvatar } from '@/components/common/Avatar'
import { cv } from '@/lib/api'
import { useUser } from '@/lib/auth'
import { emit } from '@/lib/events'
import { cn, GRADIENTS, logError } from '@/lib/utils'
import { Section } from './Section'

export function ProfileSection(): React.JSX.Element {
  const user = useUser()
  const [name, setName] = useState(user.name)
  const [color, setColor] = useState(user.avatarColor)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(user.name)
    setColor(user.avatarColor)
  }, [user.name, user.avatarColor])

  const dirty = name.trim() !== user.name || color !== user.avatarColor
  const save = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('Your name can’t be empty.')
      return
    }
    setBusy(true)
    try {
      const r = await cv.auth.updateProfile({ name: name.trim(), avatarColor: color })
      if (!r.ok) throw new Error(r.error)
      emit('user:changed')
      toast.success('Profile saved ✨', { description: 'Looking good!' })
    } catch (e) {
      logError('updateProfile failed', e)
      toast.error('Couldn’t save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section icon={<UserRound />} title="Profile" description="How you show up in Context Vault.">
      <div className="flex items-center gap-5">
        <motion.div key={color} initial={{ scale: 0.85, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
          <GradientAvatar name={name || user.name} color={color} size={72} className="ring-4" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg font-bold text-ink">{name || user.name}</span>
            <Badge variant={user.plan === 'free' ? 'outline' : 'gradient'}>{user.plan === 'free' ? 'Free' : user.plan === 'pro' ? 'Pro ✨' : 'Team 🚀'}</Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
            <Mail className="size-3.5" />
            <span className="selectable truncate">{user.email}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cv-name">Name</Label>
          <Input id="cv-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && dirty && void save()} maxLength={60} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Avatar color</Label>
          <div className="flex h-11 items-center gap-2">
            {Object.entries(GRADIENTS).map(([key, g]) => (
              <motion.button
                key={key}
                type="button"
                title={key}
                aria-label={`${key} avatar`}
                aria-pressed={color === key}
                onClick={() => setColor(key)}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-white ring-offset-2 transition-shadow cursor-pointer',
                  color === key ? 'ring-2 ring-violet/60' : 'ring-0'
                )}
                style={{ background: g }}
              >
                {color === key && <Check className="size-4" strokeWidth={3} />}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="gradient" onClick={() => void save()} disabled={!dirty || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Save profile
        </Button>
      </div>
    </Section>
  )
}
