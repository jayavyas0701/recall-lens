// OWNER: subagent B. Deterministic, data-driven mock summary used when there is no API key or the API fails.
import type { ScreenEvent, SessionDetail, SessionSummary, TimelineItem, TranscriptSegment } from '../../shared/types'
import { DEMO_SUMMARY } from '../ipc/demo'
import { nowIso } from '../db'
import { STOPWORDS, capitalize, contentStems, joinList, sentences, stem, truncate, words } from './text'
import { fmtClock } from './timeWindow'

export interface SummaryDraft {
  title: string
  summary: SessionSummary
}

const ACTION_RE =
  /\b(need to|needs to|have to|has to|got to|gotta|must|should|remind|remember to|don't forget|note to self|book|reserve|email|call|text|send|buy|order|schedule|follow up|sign up|renew|pay|submit|finish|check (?:that|if|whether|my|the)|to-?do|action items?)\b/i

const TOPIC_STOP = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow', 'tonight', 'google', 'browser', 'chrome', 'website', 'tab', 'listing', 'article', 'result', 'notion', 'sheet', 'document', 'app', 'titled', 'row', 'checklist', 'empty', 'youtube', 'gmail', 'safari', 'firefox', 'arc', 'edge', 'brave', 'captured', 'detected', 'results', 'top', 'editing', 'watching', 'reading', 'browsing', 'chatting', 'visible', 'shopping', 'listening', 'local', 'folder', 'repo', 'best'])

interface Topic {
  label: string
  proper: boolean
}

/** Topic keywords/phrases ranked by frequency, boosted for proper nouns (incl. multi-word names like "JR Pass") and on-screen mentions. */
export function extractTopicList(segments: TranscriptSegment[], events: ScreenEvent[], max = 7): Topic[] {
  const score = new Map<string, { n: number; label: string; proper: boolean }>()
  const add = (raw: string, weight: number, proper: boolean): void => {
    const lw = raw.toLowerCase().replace(/[’]/g, "'")
    if (lw.length < 3 || STOPWORDS.has(lw) || TOPIC_STOP.has(lw) || /\d/.test(lw)) return
    const k = lw.split(' ').map(stem).join(' ')
    const cur = score.get(k) ?? { n: 0, label: raw, proper }
    cur.n += weight
    if (proper && !cur.proper) {
      cur.label = raw
      cur.proper = true
    } else if (raw.length < cur.label.length && proper === cur.proper) cur.label = raw
    score.set(k, cur)
  }
  const scan = (text: string, base: number): void => {
    for (const sent of sentences(text)) {
      const toks = sent.match(/[A-Za-z][A-Za-z'’-]+/g) ?? []
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i]!.replace(/['’]s$/, '')
        const cap = /^[A-Z]/.test(t) && (i > 0 || /^[A-Z]{2,}$/.test(t))
        if (cap) {
          // Merge runs of capitalised words into one phrase ("JR Pass", "Hotel Gracery Shinjuku").
          let j = i + 1
          while (j < toks.length && /^[A-Z]/.test(toks[j]!) && j - i < 3) j++
          if (j - i > 1 && !STOPWORDS.has(t.toLowerCase())) {
            add(toks.slice(i, j).join(' ').replace(/['’]s$/, ''), base * 2.4, true)
            i = j - 1
            continue
          }
          add(t, base * 2.2, true)
        } else add(t, base, false)
      }
    }
  }
  segments.forEach((s) => scan(s.text, 1))
  // Ignore parentheticals such as "(demo description)".
  events.forEach((e) => {
    const raw = e.description.replace(/\([^)]*\)/g, ' ').replace(/^Screen captured\b.*$/i, '')
    // "… — top results: A, B, C": short result titles become topic phrases of their own.
    const [d, resultsPart] = raw.split(/\s+—\s+top results:\s*/i)
    // Shouting result titles ("THE BEST 10 THAI…") shouldn't look like proper nouns.
    const norm = (x: string): string => x.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    // Scan separator-delimited chunks separately so capitalised runs don't merge across "|", ",", "—".
    const chunks = (x: string): string[] => norm(x).split(/\s*[|,;·—–]\s*|\s+-\s+/).filter(Boolean)
    chunks(d ?? '').forEach((c) => scan(c, 1.3))
    // Real search queries and page/document titles (quoted by the screen describer) are the best topic signals.
    for (const m of (d ?? '').matchAll(/["“]([^"”]{3,80})["”]/g)) chunks(m[1]!).forEach((c) => scan(c, 1.2))
    for (const r of (resultsPart ?? '').split(/,\s*/)) {
      const t = r.trim()
      if (t && !t.includes('…') && t.split(/\s+/).length <= 4 && /^[A-Z]/.test(t)) add(norm(t), 2.2, true)
    }
  })
  const ranked = [...score.values()].filter((v) => v.n >= 1.5 || score.size < 12).sort((a, b) => b.n - a.n)
  // Drop single words already covered by a chosen phrase ("Khao" when "Kin Khao" is a topic).
  return ranked
    .filter((v, i) => v.label.includes(' ') || !ranked.slice(0, i).some((p) => p.label.includes(' ') && p.label.toLowerCase().split(/\s+/).includes(v.label.toLowerCase())))
    .slice(0, max)
    .map((v) => ({ label: v.label, proper: v.proper }))
}

export function extractTopics(segments: TranscriptSegment[], events: ScreenEvent[], max = 7): string[] {
  return extractTopicList(segments, events, max).map((t) => capitalize(t.label))
}

function cleanAction(s: string): string {
  let t = s
    .replace(/^(okay|ok|so|also|and|oh|alright|right|um|uh|last thing)[,\s—-]+/i, '')
    .replace(/^note to self\s*[—:,-]?\s*/i, '')
    .replace(/^(i|we)\s+(really\s+)?(need|have|got)\s+to\s+/i, '')
    .replace(/^(i|we)\s+(should|must)\s+/i, '')
    .replace(/^(don't forget to|remember to)\s+/i, '')
    .replace(/^also\s+need\s+to\s+/i, '')
    .replace(/^need\s+to\s+/i, '')
    .replace(/[.!?]+$/, '')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/gi, 'you')
    .replace(/\bI\b/g, 'you')
    .trim()
  if (t.length > 110) t = truncate(t, 110)
  return capitalize(t)
}

/** Action items from phrases like "need to", "remind", "book", "note to self", or an explicit "action items: a, b and c" list. */
export function extractActionItems(segments: TranscriptSegment[], max = 6): string[] {
  const out: string[] = []
  const push = (s: string): void => {
    const c = cleanAction(s)
    if (c.length < 6) return
    const mine = new Set(contentStems(c))
    const idx = out.findIndex((o) => {
      const theirs = new Set(contentStems(o))
      const [small, big] = mine.size <= theirs.size ? [mine, theirs] : [theirs, mine]
      return small.size > 0 && [...small].every((w) => big.has(w))
    })
    if (idx < 0) out.push(c)
    else if (c.length > out[idx]!.length) out[idx] = c
  }
  for (const seg of segments) {
    for (const sent of sentences(seg.text)) {
      const list = /\b(?:action items?|to-?dos?|things to do)\s*[:—-]\s*(.+)$/i.exec(sent)
      if (list) {
        list[1]!
          .split(/,\s*(?:and\s+)?|\s+and\s+(?=[a-z]+\s)/i)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach(push)
        continue
      }
      if (ACTION_RE.test(sent)) push(sent)
    }
  }
  return out.slice(-max)
}

/** Picks the most informative sentences (numbers, proper nouns, topic words), in chronological order. */
function keyPoints(segments: TranscriptSegment[], events: ScreenEvent[], topics: string[]): string[] {
  const topicStems = new Set(topics.map((t) => stem(t.toLowerCase())))
  const cands: { t: number; text: string; score: number }[] = []
  for (const seg of segments) {
    for (const s of sentences(seg.text)) {
      const w = words(s)
      if (w.length < 5) continue
      let score = 0
      w.forEach((x) => {
        if (topicStems.has(stem(x))) score += 2
        if (/\d|\$|dollars?|yen|hundred|thousand/.test(x)) score += 1.5
      })
      score += (s.match(/\s[A-Z][a-z]+/g) ?? []).length
      if (/^(okay|hmm|um|so)\b/i.test(s) && w.length < 8) score -= 2
      cands.push({ t: seg.tStart, text: truncate(s.replace(/^((okay|ok|so|hmm|um|uh|alright|well|right)[,\s]+)+/i, '').replace(/^\w/, (c) => c.toUpperCase()), 140), score })
    }
  }
  const picked = [...cands].sort((a, b) => b.score - a.score).slice(0, segments.length > 4 ? 6 : 4)
  const points = picked.sort((a, b) => a.t - b.t).map((p) => p.text.replace(/[.!]+$/, ''))
  if (points.length < 3) {
    for (const e of events.slice(0, 4 - points.length)) points.push(`On screen at ${fmtClock(e.t)}: ${truncate(e.description, 120)}`)
  }
  return points
}

/** Evenly samples a merged speech + screen timeline (max ~14 items). */
function timeline(segments: TranscriptSegment[], events: ScreenEvent[], max = 14): TimelineItem[] {
  const all: TimelineItem[] = [
    ...segments.map((s) => {
      const first = sentences(s.text)[0] ?? s.text
      return { t: s.tStart, kind: 'speech' as const, text: truncate(words(first).length >= 6 ? first : s.text, 90) }
    }),
    ...events.map((e) => ({ t: e.t, kind: 'screen' as const, text: truncate(e.description, 90) }))
  ].sort((a, b) => a.t - b.t || (a.kind === 'screen' ? -1 : 1))
  if (all.length <= max) return all
  const step = all.length / max
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * step)]!)
}

const prose = (t: Topic): string => (t.proper ? t.label : t.label.toLowerCase())

function shortTitle(topics: Topic[], events: ScreenEvent[], segments: TranscriptSegment[]): string {
  if (topics.length >= 2) return truncate(capitalize(`${prose(topics[0]!)}, ${prose(topics[1]!)}${topics[2] ? ` & ${prose(topics[2])}` : ''}`), 48)
  if (topics.length === 1) return `${capitalize(topics[0]!.label)} notes`
  if (events[0]) return truncate(events[0].description, 48)
  if (segments[0]) return truncate(segments[0].text, 48)
  return 'Quiet session'
}

export function mockSummary(detail: SessionDetail): SummaryDraft {
  if (detail.isDemo) {
    return { title: detail.title, summary: { ...DEMO_SUMMARY, generatedAt: nowIso(), model: 'mock' } }
  }
  const { segments } = detail
  // Screenshots where nothing could be detected carry no information for a summary.
  const events = detail.events.filter((e) => !/^Screen captured\b/i.test(e.description))
  if (!segments.length && !events.length && detail.events.length) {
    const r = Math.round(detail.durationS)
    return {
      title: 'Screen recording',
      summary: {
        tldr: `A ${r}s screen-only session — no speech was transcribed, and the app on screen couldn't be identified. The screen recording is saved in your vault.`,
        keyPoints: [],
        timeline: [],
        topics: [],
        actionItems: [],
        generatedAt: nowIso(),
        model: 'mock'
      }
    }
  }
  if (!segments.length && !events.length) {
    return {
      title: 'Quiet session',
      summary: {
        tldr: 'Nothing was captured in this session — no speech was transcribed and no screen activity was recorded. Try recording again a little closer to the mic.',
        keyPoints: [],
        timeline: [],
        topics: [],
        actionItems: [],
        generatedAt: nowIso(),
        model: 'mock'
      }
    }
  }
  const topicList = extractTopicList(segments, events)
  const topics = topicList.map((t) => capitalize(t.label))
  const dur = detail.durationS || Math.max(0, ...segments.map((s) => s.tEnd), ...events.map((e) => e.t))
  const r = Math.round(dur)
  const mins = r >= 60 ? `${Math.floor(r / 60)}m${r % 60 ? ` ${r % 60}s` : ''}` : `${r}s`
  const about = topicList.length ? ` about ${joinList(topicList.slice(0, 3).map(prose))}` : ''
  const unq = (x: string, n: number): string => truncate(x.replace(/[.!?]+$/, ''), n).replace(/[.!?]+$/, '')
  const parts: string[] = []
  if (segments.length) {
    const firstS = sentences(segments[0]!.text)[0] ?? segments[0]!.text
    const lastSeg = segments[segments.length - 1]!
    const lastS = sentences(lastSeg.text).slice(-1)[0] ?? lastSeg.text
    parts.push(`A ${mins} session${about}.`)
    parts.push(
      segments.length > 1 && lastS !== firstS
        ? `You started with “${unq(firstS, 90)}” and wrapped up with “${unq(lastS, 90)}”.`
        : `You said: “${unq(firstS, 140)}”.`
    )
  } else {
    parts.push(`A ${mins} screen-only session${about} — no speech was transcribed.`)
  }
  if (events.length) {
    const d = unq(events[0]!.description.replace(/^\w/, (c) => c.toLowerCase()), 90)
    parts.push(`On screen you were ${d}${events.length > 1 ? `, plus ${events.length - 1} more moment${events.length > 2 ? 's' : ''}` : ''}.`)
  }
  const tldr = parts.join(' ')
  return {
    title: shortTitle(topicList, events, segments),
    summary: {
      tldr,
      keyPoints: keyPoints(segments, events, topics),
      timeline: timeline(segments, events),
      topics,
      actionItems: extractActionItems(segments).map((text) => ({ text, done: false })),
      generatedAt: nowIso(),
      model: 'mock'
    }
  }
}
