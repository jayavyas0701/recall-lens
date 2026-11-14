// OWNER: orchestrator. Loads .env from the project folder (dev), the app folder, or ~/ContextVault/.env
import { config, parse } from 'dotenv'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { log } from './log'

const HOME_ENV = join(homedir(), 'ContextVault', '.env')

export function loadEnv(): void {
  for (const p of [join(process.cwd(), '.env'), join(app.getAppPath(), '.env')]) {
    if (existsSync(p)) {
      config({ path: p, quiet: true })
      log.info('Loaded env from', p)
    }
  }
  // ~/ContextVault/.env (written by Settings) fills any value that is missing or empty.
  if (existsSync(HOME_ENV)) {
    try {
      for (const [k, v] of Object.entries(parse(readFileSync(HOME_ENV)))) if (!process.env[k]?.trim() && v.trim()) process.env[k] = v
      log.info('Loaded env from', HOME_ENV)
    } catch (e) {
      log.error('Could not read', HOME_ENV, e)
    }
  }
}

/** Persist one KEY=value in ~/ContextVault/.env (owner-only permissions) and apply it to this process. */
export function saveEnvValue(key: string, value: string): void {
  mkdirSync(join(homedir(), 'ContextVault'), { recursive: true })
  const lines = existsSync(HOME_ENV) ? readFileSync(HOME_ENV, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith(`${key}=`)) : []
  if (value) lines.push(`${key}=${value}`)
  writeFileSync(HOME_ENV, lines.join('\n') + '\n', { mode: 0o600 })
  try {
    chmodSync(HOME_ENV, 0o600)
  } catch {
    /* best effort */
  }
  if (value) process.env[key] = value
  else delete process.env[key]
}

export const env = {
  get anthropicKey(): string | undefined {
    const k = process.env.ANTHROPIC_API_KEY?.trim()
    return k ? k : undefined
  },
  get openaiKey(): string | undefined {
    const k = process.env.OPENAI_API_KEY?.trim()
    return k ? k : undefined
  }
}
