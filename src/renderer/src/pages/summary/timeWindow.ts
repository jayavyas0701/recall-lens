// OWNER: subagent B. Parses time references in a question ("last minute", "first 30 seconds", "at the end", "between 1:00 and 2:00")
// into a window relative to the session. An identical copy lives in src/main/ai/timeWindow.ts
// (main uses it to filter the Ask Claude context; the renderer shows a "context used" hint) — keep the two in sync.

export interface TimeWindow {
  start: number // seconds from session start
  end: number
  /** Human label, e.g. "the last minute", "the whole session". */
  label: string
  /** True when no time filter applies. */
  whole: boolean
}

const WORD_NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90,
  couple: 2, 'couple of': 2, few: 2, 'a few': 2, half: 0.5
}

const NUM = String.raw`(\d+(?:\.\d+)?|a couple of|couple of|a few|few|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety|half)`
const UNIT = String.raw`(seconds?|secs?|minutes?|mins?)`

const toNum = (s: string): number => {
  const n = Number(s)
  return Number.isFinite(n) ? n : (WORD_NUMS[s.trim()] ?? 1)
}
const unitSeconds = (u: string): number => (u.startsWith('s') ? 1 : 60)

/** "2:10" → 130 */
function clockToSeconds(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function spanLabel(n: number, unit: string): string {
  const secs = n * unitSeconds(unit)
  if (secs === 60) return 'minute'
  if (secs < 60 || secs % 60 !== 0) return `${Math.round(secs)} seconds`
  return `${secs / 60} minutes`
}

/**
 * Returns the time window a question refers to, clamped to [0, durationS].
 * Falls back to the whole session when the question has no time reference.
 */
export function parseTimeWindow(question: string, durationS: number): TimeWindow {
  const dur = Math.max(1, Number(durationS) || 0)
  const q = ` ${question.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')} `
  const whole: TimeWindow = { start: 0, end: dur, label: 'the whole session', whole: true }
  const clamp = (a: number, b: number, label: string): TimeWindow => {
    const start = Math.max(0, Math.min(dur, a))
    const end = Math.max(start, Math.min(dur, b))
    if (end - start < 1) return whole
    if (start <= 0 && end >= dur) return { ...whole, label: 'the whole session' }
    return { start, end, label, whole: false }
  }

  // Explicit ranges: "between 1:00 and 2:30", "from 0:30 to 1:15"
  let m = /(?:between|from)\s+(\d{1,2}:\d{2})\s+(?:and|to|-|–)\s+(\d{1,2}:\d{2})/.exec(q)
  if (m) {
    const a = clockToSeconds(m[1]!)
    const b = clockToSeconds(m[2]!)
    if (a != null && b != null) return clamp(Math.min(a, b), Math.max(a, b), `${fmtClock(Math.min(a, b))}–${fmtClock(Math.max(a, b))}`)
  }
  // A specific moment: "at 2:10", "around 1:30"
  m = /(?:at|around|near|about)\s+(\d{1,2}:\d{2})\b/.exec(q)
  if (m) {
    const t = clockToSeconds(m[1]!)
    if (t != null) return clamp(t - 20, t + 25, `around ${fmtClock(t)}`)
  }
  // "last 2 minutes", "past 30 seconds", "final minute", "previous few minutes"
  m = new RegExp(String.raw`\b(?:last|past|previous|final|latest)\s+${NUM}\s+${UNIT}\b`).exec(q)
  if (m) {
    const secs = toNum(m[1]!) * unitSeconds(m[2]!)
    return clamp(dur - secs, dur, `the last ${spanLabel(toNum(m[1]!), m[2]!)}`)
  }
  if (/\b(?:last|past|previous|final|latest)\s+(?:minute|min)\b/.test(q)) return clamp(dur - 60, dur, 'the last minute')
  if (/\b(?:last|past|previous|final)\s+(?:few|couple(?: of)?)\s+(?:minutes|mins)\b/.test(q)) return clamp(dur - 120, dur, 'the last 2 minutes')
  if (/\b(?:last|past|final)\s+(?:few\s+)?(?:seconds|moments)\b/.test(q)) return clamp(dur - 30, dur, 'the last 30 seconds')
  if (/\bhalf (?:a|an) minute\b/.test(q) && /\b(?:last|past|final)\b/.test(q)) return clamp(dur - 30, dur, 'the last 30 seconds')

  // "first 30 seconds", "first two minutes", "opening minute"
  m = new RegExp(String.raw`\b(?:first|opening|initial)\s+${NUM}\s+${UNIT}\b`).exec(q)
  if (m) {
    const secs = toNum(m[1]!) * unitSeconds(m[2]!)
    return clamp(0, secs, `the first ${spanLabel(toNum(m[1]!), m[2]!)}`)
  }
  if (/\b(?:first|opening|initial)\s+(?:minute|min)\b/.test(q)) return clamp(0, 60, 'the first minute')
  if (/\b(?:first|opening)\s+(?:few\s+)?(?:seconds|moments)\b/.test(q)) return clamp(0, 30, 'the first 30 seconds')

  // Thirds of the session: beginning / middle / end
  const third = Math.min(60, dur / 3)
  if (/\b(?:at|in|near|towards?|around|by) the (?:very )?(?:beginning|start)\b|\bat first\b|\bstarted (?:off|out)\b|\bbeginning of\b|\bstart of\b/.test(q))
    return clamp(0, third, 'the beginning')
  if (/\b(?:in|around|during) the middle\b|\bmiddle of\b|\bmidway\b|\bhalfway\b/.test(q))
    return clamp(dur / 2 - third / 2, dur / 2 + third / 2, 'the middle')
  if (/\b(?:at|in|near|towards?|around|by) the (?:very )?end\b|\bend of (?:the |my )?(?:session|recording|conversation|call|it)\b|\bat the finish\b|\bwrapp?(?:ed|ing) up\b|\bended\b/.test(q))
    return clamp(dur - third, dur, 'the end')

  return whole
}

export interface WindowSelection<S, E> {
  window: TimeWindow
  segments: S[]
  events: E[]
  /** True when the requested window had no data, so the whole session was used instead. */
  fellBack: boolean
}

/** Filters segments/events to the window; falls back to the whole session if the window is empty. */
export function selectWindow<S extends { tStart: number; tEnd: number }, E extends { t: number }>(
  question: string,
  durationS: number,
  segments: S[],
  events: E[]
): WindowSelection<S, E> {
  const maxT = Math.max(0, ...segments.map((s) => s.tEnd), ...events.map((e) => e.t))
  const dur = Number(durationS) > 0 ? Number(durationS) : maxT
  const window = parseTimeWindow(question, dur)
  if (window.whole) return { window, segments, events, fellBack: false }
  // A segment counts when a meaningful part of it (≥3 s or half of it) falls inside the window.
  const segs = segments.filter((s) => {
    const overlap = Math.min(s.tEnd, window.end) - Math.max(s.tStart, window.start)
    return overlap > 0 && overlap >= Math.min(3, (s.tEnd - s.tStart) / 2)
  })
  const evs = events.filter((e) => e.t >= window.start && e.t <= window.end)
  if (!segs.length && !evs.length) {
    return { window: { start: 0, end: dur, label: 'the whole session', whole: true }, segments, events, fellBack: true }
  }
  return { window, segments: segs, events: evs, fellBack: false }
}
