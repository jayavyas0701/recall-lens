// OWNER: orchestrator. Gradient initials avatar.
import { cn, GRADIENTS, initials } from '@/lib/utils'

export function GradientAvatar({ name, color, size = 40, className }: { name: string; color: string; size?: number; className?: string }): React.JSX.Element {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white shadow-soft ring-2 ring-white', className)}
      style={{ width: size, height: size, background: GRADIENTS[color] ?? GRADIENTS.violet, fontSize: size * 0.38 }}
    >
      {initials(name) || '?'}
    </div>
  )
}
