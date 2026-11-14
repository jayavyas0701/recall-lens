// OWNER: orchestrator. Storage folder layout + config persistence.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve, sep } from 'path'
import type { StoragePaths } from '../shared/types'

/** App home: always ~/ContextVault (DB + config live here so the MCP server can find them). */
export const APP_HOME = join(homedir(), 'ContextVault')
export const DB_PATH = join(APP_HOME, 'vault.db')
const CONFIG_PATH = join(APP_HOME, 'config.json')

interface AppConfig {
  storageRoot: string
}

function readConfig(): AppConfig {
  try {
    if (existsSync(CONFIG_PATH)) return { storageRoot: APP_HOME, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
  } catch {
    /* fall through */
  }
  return { storageRoot: APP_HOME }
}

let cfg: AppConfig | null = null

export function getPaths(): StoragePaths {
  if (!cfg) cfg = readConfig()
  const root = cfg.storageRoot
  const p: StoragePaths = {
    root,
    audio: join(root, 'recordings', 'audio'),
    screen: join(root, 'recordings', 'screen'),
    screenshots: join(root, 'recordings', 'screenshots'),
    transcripts: join(root, 'transcripts')
  }
  for (const d of [APP_HOME, p.root, p.audio, p.screen, p.screenshots, p.transcripts]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
  return p
}

export function setStorageRoot(root: string): StoragePaths {
  cfg = { ...readConfig(), storageRoot: root }
  if (!existsSync(APP_HOME)) mkdirSync(APP_HOME, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
  return getPaths()
}

/** Paths the cv-media:// protocol may serve. */
export function isServablePath(p: string): boolean {
  const r = resolve(p)
  const { audio, screen, screenshots } = getPaths()
  // Only media folders — never the DB/config, never anything outside via `..` or sibling-prefix tricks.
  return [audio, screen, screenshots].some((d) => r.startsWith(resolve(d) + sep))
}
