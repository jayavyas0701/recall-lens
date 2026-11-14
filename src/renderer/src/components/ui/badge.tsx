import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-violet/10 text-violet',
      gradient: 'bg-grad text-white shadow-glow-violet',
      pink: 'bg-pink/10 text-pink',
      orange: 'bg-orange/15 text-[#b45309]',
      cyan: 'bg-cyan/12 text-[#0e7490]',
      lime: 'bg-lime/15 text-[#4d7c0f]',
      danger: 'bg-danger/10 text-danger',
      outline: 'border border-line text-ink-soft bg-white/60'
    }
  },
  defaultVariants: { variant: 'default' }
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...p }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />
}
