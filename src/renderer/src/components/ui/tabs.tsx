import * as React from 'react'
import * as T from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = T.Root
export const TabsList = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.List>): React.JSX.Element => (
  <T.List className={cn('inline-flex items-center gap-1 rounded-xl bg-violet/8 p-1', className)} {...p} />
)
export const TabsTrigger = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Trigger>): React.JSX.Element => (
  <T.Trigger
    className={cn(
      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-ink-soft transition-all cursor-pointer',
      'data-[state=active]:bg-white data-[state=active]:text-violet data-[state=active]:shadow-soft hover:text-ink',
      className
    )}
    {...p}
  />
)
export const TabsContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof T.Content>): React.JSX.Element => (
  <T.Content className={cn('focus:outline-none', className)} {...p} />
)
