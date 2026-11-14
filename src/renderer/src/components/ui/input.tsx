import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-xl border border-line bg-white/80 px-3.5 text-sm text-ink placeholder:text-ink-faint transition-all',
      'focus:outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10 disabled:opacity-50',
      className
    )}
    {...p}
  />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[90px] w-full rounded-xl border border-line bg-white/80 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all resize-none',
      'focus:outline-none focus:border-violet/50 focus:ring-4 focus:ring-violet/10',
      className
    )}
    {...p}
  />
))
Textarea.displayName = 'Textarea'

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element => (
  <label className={cn('text-xs font-semibold uppercase tracking-wide text-ink-soft', className)} {...p} />
)
