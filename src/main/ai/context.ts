// OWNER: subagent B. Builds the text context block (transcript + screen descriptions) sent to Claude.
import type { ScreenEvent, SessionDetail, TranscriptSegment } from '../../shared/types'
import { fmtClock, selectWindow, type TimeWindow } from './timeWindow'
import { parseScreenText, visibleExcerpt } from '../screen/describe'

export interface BuiltContext {
  text: string
  window: TimeWindow
  segments: TranscriptSegment[]
  events: ScreenEvent[]
  fellBack: boolean
  /** What the question asked for, even if we fell back (for honest wording). */
  requestedLabel: string | null
}

export function formatStarted(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function transcriptLines(segments: TranscriptSegment[]): string {
  return segments.map((s) => `[${fmtClock(s.tStart)}] ${s.text.trim()}`).join('\n')
}

/**
 * One line per screenshot, plus (when captured on-device) the page URL and a short visible-text excerpt.
 * Excerpts are capped per event and in total so prompts stay small.
 */
export function screenLines(events: ScreenEvent[], perEvent = 200, totalCap = 2400): string {
  let budget = totalCap
  return events
    .map((e) => {
      let s = `[${fmtClock(e.t)}] ${e.description.trim()}`
      if (!e.screenText) return s
      const p = parseScreenText(e.screenText)
      if (p.url) s += `\n    URL: ${p.url}`
      const v = budget > 40 ? visibleExcerpt(e.screenText, Math.min(perEvent, budget)) : null
      if (v) {
        s += `\n    visible text: ${v}`
        budget -= v.length
      }
      return s
    })
    .join('\n')
}

/** Context for a question (time-filtered) or for the whole session (question omitted). */
export function buildContext(detail: SessionDetail, question = ''): BuiltContext {
  const sel = selectWindow(question, detail.durationS, detail.segments, detail.events)
  const requested = question ? selectWindow(question, detail.durationS, [{ tStart: 0, tEnd: 1e9 }], []).window : null
  const w = sel.window
  const header = [
    `Session title: ${detail.title}`,
    `Recorded: ${formatStarted(detail.startedAt)}`,
    `Duration: ${fmtClock(detail.durationS)} (timestamps below are minutes:seconds from the start of the recording)`,
    sel.fellBack && requested && !requested.whole
      ? `Time window used: whole session ${fmtClock(0)}–${fmtClock(w.end)} (the user asked about ${requested.label}, but nothing was captured in that range)`
      : w.whole
        ? `Time window used: whole session ${fmtClock(0)}–${fmtClock(w.end)}`
        : `Time window used: ${fmtClock(w.start)}–${fmtClock(w.end)} (${w.label}); only lines from this window are included`
  ].join('\n')
  const speech = sel.segments.length ? transcriptLines(sel.segments) : '(no speech was transcribed in this window)'
  const screen = sel.events.length ? screenLines(sel.events) : '(no screen activity was captured in this window)'
  const text = `${header}\n\nTRANSCRIPT (what the user said, from the microphone):\n${speech}\n\nSCREEN ACTIVITY (one-line descriptions of screenshots taken every ~15 seconds; when available, the page URL and an excerpt of the text visible on screen):\n${screen}`
  return {
    text,
    window: w,
    segments: sel.segments,
    events: sel.events,
    fellBack: sel.fellBack,
    requestedLabel: requested && !requested.whole ? requested.label : null
  }
}
