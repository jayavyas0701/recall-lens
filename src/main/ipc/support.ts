// OWNER: subagent C (Support). Seeded agents + tickets, fewest-open/round-robin routing, Haiku FAQ chatbot with mock fallback.
import { CH, MODELS, type AgentLoad, type ChatMessage, type CreateTicketInput, type Priority, type Ticket, type TicketStatus } from '../../shared/types'
import { all, get, run, transaction, nowIso } from '../db'
import { toAgent, toTicket } from '../mappers'
import { getAnthropic, textOf } from '../ai/client'
import { log } from '../log'
import { requireUser } from './auth'
import { handle, handleResult, ok, fail } from './util'

const RR_KEY = 'support:rrLast'

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const AGENTS = [
  {
    name: 'Priya Sharma',
    email: 'abc123@contextvault.com',
    color: 'pink',
    specialty: 'Recording & capture'
  },
  {
    name: 'Marcus Lee',
    email: 'xyz456@contextvault.com',
    color: 'orange',
    specialty: 'Billing & plans'
  },
  {
    name: 'Sofia Alvarez',
    email: 'lmn789@contextvault.com',
    color: 'violet',
    specialty: 'AI & summaries'
  },
  {
    name: 'Kenji Watanabe',
    email: 'pqr321@contextvault.com',
    color: 'cyan',
    specialty: 'Account & security'
  },
  {
    name: 'Dana Okafor',
    email: 'def654@contextvault.com',
    color: 'lime',
    specialty: 'Storage & files'
  }
] as const

type SeedTicket = [agentIdx: number, subject: string, description: string, priority: Priority, status: TicketStatus]

// Open loads (open + in_progress): Priya 3, Marcus 5, Sofia 4, Kenji 4, Dana 6 → Priya gets the next ticket (CV-1042).
// Then: CV-1043 → Sofia (tie at 4, round-robin after Priya), CV-1044 → Kenji, CV-1045 → Priya, CV-1046 → Marcus …
const SEED_TICKETS: SeedTicket[] = [
  // Priya — Recording & capture (3 open, 5 resolved)
  [0, 'Recording stops after 3 minutes', 'Is the 3-minute auto-stop a bug? I lost the end of my stand-up.', 'low', 'resolved'],
  [0, 'Microphone not detected on MacBook Air', 'The mic level meter stays flat even though System Settings shows access granted.', 'high', 'resolved'],
  [0, 'Screen recording is black on second monitor', 'Only my external display records as a black frame.', 'medium', 'resolved'],
  [0, 'System audio missing from recording', 'I can hear my voice but not the Zoom call audio.', 'medium', 'resolved'],
  [0, 'Countdown ring stuck at 0:00', 'The timer ring froze but the recording kept going.', 'low', 'resolved'],
  [0, 'Recording won’t start after macOS update', 'Clicking Record does nothing since updating to the latest macOS.', 'high', 'in_progress'],
  [0, 'Screenshots every 15s look blurry', 'The captured stills are low resolution on my 5K display.', 'low', 'open'],
  [0, 'Audio and screen out of sync', 'Voice is about a second ahead of the screen video on playback.', 'medium', 'open'],
  // Marcus — Billing & plans (5 open, 3 resolved)
  [1, 'Charged twice for Pro', 'My card shows two $9 charges this month.', 'high', 'resolved'],
  [1, 'How do I switch to yearly billing?', 'I want the 20% yearly discount without losing my sessions.', 'low', 'resolved'],
  [1, 'Invoice needs company VAT number', 'Can you add our VAT ID to past invoices?', 'medium', 'resolved'],
  [1, 'Team plan seat count is wrong', 'We have 6 people but the admin dashboard shows 4 seats.', 'medium', 'in_progress'],
  [1, 'Downgrade from Team to Pro', 'What happens to shared vaults if we downgrade?', 'medium', 'open'],
  [1, 'Student discount available?', 'Is there education pricing for Pro?', 'low', 'open'],
  [1, 'Free plan says 5/5 sessions but I deleted two', 'Deleting sessions did not free up my free-plan quota.', 'high', 'open'],
  [1, 'Receipt email never arrived', 'Upgraded yesterday, no receipt in my inbox or spam.', 'low', 'in_progress'],
  // Sofia — AI & summaries (4 open, 4 resolved)
  [2, 'Summary missed my action items', 'The TL;DR is great but the action items list is empty.', 'medium', 'resolved'],
  [2, 'Ask AI answers about the wrong session', 'I asked about today but it answered from yesterday’s recording.', 'high', 'resolved'],
  [2, 'Transcript has wrong speaker words', 'Whisper wrote “Kyoto” when I said “Tokyo”.', 'low', 'resolved'],
  [2, 'Can summaries be in Spanish?', 'I record in Spanish — can the summary be generated in Spanish too?', 'low', 'resolved'],
  [2, 'Summary generation spins forever', 'The “Summarizing…” badge never finishes on one session.', 'high', 'in_progress'],
  [2, 'Timeline timestamps off by 10s', 'Clicking a timeline item jumps 10 seconds too late.', 'medium', 'open'],
  [2, '“What did I say in the last minute?” is vague', 'The answer summarised the whole session instead of the last minute.', 'medium', 'open'],
  [2, 'Local transcription very slow', 'Whisper takes 4 minutes for a 3-minute recording on my Intel Mac.', 'medium', 'open'],
  // Kenji — Account & security (4 open, 3 resolved)
  [3, 'Forgot my password', 'No reset email arrives when I click “Forgot password”.', 'high', 'resolved'],
  [3, 'Change account email', 'I need to move my vault to my work email.', 'low', 'resolved'],
  [3, 'Is my data sent to the cloud?', 'Security team wants to know exactly what leaves the laptop.', 'medium', 'resolved'],
  [3, 'Two-factor authentication request', 'Please add 2FA to the sign-in screen.', 'medium', 'open'],
  [3, 'Signed out every time I restart', 'The app forgets my session after a reboot.', 'medium', 'in_progress'],
  [3, 'Delete my account and all data', 'I want a full wipe including transcripts.', 'high', 'open'],
  [3, 'Avatar color won’t save', 'Picking “cyan” in Settings reverts to violet after relaunch.', 'low', 'open'],
  // Dana — Storage & files (6 open, 4 resolved)
  [4, 'Where are my recordings stored?', 'I can’t find the .webm files in Finder.', 'low', 'resolved'],
  [4, 'Restore a file I deleted', 'Accidentally cleaned up yesterday’s audio — can I get it back?', 'medium', 'resolved'],
  [4, 'Move vault to external SSD', 'My internal drive is full; can the vault live on an external disk?', 'medium', 'resolved'],
  [4, 'Storage bar shows wrong free space', 'Cleanup page says 2 GB free but Finder says 40 GB.', 'low', 'resolved'],
  [4, 'Bulk delete is slow', 'Selecting 30 files and deleting takes over a minute.', 'medium', 'open'],
  [4, 'Thumbnails missing in Cleanup grid', 'Screen recordings show a blank thumbnail.', 'low', 'open'],
  [4, 'Export a session as a zip', 'I’d like to share one session (audio + transcript) with a colleague.', 'medium', 'in_progress'],
  [4, 'iCloud Drive keeps syncing the vault', 'My ~/ContextVault folder is uploading to iCloud — how do I exclude it?', 'high', 'open'],
  [4, 'Duplicate files after crash', 'After a crash I see two copies of the same recording.', 'medium', 'open'],
  [4, 'Can I change the file naming format?', 'Prefer YYYY-MM-DD_title instead of the timestamp.', 'low', 'in_progress']
]

/** Seed 5 agents + 41 existing tickets on first run. Called from main/index.ts after initDb(). Idempotent. */
export function seedSupport(): void {
  try {
    const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM agents')?.n ?? 0
    if (Number(n) > 0) return
    transaction(() => {
      const ids: number[] = []
      for (const a of AGENTS) {
        ids.push(run('INSERT INTO agents(name, email, avatar_color, specialty) VALUES(?,?,?,?)', [a.name, a.email, a.color, a.specialty]).lastInsertRowid)
      }
      const ticketCount = Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM tickets')?.n ?? 0)
      if (ticketCount > 0) return
      const now = Date.now()
      const DAY = 86_400_000
      SEED_TICKETS.forEach(([agentIdx, subject, description, priority, status], i) => {
        // Spread over the past 14 days; resolved tickets skew older, open ones newer. Deterministic jitter.
        const base = status === 'resolved' ? 7 + ((i * 5) % 7) : (i * 3) % 9
        const hours = (i * 7) % 20
        const createdAt = new Date(now - base * DAY - hours * 3_600_000 - 25 * 60_000).toISOString()
        const id = i + 1
        run('INSERT INTO tickets(id, code, user_id, agent_id, subject, description, priority, status, created_at) VALUES(?,?,?,?,?,?,?,?,?)', [
          id,
          ticketCode(id),
          null,
          ids[agentIdx]!,
          subject,
          description,
          priority,
          status,
          createdAt
        ])
      })
    })
    run('DELETE FROM settings WHERE key = ?', [RR_KEY])
    log.info('Support seeded: 5 agents,', SEED_TICKETS.length, 'tickets')
  } catch (e) {
    log.error('seedSupport failed', e)
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export const ticketCode = (id: number): string => `CV-${1000 + id}`

/**
 * Pure routing rule: the agent with the fewest open tickets wins; ties are broken round-robin —
 * among tied agents (ordered by id) pick the first whose id is greater than the last assigned id, else wrap around.
 */
export function pickAgent(loads: { id: number; open: number }[], lastAssignedId: number | null): number | null {
  if (!loads.length) return null
  const min = Math.min(...loads.map((l) => l.open))
  const tied = loads.filter((l) => l.open === min).sort((a, b) => a.id - b.id)
  const last = lastAssignedId ?? 0
  return (tied.find((l) => l.id > last) ?? tied[0]!).id
}

function lastAssigned(): number | null {
  const v = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [RR_KEY])?.value
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : null
}

function setLastAssigned(id: number): void {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [RR_KEY, String(id)])
}

type LoadRow = {
  id: number
  name: string
  email: string
  avatar_color: string
  specialty: string
  open: number
  total: number
}

function loadRows(): LoadRow[] {
  return all<LoadRow>(
    `SELECT a.id, a.name, a.email, a.avatar_color, a.specialty,
            COALESCE(SUM(CASE WHEN t.status != 'resolved' THEN 1 ELSE 0 END), 0) AS open,
            COUNT(t.id) AS total
       FROM agents a LEFT JOIN tickets t ON t.agent_id = a.id
      GROUP BY a.id ORDER BY a.id`
  )
}

/** Per-agent load (open + total). Kept for internal/diagnostic use; the renderer does not call it (users never see queue data). */
export function agentLoad(): AgentLoad[] {
  return loadRows().map((r) => ({ agent: toAgent(r), open: Number(r.open), total: Number(r.total) }))
}

const TICKET_SELECT = `SELECT t.*, a.name AS agent_name, a.email AS agent_email, a.avatar_color AS agent_color, a.specialty AS agent_specialty
  FROM tickets t JOIN agents a ON a.id = t.agent_id`

const PRIORITIES: Priority[] = ['low', 'medium', 'high']

export function createTicket(input: CreateTicketInput): Ticket {
  const user = requireUser()
  const subject = String(input?.subject ?? '').trim()
  const description = String(input?.description ?? '').trim()
  const priority = PRIORITIES.includes(input?.priority) ? input.priority : 'medium'
  if (subject.length < 3) throw new Error('Please add a short subject (at least 3 characters).')
  if (subject.length > 140) throw new Error('Subject is a bit long — keep it under 140 characters.')
  if (description.length < 5) throw new Error('Tell us a little more in the description.')
  if (description.length > 4000) throw new Error('Description is too long (max 4000 characters).')

  const id = transaction(() => {
    const rows = loadRows()
    if (!rows.length) throw new Error('No support agents available.')
    const agentId = pickAgent(
      rows.map((r) => ({ id: Number(r.id), open: Number(r.open) })),
      lastAssigned()
    )!
    const tmp = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { lastInsertRowid } = run(
      'INSERT INTO tickets(code, user_id, agent_id, subject, description, priority, status, created_at) VALUES(?,?,?,?,?,?,?,?)',
      [tmp, user.id, agentId, subject, description, priority, 'open', nowIso()]
    )
    run('UPDATE tickets SET code = ? WHERE id = ?', [ticketCode(lastInsertRowid), lastInsertRowid])
    setLastAssigned(agentId)
    return lastInsertRowid
  })
  const t = toTicket(get(`${TICKET_SELECT} WHERE t.id = ?`, [id]))
  log.info(`Ticket ${t.code} → ${t.agent?.name} (${t.agent?.email})`)
  return t
}

export function myTickets(): Ticket[] {
  const user = requireUser()
  return all(`${TICKET_SELECT} WHERE t.user_id = ? ORDER BY t.created_at DESC, t.id DESC`, [user.id]).map(toTicket)
}

// ---------------------------------------------------------------------------
// Chatbot
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Vee, the friendly support bot inside Context Vault, a desktop app that records your screen + voice and turns it into a searchable memory you can ask questions about.
Answer in 1-4 short sentences (or a few tight bullets), warm and upbeat, at most one emoji. Plain text, no headings.
FAQ:
- Recording: click Record in the top bar. Sessions are max 3 minutes and auto-stop with a countdown ring. A screenshot is taken every 15 seconds.
- If recording won't start: on macOS grant Microphone and Screen Recording in System Settings → Privacy & Security (then restart the app); Settings → Permissions has a "Re-check" button. Make sure no other app is using the mic.
- Files live locally in ~/ContextVault/recordings/ (audio/, screen/, screenshots/, transcripts/). The folder can be changed in Settings → Storage. Tab 2 / Cleanup lets you open folders and delete files.
- Deleting files moves them to the system Trash (recoverable until you empty it), never a hard delete.
- Privacy: recordings (audio/video) never leave your computer. Transcription runs locally with Whisper. Only text (transcripts) and screenshots are sent to the Anthropic API for summaries, screen descriptions and answers.
- AI: the Summary tab shows TL;DR, key points, timeline, topics and action items; "Ask your memory" answers questions like "What did I say in the last minute?".
- Plans: Free (5 sessions, 3-min limit), Pro $9/mo (unlimited sessions, AI summaries, priority support), Team $29/mo (shared vaults, admin dashboard). Yearly saves 20%. Checkout is a demo/mock — no real payment is taken.
- Demo: Settings → "Load demo session" adds a realistic 3-minute Tokyo trip-planning session so you can try everything without recording.
- Without an API key the app uses friendly mock AI so nothing breaks.
If you are not sure or the issue needs a human (bugs, billing disputes, account changes), say so briefly and suggest tapping "Create a ticket" so a specialist picks it up. Never invent features.`

const MOCK_FAQ: { keys: RegExp; answer: string }[] = [
  {
    keys: /(won.?t start|not start|doesn.?t start|can.?t record|record button|mic|microphone|permission|black screen|screen record)/i,
    answer:
      'Let’s get you recording! 🎙️ On macOS open System Settings → Privacy & Security and allow Context Vault under both Microphone and Screen Recording, then restart the app. You can also hit “Re-check” in Settings → Permissions. Still stuck? Tap “Create a ticket” and our capture specialist will dig in.'
  },
  {
    keys: /(where.*(file|recording|stored|saved)|folder|find my|location|storage|disk|finder)/i,
    answer:
      'Everything is saved locally in ~/ContextVault/recordings/ — with audio/, screen/, screenshots/ and transcripts/ folders inside. You can open them from the Cleanup tab or move the vault in Settings → Storage. 📁'
  },
  {
    keys: /(privacy|private|data|cloud|secure|security|upload|send|anthropic|gdpr)/i,
    answer:
      'Your recordings never leave your computer. 🔒 Transcription runs locally with Whisper, and only text (transcripts) plus screenshots are sent to the Anthropic API to create summaries and answer your questions. No audio or video is uploaded.'
  },
  {
    keys: /(delete|trash|remove|clean ?up|restore|recover)/i,
    answer:
      'Deleting from the Cleanup tab moves files to your system Trash, so you can still restore them until you empty it. 🗑️ Nothing is hard-deleted behind your back.'
  },
  {
    keys: /(3.?min|three min|limit|auto.?stop|stops|long|duration|timer)/i,
    answer:
      'Each session records for up to 3 minutes and then stops automatically — the countdown ring in the recorder shows how much time is left. ⏱️ Just start a new session to keep going.'
  },
  {
    keys: /(price|pricing|\bplans?\b|\bpro\b|\bteam\b|upgrade|billing|\bpay|charge|subscription|cost|refund|invoice)/i,
    answer:
      'We have three plans: Free (5 sessions, 3-min limit), Pro at $9/mo (unlimited sessions, AI summaries, priority support) and Team at $29/mo (shared vaults, admin dashboard). Yearly saves 20%. 💜 Checkout here is demo mode — no real payment is taken.'
  },
  {
    keys: /(demo|sample|example|try it|tokyo)/i,
    answer:
      'Head to Settings and click “Load demo session” — you’ll get a realistic 3-minute Tokyo trip-planning session with transcript, screenshots and a summary to explore. ✨'
  },
  {
    keys: /(summar|transcri|whisper|\bask\b|question|\bai\b|claude|answer)/i,
    answer:
      'After a session, the Summary tab shows a TL;DR, key points, a timeline and action items, and you can ask things like “What did I say in the last minute?”. 🤖 Transcription happens on-device with Whisper.'
  },
  {
    keys: /(password|sign ?in|log ?in|account|email|sign ?out|log ?out)/i,
    answer:
      'You can update your name and avatar in Settings, and log out from there too. For password resets or changing your account email, tap “Create a ticket” and our account team will help. 🔑'
  },
  {
    keys: /^(hi|hey|hello|yo|hola|good (morning|afternoon|evening))\b/i,
    answer: 'Hey there! 👋 I’m Vee. Ask me about recording, where your files live, privacy, plans — or anything else about Context Vault.'
  },
  {
    keys: /(thank|thanks|thx|awesome|great|perfect)/i,
    answer: 'Anytime! 💜 If anything else comes up, I’m right here.'
  }
]

const MOCK_DEFAULT = 'Hmm, I’m not 100% sure about that one. 🤔 Tap “Create a ticket” below and a human specialist will get back to you by email.'

export function mockAnswer(question: string): string {
  const q = question.trim()
  return MOCK_FAQ.find((f) => f.keys.test(q))?.answer ?? MOCK_DEFAULT
}

async function chat(messages: ChatMessage[]): Promise<string> {
  const clean = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  // The API needs the conversation to start with a user turn.
  while (clean.length && clean[0]!.role !== 'user') clean.shift()
  const lastUser = [...clean].reverse().find((m) => m.role === 'user')?.content ?? ''
  if (!clean.length) return MOCK_DEFAULT

  const c = getAnthropic()
  if (!c) return mockAnswer(lastUser)
  try {
    const msg = await c.messages.create({
      model: MODELS.fast,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: clean
    })
    return textOf(msg) || mockAnswer(lastUser)
  } catch (e) {
    log.error('support chat failed, using mock answer', e)
    return mockAnswer(lastUser)
  }
}

export function registerSupport(): void {
  handleResult(CH.supportChat, async (messages: ChatMessage[]) => ok(await chat(messages)))
  handleResult(CH.supportCreateTicket, (input: CreateTicketInput) => {
    try {
      return ok(createTicket(input))
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (m !== 'Not signed in') log.warn('createTicket rejected:', m)
      return fail(m)
    }
  })
  handle(CH.supportMyTickets, () => myTickets())
  handle(CH.supportAgentLoad, () => agentLoad())
}
