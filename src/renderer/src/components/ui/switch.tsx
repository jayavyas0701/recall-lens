import * as React from 'react'
import * as S from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({ className, ...p }: React.ComponentPropsWithoutRef<typeof S.Root>): React.JSX.Element {
  return (
    <S.Root
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-ink/15 transition-colors data-[state=checked]:bg-grad',
        className
      )}
      {...p}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </S.Root>
  )
}
