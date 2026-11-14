// OWNER: orchestrator. Current-user context.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppInfo, User } from '@shared/types'
import { cv } from './api'
import { on } from './events'

interface AuthCtx {
  user: User | null
  info: AppInfo | null
  loading: boolean
  setUser: (u: User | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [u, i] = await Promise.all([cv.auth.current(), cv.app.info()])
    setUser(u)
    setInfo(i)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
    return on('user:changed', () => void refresh())
  }, [refresh])

  const signOut = useCallback(async () => {
    await cv.auth.signOut()
    setUser(null)
  }, [])

  return <Ctx.Provider value={{ user, info, loading, setUser, refresh, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}

/** Use inside the main app where a user is guaranteed. */
export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('No user')
  return user
}
