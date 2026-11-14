// OWNER: orchestrator. Split-screen splash + Sign In / Sign Up.
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Brain, Eye, EyeOff, Lock, Mail, MessageSquareText, Search, ShieldCheck, Sparkles, User as UserIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Aurora } from '@/components/common/Aurora'
import { VaultMark, Wordmark } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { cv } from '@/lib/api'
import { celebrate } from '@/lib/confetti'
import { cn } from '@/lib/utils'

const CHIPS = [
  { icon: Brain, text: 'Remembers what you said & saw' },
  { icon: Search, text: 'Search every word, instantly' },
  { icon: MessageSquareText, text: '“What did I say a minute ago?”' },
  { icon: ShieldCheck, text: 'Recordings never leave this device' },
  { icon: Sparkles, text: 'AI summaries by Claude' }
]

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const score = Math.min(4, s)
  return [
    { score, label: 'Too short', color: '#EF4444' },
    { score, label: 'Weak', color: '#F59E0B' },
    { score, label: 'Okay', color: '#EAB308' },
    { score, label: 'Strong', color: '#06B6D4' },
    { score, label: 'Vault-grade 💪', color: '#84CC16' }
  ][score]
}

function CyclingChips(): React.JSX.Element {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center gap-2.5">
      {[0, 1, 2].map((slot) => {
        const c = CHIPS[(i + slot * 2) % CHIPS.length]
        return (
          <div key={slot} className="flex h-10 items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${slot}-${c.text}`}
                initial={{ opacity: 0, y: 14, scale: 0.92, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { delay: slot * 0.12, type: 'spring', stiffness: 260, damping: 22 } }}
                exit={{ opacity: 0, y: -14, scale: 0.92, filter: 'blur(4px)', transition: { duration: 0.22, delay: slot * 0.08 } }}
                className="flex items-center gap-2 rounded-full border border-white/40 bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md"
              >
                <c.icon className="size-4" />
                {c.text}
              </motion.div>
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

export function AuthPage(): React.JSX.Element {
  const { setUser } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [welcome, setWelcome] = useState<string | null>(null)
  const st = useMemo(() => strength(password), [password])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const r = mode === 'signup' ? await cv.auth.signUp({ name, email, password }) : await cv.auth.signIn({ email, password })
      if (!r.ok || !r.data) {
        setError(r.error ?? 'Something went wrong')
        return
      }
      const user = r.data
      if (mode === 'signup') {
        celebrate()
        setWelcome(user.name.split(' ')[0])
        toast.success('Welcome to your Vault 🎉')
        setTimeout(() => setUser(user), 1700)
      } else {
        toast.success(`Welcome back, ${user.name.split(' ')[0]} 👋`)
        setUser(user)
      }
    } catch (err) {
      console.error('[ContextVault] auth failed', err)
      setError('Couldn’t reach the vault. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full">
      {/* LEFT: brand */}
      <div className="drag relative flex w-1/2 flex-col items-center justify-center overflow-hidden bg-[#1a1036]">
        <Aurora intensity={1.15} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0%,rgba(26,16,54,0.35)_70%)]" />
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="relative flex flex-col items-center">
          <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
            <VaultMark size={150} glow />
          </motion.div>
          <h1 className="mt-8 font-display text-5xl font-bold tracking-tight text-white drop-shadow-lg">Context Vault</h1>
          <p className="mt-3 text-xl font-medium text-white/90">Your memory, on demand.</p>
          <div className="mt-10">
            <CyclingChips />
          </div>
        </motion.div>
        <div className="absolute bottom-6 text-xs font-medium text-white/60">Private by design · recordings stay on this device</div>
      </div>

      {/* RIGHT: form */}
      <div className="drag relative flex w-1/2 items-center justify-center bg-gradient-to-br from-white via-[#faf7ff] to-[#fff5fb]">
        <div className="pointer-events-none absolute right-10 top-16 size-72 rounded-full bg-pink/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 left-10 size-72 rounded-full bg-cyan/20 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="no-drag relative w-[440px] overflow-hidden rounded-[28px] border border-white bg-white/70 p-8 shadow-[0_30px_80px_-20px_rgb(124_58_237/0.35)] backdrop-blur-2xl"
        >
          <AnimatePresence>
            {welcome && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-xl">
                <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }} className="text-6xl">
                  🎉
                </motion.div>
                <h2 className="mt-4 font-display text-3xl font-bold text-ink">Welcome to your Vault</h2>
                <p className="mt-1 text-ink-soft">Let’s set things up, {welcome}.</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mb-6 flex items-center gap-2.5">
            <VaultMark size={32} />
            <Wordmark className="text-lg" />
          </div>

          <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-violet/8 p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={cn('relative z-10 rounded-xl py-2.5 text-sm font-bold transition-colors cursor-pointer', mode === m ? 'text-violet' : 'text-ink-soft hover:text-ink')}
              >
                {mode === m && <motion.div layoutId="auth-tab" className="absolute inset-0 -z-10 rounded-xl bg-white shadow-soft" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <h2 className="font-display text-2xl font-bold text-ink">{mode === 'signup' ? 'Create your vault' : 'Welcome back'}</h2>
          <p className="mb-6 mt-1 text-sm text-ink-soft">{mode === 'signup' ? 'It takes 20 seconds. Everything stays local.' : 'Sign in to pick up where you left off.'}</p>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div key="name" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <Label htmlFor="name">Your name</Label>
                  <div className="relative mt-1.5">
                    <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Shilpa" className="pl-10" autoFocus />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                <Input id="pw" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="pl-10 pr-11" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-faint hover:bg-violet/8 hover:text-violet cursor-pointer" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {mode === 'signup' && (
                <div className="mt-2.5">
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div key={i} className="h-1.5 flex-1 rounded-full bg-ink/8" animate={{ backgroundColor: password && i < Math.max(1, st.score) ? st.color : 'rgba(30,27,58,0.08)' }} />
                    ))}
                  </div>
                  <div className="mt-1 text-xs font-semibold" style={{ color: password ? st.color : '#9a97b3' }}>
                    {password ? st.label : 'Use 8+ characters with a mix of letters, numbers & symbols'}
                  </div>
                </div>
              )}
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} className="rounded-xl bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" variant="gradient" size="lg" disabled={busy} className="mt-1 w-full">
              {busy ? 'Opening your vault…' : mode === 'signup' ? 'Create my vault' : 'Sign in'}
              {!busy && <ArrowRight />}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-ink-faint">Your password is hashed with bcrypt and stored only on this device.</p>
        </motion.div>
      </div>
    </div>
  )
}
