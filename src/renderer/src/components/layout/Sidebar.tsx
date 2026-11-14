// OWNER: orchestrator
import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Archive, Brush, CreditCard, LifeBuoy, LogOut, Settings, Sparkles } from 'lucide-react'
import { VaultMark, Wordmark } from '@/components/common/Logo'
import { GradientAvatar } from '@/components/common/Avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth, useUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

const MAIN = [
  { to: '/app/vault', label: 'My Vault', icon: Archive, hint: 'Library' },
  { to: '/app/cleanup', label: 'Clean Up', icon: Brush, hint: 'Free space' },
  { to: '/app/summary', label: 'Summary & Ask', icon: Sparkles, hint: 'Ask Claude' }
]
const MORE = [
  { to: '/app/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/app/support', label: 'Support', icon: LifeBuoy },
  { to: '/app/settings', label: 'Settings', icon: Settings }
]

function Item({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Archive; hint?: string }): React.JSX.Element {
  const { pathname } = useLocation()
  const active = pathname.startsWith(to)
  return (
    <NavLink to={to} className="no-drag relative block">
      {active && (
        <motion.div layoutId="nav-active" className="absolute inset-0 rounded-xl bg-grad shadow-glow-violet" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
      )}
      <div className={cn('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors', active ? 'text-white' : 'text-ink-soft hover:bg-violet/8 hover:text-ink')}>
        <Icon className="size-[18px]" />
        <span className="flex-1">{label}</span>
      </div>
    </NavLink>
  )
}

export function Sidebar(): React.JSX.Element {
  const user = useUser()
  const { signOut } = useAuth()
  const planVariant = user.plan === 'free' ? 'outline' : 'gradient'
  return (
    <aside className="drag relative z-10 flex h-full w-[248px] shrink-0 flex-col border-r border-line/70 px-4 pb-4 pt-10" style={{ background: 'var(--cv-sidebar)' }}>
      <div className="no-drag mb-8 flex items-center gap-2.5 px-2">
        <VaultMark size={36} />
        <Wordmark className="text-lg" />
      </div>
      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Workspace</div>
      <nav className="flex flex-col gap-1">{MAIN.map((i) => <Item key={i.to} {...i} />)}</nav>
      <div className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">Account</div>
      <nav className="flex flex-col gap-1">{MORE.map((i) => <Item key={i.to} {...i} />)}</nav>
      <div className="flex-1" />
      <div className="no-drag glass flex items-center gap-3 rounded-2xl p-3">
        <GradientAvatar name={user.name} color={user.avatarColor} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{user.name}</div>
          <Badge variant={planVariant} className="mt-0.5 capitalize">
            {user.plan === 'free' ? 'Free' : user.plan === 'pro' ? 'Pro ✨' : 'Team 🚀'}
          </Badge>
        </div>
        <button onClick={() => void signOut()} title="Log out" className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-pink/10 hover:text-pink cursor-pointer">
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  )
}
