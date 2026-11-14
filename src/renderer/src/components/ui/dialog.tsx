import * as React from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof D.Content>): React.JSX.Element {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm data-[state=open]:animate-[fadeIn_.2s_ease]" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-[0_30px_80px_-20px_rgb(124_58_237/0.45)] border border-white',
          'data-[state=open]:animate-[popIn_.25s_cubic-bezier(.2,.9,.3,1.2)] focus:outline-none',
          className
        )}
        {...p}
      >
        {children}
        <D.Close className="absolute right-4 top-4 rounded-full p-1.5 text-ink-faint hover:bg-violet/10 hover:text-violet transition-colors cursor-pointer">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  )
}
export const DialogHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...p} />
)
export const DialogFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element => (
  <div className={cn('mt-6 flex justify-end gap-2', className)} {...p} />
)
export const DialogTitle = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Title>): React.JSX.Element => (
  <D.Title className={cn('font-display text-xl font-semibold text-ink', className)} {...p} />
)
export const DialogDescription = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Description>): React.JSX.Element => (
  <D.Description className={cn('text-sm text-ink-soft', className)} {...p} />
)
