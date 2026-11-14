// OWNER: orchestrator. Subagents request schema changes via their result.
import { all, exec } from './db'

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT 'violet',
  plan TEXT NOT NULL DEFAULT 'free',
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled session',
  started_at TEXT NOT NULL,
  duration_s REAL NOT NULL DEFAULT 0,
  audio_path TEXT,
  screen_path TEXT,
  thumbnail_path TEXT,
  status TEXT NOT NULL DEFAULT 'recording',
  is_demo INTEGER NOT NULL DEFAULT 0,
  ai_access INTEGER NOT NULL DEFAULT 1,
  mcp_access INTEGER NOT NULL DEFAULT 1,
  search_access INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  t_start REAL NOT NULL,
  t_end REAL NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_session ON transcript_segments(session_id, t_start);
CREATE TABLE IF NOT EXISTS screen_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  t REAL NOT NULL,
  description TEXT NOT NULL,
  screenshot_path TEXT,
  screen_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_session ON screen_events(session_id, t);
CREATE TABLE IF NOT EXISTS qa_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_id INTEGER,
  rating INTEGER NOT NULL,
  emoji TEXT,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_color TEXT NOT NULL,
  specialty TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  billing TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  renews_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** Add columns that may be missing in older DBs. */
export function runMigrations(): void {
  const cols = (t: string): string[] => all<{ name: string }>(`PRAGMA table_info(${t})`).map((r) => r.name)
  const s = cols('sessions')
  if (!s.includes('thumbnail_path')) exec('ALTER TABLE sessions ADD COLUMN thumbnail_path TEXT')
  // Per-session access controls
  if (!s.includes('ai_access')) exec('ALTER TABLE sessions ADD COLUMN ai_access INTEGER NOT NULL DEFAULT 1')
  if (!s.includes('mcp_access')) exec('ALTER TABLE sessions ADD COLUMN mcp_access INTEGER NOT NULL DEFAULT 1')
  if (!s.includes('search_access')) exec('ALTER TABLE sessions ADD COLUMN search_access INTEGER NOT NULL DEFAULT 1')
  if (!s.includes('locked')) exec('ALTER TABLE sessions ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')
  const e = cols('screen_events')
  if (!e.includes('screen_text')) exec('ALTER TABLE screen_events ADD COLUMN screen_text TEXT')
}
