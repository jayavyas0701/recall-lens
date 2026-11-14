// OWNER: subagent B. Mock "Ask Claude" — reads the real session context and answers deterministically.
import type { ScreenEvent, SessionDetail, SessionSummary, TranscriptSegment } from '../../shared/types'
import { extractActionItems, mockSummary } from './mock'
import { contentStems, joinList, truncate } from './text'
import { fmtClock, parseTimeWindow, selectWindow } from './timeWindow'
import { extractSearchResults, parseScreenText } from '../screen/describe'

const SEARCH_RE =
  /\b(open(?:ed|ing)?|see|saw|seen|what\s+(?:app|site|page|website|tab)s?|which\s+(?:app|site|page|website|tab)s?|search(?:ed|ing)?|look(?:ing|ed)?\s+(?:for|up|at|into)|look\s+up|googl\w*|on\s+(?:my\s+|the\s+)?screen|brows\w*|websites?|sites?|tabs?|viewing|view(?:ed)?|watch(?:ing|ed)?|reading|research(?:ing|ed)?)\b/i
const SUMMARY_RE =
  /\b(summari[sz]e|summary|recap|overview|tl;?dr|gist|highlights?|what\s+happened|what\s+(?:did|was)\s+i\s+(?:talk(?:ing)?|speak(?:ing)?)\s+about|what\s+(?:was|is)\s+(?:the|my|this)\s+(?:session|conversation|recording)\s+about|what\s+did\s+i\s+(?:do|cover|discuss))\b/i
const ACTIONS_RE = /\b(action\s+items?|to-?dos?|tasks?|next\s+steps|follow[- ]?ups?|what\s+(?:do|should)\s+i\s+(?:need\s+to\s+)?do|what\s+did\s+i\s+(?:need|have)\s+to\s+do)\b/i

const line = (t: number, text: string): string => `- **${fmtClock(t)}** — ${text.trim()}`
const range = (a: number, b: number): string => `${fmtClock(a)}–${fmtClock(b)}`

export interface MockAskInput {
  detail: SessionDetail | null
  question: string
  firstName: string
  greet: boolean
  introducedAs: string | null
}

function greeting(i: MockAskInput): string {
  const name = i.introducedAs ?? i.firstName
  return i.introducedAs || i.greet ? `Hi ${name}! 👋 ` : ''
}

function summaryOf(detail: SessionDetail): SessionSummary {
  return detail.summary ?? mockSummary(detail).summary
}

const RESULT_RE = /\b(results?|top\s+(?:hits?|links?)|first\s+(?:link|hit)|what\s+came\s+up|what\s+did\s+i\s+find|found)\b/i
const QUERY_RE = /\b(search(?:ed|ing)?|look(?:ing|ed)?\s+up|googl\w*|query|queries)\b/i
const QUERY_PARAMS = ['q', 'search_query', 'k', 'ss', 'query', 'p']

interface ScreenFacts {
  query: string | null
  results: string[]
  host: string | null
  visible: string | null
}

/** What we know about one screenshot: the search query (URL or description), top results, site and visible text. */
function factsOf(e: ScreenEvent): ScreenFacts {
  const p = parseScreenText(e.screenText)
  let query: string | null = null
  let host: string | null = null
  if (p.url) {
    try {
      const u = new URL(p.url)
      host = u.hostname.replace(/^www\./, '')
      for (const k of QUERY_PARAMS) {
        const v = u.searchParams.get(k)
        if (v && v.trim()) {
          query = v.trim()
          break
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (!query) query = /\b(?:for|Asking \w+)\s+["“'‘]([^"”’]+?)["”'’](?=\s|$|[,.;—-])/.exec(e.description)?.[1] ?? null
  const fromDesc = /top results:\s*(.+)$/i.exec(e.description)?.[1]?.split(/,\s*/).filter(Boolean) ?? []
  const results = fromDesc.length ? fromDesc : extractSearchResults(p.visible, query ?? '')
  return { query, results, host, visible: p.visible }
}

function screenLine(e: ScreenEvent): string {
  const f = factsOf(e)
  const site = f.host && !e.description.toLowerCase().includes(f.host.split('.')[0]!) ? ` (${f.host})` : ''
  return line(e.t, `${e.description}${site}`)
}

function searchAnswer(events: ScreenEvent[], windowNote: string, wantResults: boolean): string | null {
  const searches = events.map((e) => ({ e, f: factsOf(e) })).filter((x) => x.f.query)
  if (!searches.length) return null
  const seen = new Set<string>()
  const uniq = searches.filter((x) => {
    const k = x.f.query!.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const lead =
    uniq.length === 1
      ? `You searched for **“${uniq[0]!.f.query}”**${windowNote} (at ${fmtClock(uniq[0]!.e.t)}).`
      : `You searched for ${joinList(uniq.map((x) => `**“${x.f.query}”**`))}${windowNote}.`
  const rows = uniq.map((x) => {
    const res = x.f.results.length ? ` — top results: ${x.f.results.slice(0, 3).map((r) => `“${truncate(r, 60)}”`).join(', ')}` : ''
    return line(x.e.t, `${x.e.description.replace(/\s+—\s+top results:.*$/i, '')}${res}`)
  })
  const noResults = wantResults && !uniq.some((x) => x.f.results.length) ? `\n\nI couldn't read the individual results on screen, only the searches themselves.` : ''
  const others = events.filter((e) => !searches.some((s) => s.e === e)).slice(0, 4)
  const also = others.length ? `\n\nAlso on screen: ${others.map((e) => `${truncate(e.description, 70)} (${fmtClock(e.t)})`).join('; ')}.` : ''
  return `${lead}\n\n${rows.join('\n')}${noResults}${also}`
}

function screenAnswer(question: string, events: ScreenEvent[], windowNote: string, topics: string[]): string {
  if (!events.length) return `I don't see any screen activity${windowNote} in this recording, so I can't tell what you were looking at.`
  const meaningful = events.filter((e) => !/^Screen captured\b/i.test(e.description))
  if (!meaningful.length) {
    return `I have ${events.length} screenshot${events.length > 1 ? 's' : ''}${windowNote}, but the app and page weren't detected, so I can't say exactly what was on screen. (On macOS, granting Screen Recording permission lets Context Vault read window titles.)`
  }
  if (QUERY_RE.test(question) || RESULT_RE.test(question)) {
    const s = searchAnswer(meaningful, windowNote, RESULT_RE.test(question))
    if (s) return s
  }
  const lookups = meaningful.filter((e) => /search|look|brows|view|compar|read|check|using|watch|edit|open|shopping|chatting|listening|review/i.test(e.description))
  const list = (lookups.length ? lookups : meaningful).map(screenLine)
  const themes = topics.length ? `\n\nThe common thread: **${joinList(topics.slice(0, 5))}**.` : ''
  return `Here's what you were looking at on screen${windowNote}:\n\n${list.join('\n')}${themes}`
}

/** A short window of visible text around the first matching word. */
function snippetAround(text: string, stems: Set<string>, max = 110): string | null {
  const flat = text.replace(/\s+/g, ' ')
  const tokens = flat.split(' ')
  const i = tokens.findIndex((tok) => contentStems(tok).some((w) => stems.has(w)))
  if (i < 0) return null
  const from = Math.max(0, i - 6)
  let out = tokens.slice(from, from + 20).join(' ')
  if (out.length > max) out = out.slice(0, max - 1) + '…'
  return `${from > 0 ? '…' : ''}${out}`
}

function keywordAnswer(question: string, segments: TranscriptSegment[], events: ScreenEvent[], topics: string[]): string {
  const q = new Set(contentStems(question))
  if (q.size) {
    const scored = [
      ...segments.map((s) => ({ t: s.tStart, text: s.text, kind: 'speech' as const })),
      ...events.map((e) => ({ t: e.t, text: e.description, kind: 'screen' as const, visible: parseScreenText(e.screenText).visible ?? '', url: parseScreenText(e.screenText).url ?? '' }))
    ]
      .map((x) => {
        const main = contentStems(x.text).filter((w) => q.has(w))
        const extra = 'visible' in x ? contentStems(`${x.url.replace(/[/?=&+._-]+/g, ' ')} ${x.visible}`).filter((w) => q.has(w)) : []
        const hits = [...main, ...extra]
        // Matches in the one-line description count more than matches buried in OCR text.
        const score = new Set(main).size * 2 + new Set(extra.filter((w) => !main.includes(w))).size
        const fresh = new Set(extra.filter((w) => !main.includes(w)))
        const snippet = 'visible' in x && fresh.size ? snippetAround(x.visible, fresh) : null
        return { ...x, score, hits, snippet }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.t - b.t)
      .slice(0, 5)
      .sort((a, b) => a.t - b.t)
    if (scored.length) {
      const matched = [...new Set(scored.flatMap((s) => s.hits))].slice(0, 3)
      const label = matched.length ? ` about **${joinList(matched)}**` : ''
      return `Here's what I found${label} in this recording:\n\n${scored
        .map((s) =>
          line(
            s.t,
            s.kind === 'screen'
              ? `On screen: ${truncate(s.text, 150)}${s.snippet ? ` — visible text: “${s.snippet}”` : ''}`
              : `You said: “${truncate(s.text, 150)}”`
          )
        )
        .join('\n')}`
    }
  }
  const covers = topics.length ? ` It covers ${joinList(topics.slice(0, 5).map((t) => t.toLowerCase()))} — try asking about one of those.` : ''
  return `I don't see that in this recording. I can only answer from what you said and what was on your screen during the session.${covers}`
}

/** Builds the full mock answer text (streamed word-by-word by the caller). */
export function mockAnswer(i: MockAskInput): string {
  const hi = greeting(i)
  const d = i.detail
  if (!d) {
    return `${hi}I don't have any recordings to look at yet. Record a session (or load the demo session from Settings) and I'll answer from exactly what you said and saw.`
  }
  if (!d.segments.length && !d.events.length) {
    return `${hi}This session (“${d.title}”) doesn't have any transcript or screen activity yet, so there's nothing for me to answer from. If it's still processing, give it a moment and ask again.`
  }
  const q = i.question
  const sel = selectWindow(q, d.durationS, d.segments, d.events)
  const asked = parseTimeWindow(q, d.durationS || Math.max(0, ...d.segments.map((s) => s.tEnd), ...d.events.map((e) => e.t)))
  const w = sel.window
  const windowNote = w.whole
    ? ''
    : /^\d/.test(w.label)
      ? ` between ${fmtClock(w.start)} and ${fmtClock(w.end)}`
      : /^around/.test(w.label)
        ? ` ${w.label} (${range(w.start, w.end)})`
        : ` ${/^the (beginning|end)$/.test(w.label) ? 'at' : 'in'} ${w.label} (${range(w.start, w.end)})`
  const fellBackNote = sel.fellBack && !asked.whole ? `I didn't capture anything in ${asked.label}, so I looked at the whole session instead.\n\n` : ''
  const summary = summaryOf(d)
  const topics = summary.topics

  // 1) To-dos
  if (ACTIONS_RE.test(q)) {
    const items = w.whole ? summary.actionItems.map((a) => a.text) : extractActionItems(sel.segments)
    if (!items.length) return `${hi}${fellBackNote}I didn't hear any action items${windowNote}.`
    return `${hi}${fellBackNote}Here are the action items you mentioned${windowNote}:\n\n${items.map((t) => `- ${t}`).join('\n')}`
  }

  // 2) Screen / search questions
  if (SEARCH_RE.test(q) || (RESULT_RE.test(q) && sel.events.some((e) => factsOf(e).query))) return `${hi}${fellBackNote}${screenAnswer(q, sel.events, windowNote, w.whole ? topics : [])}`

  // 3) Time-window recap ("what did I say in the last minute?")
  if (!w.whole) {
    if (!sel.segments.length) {
      return `${hi}You didn't say anything${windowNote}. On screen you were:\n\n${sel.events.map((e) => line(e.t, e.description)).join('\n')}`
    }
    const todos = extractActionItems(sel.segments, 6)
    const todoBlock = todos.length ? `\n\n**To-dos you mentioned:** ${todos.map((t) => t.replace(/^\w/, (c) => c.toLowerCase())).join('; ')}.` : ''
    const screen = sel.events.length
      ? `\n\n**On screen at the time:** ${sel.events.map((e) => `${truncate(e.description, 70)} (${fmtClock(e.t)})`).join('; ')}.`
      : ''
    return `${hi}Here's what you said${windowNote}:\n\n${sel.segments.map((s) => line(s.tStart, s.text)).join('\n')}${todoBlock}${screen}`
  }

  // 4) Summaries
  if (SUMMARY_RE.test(q)) {
    const kp = summary.keyPoints.slice(0, 6).map((k) => `- ${k}`).join('\n')
    const acts = summary.actionItems.length ? `\n\n**Action items:** ${summary.actionItems.map((a) => a.text.replace(/^\w/, (c) => c.toLowerCase())).join('; ')}.` : ''
    return `${hi}Here's the recap of **${d.title}**:\n\n**TL;DR:** ${summary.tldr}${kp ? `\n\n**Key points:**\n${kp}` : ''}${acts}`
  }

  // 5) Keyword lookup across speech + screen
  return `${hi}${fellBackNote}${keywordAnswer(q, sel.segments, sel.events, topics)}`
}

/** Splits text into word-sized chunks that keep their trailing whitespace/newlines. */
export function wordChunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

