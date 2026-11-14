import * as React from 'react'
import * as C from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Checkbox({ className, ...p }: React.ComponentPropsWithoutRef<typeof C.Root>): React.JSX.Element {
  return (
    <C.Root
      className={cn(
        'peer size-5 shrink-0 rounded-md border-2 border-violet/30 bg-white transition-all cursor-pointer',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-grad data-[state=checked]:text-white hover:border-violet/60',
        className
      )}
      {...p}
    >
      <C.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  )
}
