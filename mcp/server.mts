#!/usr/bin/env node
/**
 * Context Vault MCP server (stdio).
 * Lets Claude Desktop answer "What did I say in the last minute?" from your local Context Vault.
 *
 * Reads the same SQLite DB as the app (~/ContextVault/vault.db, override with CONTEXT_VAULT_DB) — read-only.
 * Tools:
 *   - get_recent_context(minutes)  → transcript + screen activity from the last N minutes of your most recent session
 *   - search_context(query)        → search everything you said or saw across sessions
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { homedir } from 'os'
import { join } from 'path'
import { z } from 'zod'

const DB_PATH = process.env.CONTEXT_VAULT_DB || join(homedir(), 'ContextVault', 'vault.db')
const require_ = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: () => require_.resolve('sql.js/dist/sql-wasm.wasm') })

/** Open a fresh snapshot each call so we always see the app's latest writes. */
function openDb(): Database | null {
  if (!existsSync(DB_PATH)) return null
  return new SQL.Database(readFileSync(DB_PATH))
}

function rows<T = Record<string, unknown>>(db: Database, sql: string, params: SqlValue[] = []): T[] {
  const st = db.prepare(sql)
  st.bind(params)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}

/** The signed-in app user (if any), so we only read their sessions. */
function currentUserId(db: Database): number | null {
  const r = rows<{ value: string }>(db, `SELECT value FROM settings WHERE key = 'auth:currentUserId'`)[0]
  return r ? Number(r.value) : null
}

/** Older vaults may not have the screen_text column yet (the app adds it on launch). */
function stCol(db: Database, alias = ''): string {
  const has = rows<{ name: string }>(db, 'PRAGMA table_info(screen_events)').some((c) => c.name === 'screen_text')
  return has ? `${alias}screen_text` : 'NULL'
}

/** URL + short visible-text excerpt from the on-device screen_text block ("App: …\nTitle: …\nURL: …\nVisible text: …"). */
function screenExtras(st: unknown, max = 200): string {
  if (typeof st !== 'string' || !st) return ''
  const url = /^URL:\s*(.+)$/m.exec(st)?.[1]?.trim()
  const vi = st.indexOf('Visible text: ')
  let vis = vi >= 0 ? st.slice(vi + 14).replace(/\s+/g, ' ').trim() : ''
  if (vis.length > max) vis = vis.slice(0, max - 1) + '…'
  return `${url ? `\n    URL: ${url}` : ''}${vis ? `\n    visible text: ${vis}` : ''}`
}

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const NO_USER = 'Nobody is signed in to Context Vault right now. Open the app and sign in, then ask again.'
const NO_DB = `No Context Vault database found at ${DB_PATH}. Open the Context Vault app and record (or load the demo session) first.`

/** Per-session privacy: only sessions the user allowed for Claude Desktop/MCP, and never password-locked ones. */
function mcpFilter(db: Database, alias = ''): string {
  const cols = rows<{ name: string }>(db, 'PRAGMA table_info(sessions)').map((c) => c.name)
  return cols.includes('mcp_access') ? `AND ${alias}mcp_access = 1 AND ${alias}locked = 0` : ''
}

const server = new McpServer({ name: 'context-vault', version: '1.0.0' })

server.registerTool(
  'get_recent_context',
  {
    title: 'Get recent context',
    description:
      'Returns what the user said (timestamped transcript) and what was on their screen (screenshot descriptions) during the last N minutes of their most recent Context Vault recording session. Use for questions like "What did I say in the last minute?" or "What was I just looking at?".',
    inputSchema: { minutes: z.number().min(0.25).max(60).default(1).describe('How many minutes back from the end of the latest session') }
  },
  async ({ minutes }) => {
    const db = openDb()
    if (!db) return text(NO_DB)
    try {
      const uid = currentUserId(db)
      if (!uid) return text(NO_USER)
      const latest = rows<{ id: number }>(db, `SELECT id FROM sessions WHERE status != 'recording' AND user_id = ? ORDER BY started_at DESC, id DESC LIMIT 1`, [uid])[0]
      const s = rows<{ id: number; title: string; started_at: string; duration_s: number }>(
        db,
        `SELECT id, title, started_at, duration_s FROM sessions WHERE status != 'recording' AND user_id = ? ${mcpFilter(db)} ORDER BY started_at DESC, id DESC LIMIT 1`,
        [uid]
      )[0]
      if (!s) return text(latest ? 'Your Context Vault sessions are private: Claude Desktop access is turned off for them.' : 'There are no recorded sessions in Context Vault yet.')
      if (latest && latest.id !== s.id)
        return text('Your most recent Context Vault session is private (Claude Desktop access is off or it is locked), so I can’t read it. Change its Access settings in the app to allow this.')
      const end = Number(s.duration_s)
      const from = Math.max(0, end - minutes * 60)
      const segs = rows<{ t_start: number; text: string }>(db, 'SELECT t_start, text FROM transcript_segments WHERE session_id = ? AND t_end > ? ORDER BY t_start', [s.id, from])
      const evs = rows<{ t: number; description: string; screen_text: string | null }>(
        db,
        `SELECT t, description, ${stCol(db)} AS screen_text FROM screen_events WHERE session_id = ? AND t >= ? ORDER BY t`,
        [s.id, from]
      )
      const started = new Date(s.started_at)
      const lines = [
        `Session: "${s.title}" — started ${started.toLocaleString()}, duration ${clock(end)}.`,
        `Window: ${clock(from)}–${clock(end)} (last ${minutes} min).`,
        '',
        'What the user said:',
        ...(segs.length ? segs.map((r) => `[${clock(r.t_start)}] ${r.text}`) : ['(no speech in this window)']),
        '',
        'What was on screen:',
        ...(evs.length ? evs.map((r) => `[${clock(r.t)}] ${r.description}${screenExtras(r.screen_text)}`) : ['(no screen activity captured in this window)'])
      ]
      return text(lines.join('\n'))
    } finally {
      db.close()
    }
  }
)

server.registerTool(
  'search_context',
  {
    title: 'Search context',
    description:
      'Searches everything the user said (transcripts) and saw (screen descriptions, page URLs and on-screen text) across all Context Vault sessions. Use for questions like "When did I talk about the budget?" or "What was I searching for about Tokyo?".',
    inputSchema: { query: z.string().min(2).describe('Words to look for') }
  },
  async ({ query }) => {
    const db = openDb()
    if (!db) return text(NO_DB)
    try {
      const uid = currentUserId(db)
      if (!uid) return text(NO_USER)
      const like = `%${query.replace(/[%_]/g, '')}%`
      const userFilter = `AND s.user_id = ? ${mcpFilter(db, 's.')}`
      const p = (x: SqlValue[]): SqlValue[] => (uid ? [...x.slice(0, 1), uid, ...x.slice(1)] : x)
      const said = rows<{ title: string; started_at: string; t: number; text: string }>(
        db,
        `SELECT s.title, s.started_at, ts.t_start AS t, ts.text FROM transcript_segments ts JOIN sessions s ON s.id = ts.session_id
         WHERE ts.text LIKE ? ${userFilter} ORDER BY s.started_at DESC, ts.t_start LIMIT 25`,
        p([like])
      )
      const saw = rows<{ title: string; started_at: string; t: number; text: string; screen_text?: string | null }>(
        db,
        `SELECT s.title, s.started_at, e.t AS t, e.description AS text, ${stCol(db, 'e.')} AS screen_text FROM screen_events e JOIN sessions s ON s.id = e.session_id
         WHERE (e.description LIKE ? OR COALESCE(${stCol(db, 'e.')}, '') LIKE ?) ${userFilter} ORDER BY s.started_at DESC, e.t LIMIT 25`,
        uid ? [like, like, uid] : [like, like]
      )
      if (!said.length && !saw.length) return text(`Nothing in Context Vault matches "${query}".`)
      const fmt = (r: { title: string; started_at: string; t: number; text: string; screen_text?: string | null }): string =>
        `- "${r.title}" (${new Date(r.started_at).toLocaleDateString()}) at ${clock(r.t)}: ${r.text}${screenExtras(r.screen_text, 160)}`
      return text([`Matches for "${query}":`, '', 'Said:', ...(said.length ? said.map(fmt) : ['(none)']), '', 'Seen on screen:', ...(saw.length ? saw.map(fmt) : ['(none)'])].join('\n'))
    } finally {
      db.close()
    }
  }
)

await server.connect(new StdioServerTransport())
console.error(`[ContextVault] MCP server ready (db: ${DB_PATH})`)
