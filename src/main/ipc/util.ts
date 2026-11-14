// OWNER: orchestrator. Helpers for registering IPC handlers with consistent error handling.
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { log } from '../log'
import type { Result } from '../../shared/types'

/** Register a handler. Errors are logged and re-thrown to the renderer. */
export function handle<A extends unknown[], R>(
  channel: string,
  fn: (...args: A) => R | Promise<R>
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await fn(...(args as A))
    } catch (e) {
      log.error(`IPC ${channel} failed:`, e)
      throw e
    }
  })
}

/** Register a handler returning Result<T>. Errors become { ok:false, error }. */
export function handleResult<A extends unknown[], T>(
  channel: string,
  fn: (...args: A) => Result<T> | Promise<Result<T>>
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_e: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await fn(...(args as A))
    } catch (e) {
      log.error(`IPC ${channel} failed:`, e)
      return { ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Result<T>
    }
  })
}

/** Like handle() but gives access to the invoking event (for streaming back to the sender). */
export function handleWithEvent<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await fn(e, ...(args as A))
    } catch (err) {
      log.error(`IPC ${channel} failed:`, err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export const ok = <T>(data?: T): Result<T> => ({ ok: true, data })
export const fail = <T = undefined>(error: string): Result<T> => ({ ok: false, error })
