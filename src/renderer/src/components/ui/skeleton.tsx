import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-violet/8', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer-x_1.4s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  )
}
