import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] overflow-hidden cursor-pointer [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        gradient: 'bg-grad grad-animate text-white shadow-glow-violet hover:shadow-glow-pink hover:-translate-y-0.5 shimmer',
        default: 'bg-ink text-white hover:bg-ink/90 shadow-soft',
        outline: 'border border-line bg-white/70 text-ink hover:bg-white hover:border-violet/30 hover:text-violet',
        ghost: 'text-ink-soft hover:bg-violet/8 hover:text-violet',
        soft: 'bg-violet/10 text-violet hover:bg-violet/15',
        danger: 'bg-danger text-white hover:bg-danger/90 shadow-[0_10px_30px_-10px_rgb(239_68_68/0.6)]',
        link: 'text-violet underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-xs rounded-lg',
        lg: 'h-12 px-6 text-base rounded-2xl',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = 'Button'
export { buttonVariants }
