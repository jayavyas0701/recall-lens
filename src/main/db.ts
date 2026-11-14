// OWNER: orchestrator. SQLite via sql.js (WASM) — no native rebuild needed. Persisted to ~/ContextVault/vault.db.
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { createRequire } from 'module'
import { DB_PATH } from './paths'
import { SCHEMA_SQL, runMigrations } from './schema'
import { log } from './log'

type Params = SqlValue[] | Record<string, SqlValue>
let db: Database | null = null
let saveTimer: NodeJS.Timeout | null = null

export async function initDb(): Promise<void> {
  const req = createRequire(__filename)
  const wasmPath = req.resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true })
  db = existsSync(DB_PATH) ? new SQL.Database(readFileSync(DB_PATH)) : new SQL.Database()
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA_SQL)
  runMigrations()
  flush()
  log.info('DB ready at', DB_PATH)
}

function conn(): Database {
  if (!db) throw new Error('DB not initialised')
  return db
}

export function all<T = Record<string, unknown>>(sql: string, params: Params = []): T[] {
  const stmt = conn().prepare(sql)
  try {
    stmt.bind(params as never)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

export function get<T = Record<string, unknown>>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0]
}

export function run(sql: string, params: Params = []): { lastInsertRowid: number; changes: number } {
  const d = conn()
  d.run(sql, params as never)
  const changes = d.getRowsModified()
  const r = d.exec('SELECT last_insert_rowid() AS id')
  const lastInsertRowid = Number(r[0]?.values[0]?.[0] ?? 0)
  scheduleSave()
  return { lastInsertRowid, changes }
}

export function exec(sql: string): void {
  conn().exec(sql)
  scheduleSave()
}

export function transaction<T>(fn: () => T): T {
  const d = conn()
  d.exec('BEGIN')
  try {
    const out = fn()
    d.exec('COMMIT')
    scheduleSave()
    return out
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 250)
}

/** Write the DB to disk atomically. */
export function flush(): void {
  if (!db) return
  try {
    const data = db.export()
    // sql.js export() resets pragmas
    db.exec('PRAGMA foreign_keys = ON;')
    const tmp = DB_PATH + '.tmp'
    writeFileSync(tmp, Buffer.from(data))
    renameSync(tmp, DB_PATH)
  } catch (e) {
    log.error('DB flush failed', e)
  }
}

export const nowIso = (): string => new Date().toISOString()
