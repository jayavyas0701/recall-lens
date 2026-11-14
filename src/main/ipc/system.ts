// OWNER: orchestrator. App info, permissions, storage folder & OS shell helpers.
import { app, dialog, shell, systemPreferences, BrowserWindow } from 'electron'
import { readdirSync, statSync, statfsSync, existsSync } from 'fs'
import { join } from 'path'
import { release } from 'os'
import { CH, type AppInfo, type FolderKind, type PermissionStatus, type PermState, type StorageStats } from '../../shared/types'
import { env, saveEnvValue } from '../env'
import Anthropic from '@anthropic-ai/sdk'
import { log } from '../log'
import { DB_PATH, getPaths, isServablePath, setStorageRoot } from '../paths'
import { handle, handleResult, ok, fail } from './util'

function mediaStatus(kind: 'microphone' | 'screen'): PermState {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    try {
      return systemPreferences.getMediaAccessStatus(kind) as PermState
    } catch {
      return 'unknown'
    }
  }
  return 'granted' // Linux: no OS-level gate; Chromium handles it.
}

export function systemAudioSupport(): PermissionStatus['systemAudio'] {
  if (process.platform === 'win32') return 'supported'
  if (process.platform === 'darwin') return Number(release().split('.')[0]) >= 22 ? 'experimental' : 'unavailable' // macOS 13+
  return 'unavailable'
}

export function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    try {
      total += e.isDirectory() ? dirSize(p) : statSync(p).size
    } catch {
      /* ignore */
    }
  }
  return total
}

export function registerSystem(): void {
  const info = (): AppInfo => ({
    hasAnthropicKey: !!env.anthropicKey,
    hasOpenAIKey: !!env.openaiKey,
    platform: process.platform,
    storageRoot: getPaths().root,
    dbPath: DB_PATH,
    version: app.getVersion()
  })
  handle(CH.appInfo, info)

  handleResult(CH.appSetAnthropicKey, async (raw: string) => {
    const key = (raw ?? '').trim()
    if (!key) {
      saveEnvValue('ANTHROPIC_API_KEY', '')
      return ok(info())
    }
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return fail('That doesn’t look like an Anthropic API key (it should start with “sk-ant-”).')
    try {
      // Cheap check that the key is accepted — no tokens used.
      await new Anthropic({ apiKey: key, timeout: 15_000, maxRetries: 0 }).models.list({ limit: 1 })
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 401 || status === 403) return fail('Anthropic rejected this key. Double-check it in the Claude Console.')
      log.warn('Could not verify API key (saving anyway):', status ?? (e as Error).message)
    }
    saveEnvValue('ANTHROPIC_API_KEY', key)
    log.info('Anthropic API key saved to ~/ContextVault/.env (length', key.length, ')')
    return ok(info())
  })

  handle(CH.permsStatus, (): PermissionStatus => ({
    microphone: mediaStatus('microphone'),
    screen: mediaStatus('screen'),
    systemAudio: systemAudioSupport(),
    platform: process.platform
  }))

  handle(CH.permsRequestMic, async (): Promise<PermState> => {
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return granted ? 'granted' : 'denied'
    }
    return mediaStatus('microphone')
  })

  handle(CH.permsOpenScreen, async () => {
    if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    else if (process.platform === 'win32') await shell.openExternal('ms-settings:privacy')
  })
  handle(CH.permsOpenMic, async () => {
    if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
    else if (process.platform === 'win32') await shell.openExternal('ms-settings:privacy-microphone')
  })

  handle(CH.storagePaths, () => getPaths())
  handle(CH.storageChooseRoot, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose where Context Vault stores recordings',
      defaultPath: getPaths().root,
      properties: ['openDirectory', 'createDirectory']
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    return setStorageRoot(r.filePaths[0])
  })
  handle(CH.storageStats, (): StorageStats => {
    const p = getPaths()
    const audioBytes = dirSize(p.audio)
    const screenBytes = dirSize(p.screen)
    const otherBytes = dirSize(p.screenshots) + dirSize(p.transcripts)
    let freeBytes = 0
    let totalBytes = 0
    try {
      const s = statfsSync(p.root)
      freeBytes = s.bavail * s.bsize
      totalBytes = s.blocks * s.bsize
    } catch {
      /* ignore */
    }
    return { audioBytes, screenBytes, otherBytes, freeBytes, totalBytes }
  })
  handleResult(CH.storageOpenFolder, async (kind: FolderKind) => {
    const p = getPaths()
    const target = kind === 'root' ? p.root : kind === 'recordings' ? join(p.root, 'recordings') : p[kind]
    if (!target) return fail('Unknown folder')
    const err = await shell.openPath(target)
    return err ? fail(err) : ok()
  })
  handle(CH.storageShowItem, (p: string) => {
    if (isServablePath(p)) shell.showItemInFolder(p)
  })
}
