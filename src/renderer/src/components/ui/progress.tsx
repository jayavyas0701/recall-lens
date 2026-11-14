import { cn } from '@/lib/utils'

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }): React.JSX.Element {
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-violet/10', className)}>
      <div className={cn('h-full rounded-full bg-grad transition-all duration-700 ease-out', barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
