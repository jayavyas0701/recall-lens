// OWNER: orchestrator. "Load demo session" safety net — a realistic 3-minute Tokyo trip planning session.
import { writeFileSync } from 'fs'
import { join } from 'path'
import { CH, type SessionRow, type SessionSummary } from '../../shared/types'
import { get, run, transaction, nowIso } from '../db'
import { toSession } from '../mappers'
import { getPaths } from '../paths'
import { requireUser } from './auth'
import { handleResult, ok } from './util'

export const DEMO_SEGMENTS: [number, number, string][] = [
  [0, 8, "Okay, so I'm finally planning the Tokyo trip for the second week of March — cherry blossom season, hopefully."],
  [8, 16, 'First thing, flights. Let me check San Jose to Tokyo on Google Flights.'],
  [16, 25, "Hmm, SJC to Haneda is about eleven hundred dollars round trip on ANA, but there's a stop in LA."],
  [25, 33, "SFO to Haneda nonstop on United is nine eighty-four. That's actually cheaper with no layover, so SFO it is."],
  [33, 42, 'Departing March 10th, coming back March 19th. Nine nights total.'],
  [42, 52, 'Okay, hotels. I want to stay somewhere central — either Shinjuku or Shibuya, close to a JR station.'],
  [52, 61, 'Hotel Gracery Shinjuku, the one with the Godzilla head on the roof, is about a hundred and ninety a night.'],
  [61, 70, "There's also a cheaper option in Asakusa, around one twenty a night, but it's farther from everything."],
  [70, 80, "I think I'll do Shinjuku for the first seven nights, and then a ryokan in Hakone for the last two."],
  [80, 90, 'Note to self — book the ryokan early, the ones with a private onsen sell out fast in March.'],
  [90, 100, 'Now let me look up whether the JR Pass is still worth it after the price increase.'],
  [100, 110, "It's about fifty thousand yen for seven days now. If I'm only doing Tokyo and Hakone, individual tickets are cheaper."],
  [110, 120, 'So, skip the JR Pass and just add a Suica card to my phone instead.'],
  [120, 130, 'Food list! I definitely want Ichiran ramen, the Tsukiji outer market for breakfast, and one proper omakase dinner.'],
  [130, 140, "Sushi Saito reservations are basically impossible. Maybe Sushi Dai at Toyosu instead — it's walk-in only."],
  [140, 150, 'Also need to remind Maya to send me her list of cafés in Shimokitazawa.'],
  [150, 160, "Budget check — flights nine eighty-four, hotels around thirteen hundred, so roughly three thousand total with food and transport."],
  [160, 170, 'Last thing, I need to check that my passport is valid for the whole stay.'],
  [170, 180, 'Okay, action items: book the United flight tonight, reserve the Shinjuku hotel, email the ryokan, and check my passport.']
]

export const DEMO_EVENTS: [number, string][] = [
  [0, "Viewing a Notion page titled 'Tokyo Trip — March' with an empty packing checklist"],
  [15, "Searching Google Flights for 'SJC to Tokyo' round trip, March 10–19"],
  [30, 'Comparing flights: United SFO→HND nonstop $984 vs ANA SJC→HND via LAX $1,102'],
  [45, 'Browsing Booking.com hotels in Shinjuku, Tokyo, sorted by guest rating'],
  [60, 'Viewing the Hotel Gracery Shinjuku listing — $190/night, 8.6 rating, Godzilla head on the roof'],
  [75, "Searching Google Maps for 'ryokan with private onsen Hakone'"],
  [90, "Reading a Japan Guide article: 'Is the JR Pass still worth it?'"],
  [105, 'Using a JR Pass calculator comparing a 7-day pass (¥50,000) with individual fares'],
  [120, "Searching Google for 'best ramen Tokyo Ichiran Shinjuku'"],
  [135, 'Viewing the Tabelog page for Sushi Dai at Toyosu Market — walk-in only'],
  [150, "Editing a Google Sheet 'Tokyo budget' with rows for flights, hotels, food and transport"],
  [165, 'Viewing the U.S. State Department page on passport validity requirements for Japan']
]

export const DEMO_SUMMARY: SessionSummary = {
  tldr:
    'You planned a March 10–19 Tokyo trip: picked the $984 United nonstop from SFO, chose Hotel Gracery Shinjuku plus two nights at a Hakone ryokan, and decided to skip the JR Pass for a Suica card. Estimated budget is about $3,000.',
  keyPoints: [
    'Flights: United SFO→Haneda nonstop for $984 beat ANA from SJC ($1,102 with an LA stop)',
    'Dates: depart March 10, return March 19 — nine nights during cherry blossom season',
    'Hotel: Hotel Gracery Shinjuku (~$190/night) for 7 nights; Asakusa was cheaper but less central',
    'Hakone ryokan with private onsen for the last 2 nights — these sell out fast',
    'JR Pass (~¥50,000/7 days) not worth it for Tokyo + Hakone; use Suica on phone',
    'Food: Ichiran ramen, Tsukiji outer market breakfast, Sushi Dai at Toyosu (walk-in)',
    'Budget: ~$984 flights + ~$1,300 hotels ≈ $3,000 total'
  ],
  timeline: [
    { t: 0, kind: 'screen', text: "Opened Notion page 'Tokyo Trip — March'" },
    { t: 8, kind: 'speech', text: 'Started checking flights from San Jose to Tokyo' },
    { t: 15, kind: 'screen', text: 'Searched Google Flights SJC → Tokyo, Mar 10–19' },
    { t: 25, kind: 'speech', text: 'Chose United SFO→HND nonstop at $984' },
    { t: 45, kind: 'screen', text: 'Browsed Shinjuku hotels on Booking.com' },
    { t: 52, kind: 'speech', text: 'Liked Hotel Gracery Shinjuku (~$190/night)' },
    { t: 75, kind: 'screen', text: 'Searched Hakone ryokans with private onsen' },
    { t: 90, kind: 'screen', text: 'Read whether the JR Pass is still worth it' },
    { t: 110, kind: 'speech', text: 'Decided to skip the JR Pass, use Suica instead' },
    { t: 120, kind: 'screen', text: 'Searched for Ichiran ramen in Shinjuku' },
    { t: 135, kind: 'screen', text: 'Checked Sushi Dai at Toyosu (walk-in only)' },
    { t: 150, kind: 'speech', text: 'Budget check: roughly $3,000 total' },
    { t: 165, kind: 'screen', text: 'Checked passport validity rules for Japan' },
    { t: 170, kind: 'speech', text: 'Listed action items for tonight' }
  ],
  topics: ['Tokyo', 'Flights', 'Hotels', 'Hakone ryokan', 'JR Pass', 'Food', 'Budget', 'Passport'],
  actionItems: [
    { text: 'Book the United SFO→HND flight ($984) tonight', done: false },
    { text: 'Reserve Hotel Gracery Shinjuku for 7 nights', done: false },
    { text: 'Email the Hakone ryokan about a private-onsen room', done: false },
    { text: 'Check passport validity for the whole stay', done: false },
    { text: "Remind Maya to send her Shimokitazawa café list", done: false }
  ],
  generatedAt: new Date().toISOString(),
  model: 'demo'
}

function demoThumbnailSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7C3AED"/><stop offset="0.55" stop-color="#EC4899"/><stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="520" cy="90" r="46" fill="#fff" opacity="0.9"/>
  <path d="M0 300 L120 210 L200 260 L320 150 L440 250 L520 200 L640 280 L640 360 L0 360 Z" fill="#fff" opacity="0.18"/>
  <rect x="36" y="40" width="300" height="34" rx="17" fill="#fff" opacity="0.22"/>
  <text x="54" y="63" font-family="Helvetica, Arial" font-size="16" fill="#fff" font-weight="700">google.com/flights · SFO → HND</text>
  <text x="36" y="250" font-family="Helvetica, Arial" font-size="54" fill="#fff" font-weight="800">Tokyo ✈</text>
  <text x="38" y="290" font-family="Helvetica, Arial" font-size="20" fill="#fff" opacity="0.9">Mar 10 – 19 · flights, hotels &amp; food</text>
</svg>`
}

/** Seeds the demo session for the current user. Safe to call repeatedly (creates a fresh copy). */
export function seedDemoSession(userId: number): SessionRow {
  // Ended "just now" so it becomes the Latest session (demo safety net after a failed live recording).
  const startedAt = new Date(Date.now() - 1000 * 185).toISOString()
  // Replace any previous demo copy instead of piling up duplicates.
  run('DELETE FROM sessions WHERE user_id = ? AND is_demo = 1', [userId])
  const thumb = join(getPaths().screenshots, 'demo-tokyo-thumbnail.svg')
  try {
    writeFileSync(thumb, demoThumbnailSvg())
  } catch {
    /* thumbnail optional */
  }
  const id = transaction(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO sessions(user_id, title, started_at, duration_s, audio_path, screen_path, thumbnail_path, status, is_demo, summary_json, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [userId, 'Tokyo trip planning ✈️', startedAt, 180, null, null, thumb, 'ready', 1, JSON.stringify({ ...DEMO_SUMMARY, generatedAt: nowIso() }), nowIso()]
    )
    for (const [a, b, text] of DEMO_SEGMENTS) {
      run('INSERT INTO transcript_segments(session_id, t_start, t_end, text) VALUES(?,?,?,?)', [lastInsertRowid, a, b, text])
    }
    for (const [t, d] of DEMO_EVENTS) {
      run('INSERT INTO screen_events(session_id, t, description, screenshot_path) VALUES(?,?,?,?)', [lastInsertRowid, t, d, null])
    }
    return lastInsertRowid
  })
  // Also drop a human-readable transcript file, like a real session would.
  try {
    const lines = DEMO_SEGMENTS.map(([a, , t]) => `[${fmt(a)}] ${t}`).join('\n')
    writeFileSync(join(getPaths().transcripts, `session-${id}-demo.txt`), lines)
  } catch {
    /* optional */
  }
  return toSession(get('SELECT s.*, ? AS snippet FROM sessions s WHERE id = ?', [DEMO_SEGMENTS[0][2], id]))
}

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function registerDemo(): void {
  handleResult(CH.demoLoad, () => ok(seedDemoSession(requireUser().id)))
}
