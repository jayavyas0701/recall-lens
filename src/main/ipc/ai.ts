// OWNER: subagent B (Summary & Ask Claude).
import type { IpcMainInvokeEvent } from 'electron'
import type Anthropic from '@anthropic-ai/sdk'
import { CH, MODELS, type AskInput, type QARow, type SessionDetail, type SessionSummary } from '../../shared/types'
import { all, get, nowIso, run } from '../db'
import { log } from '../log'
import { getAnthropic } from '../ai/client'
import { buildContext } from '../ai/context'
import { mockAnswer, wordChunks } from '../ai/mockAsk'
import { askSystemPrompt, askUserPrompt } from '../ai/prompts'
import { generateSummary, storeSummary } from '../ai/summarize'
import { firstName, introducedName } from '../ai/text'
import { requireUser } from './auth'
import { getSessionDetail, latestSessionId } from './sessions'
import { sessionAccess } from '../access'
import { fail, handle, handleResult, handleWithEvent, ok } from './util'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const MOCK_WORD_MS = 25

/** In-flight summaries per session, so concurrent callers share one generation. */
const inflight = new Map<number, Promise<SessionSummary>>()

export async function summarizeSession(detail: SessionDetail, userName: string, force: boolean): Promise<SessionSummary> {
  if (!force && detail.summary) return detail.summary
  const running = inflight.get(detail.id)
  if (running && !force) return running
  // A forced run (e.g. right after transcription) must not reuse an older in-flight generation.
  if (running) await running.catch(() => undefined)
  const p = (async () => {
    const draft = await generateSummary(detail, userName)
    storeSummary(detail, draft)
    return draft.summary
  })().finally(() => inflight.delete(detail.id))
  inflight.set(detail.id, p)
  return p
}

function toQA(r: Record<string, unknown>): QARow {
  return {
    id: Number(r.id),
    sessionId: r.session_id == null ? null : Number(r.session_id),
    question: String(r.question),
    answer: String(r.answer),
    createdAt: String(r.created_at)
  }
}

async function streamClaude(
  client: Anthropic,
  detail: SessionDetail | null,
  question: string,
  system: string,
  send: (d: string) => void,
  opts: { webSearch: boolean } = { webSearch: false }
): Promise<{ text: string; sent: number }> {
  const ctxText =
    detail && !detail.access.ai
      ? 'PRIVATE SESSION: the user turned OFF your access to the selected recording, so you cannot see any of its content. ' +
        'If they ask about it, say plainly that you don’t have access to this session and that they can allow it in the session’s Access settings. ' +
        'You may still answer general questions that don’t need the recording.'
      : detail
        ? buildContext(detail, question).text
        : 'No recording is selected yet (the user has no sessions).'
  // Short memory of this chat (last 3 turns) so follow-up questions work.
  // Private sessions: don't replay earlier Q&A either (it may quote the session).
  const prior = detail && !detail.access.ai ? [] : all<Record<string, unknown>>(
    'SELECT question, answer FROM qa_history WHERE user_id = ? AND session_id IS ? ORDER BY id DESC LIMIT 3',
    [detail?.userId ?? -1, detail?.id ?? null]
  ).reverse()
  const messages: Anthropic.MessageParam[] = [
    ...prior.flatMap((r) => [
      { role: 'user' as const, content: String(r.question) },
      { role: 'assistant' as const, content: String(r.answer) }
    ]),
    { role: 'user', content: askUserPrompt(ctxText, question) }
  ]
  const tools: Anthropic.ToolUnion[] | undefined = opts.webSearch ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] : undefined
  let text = ''
  let sent = 0
  const sources = new Map<string, string>()
  // A web-search turn can pause ("pause_turn"); continue it at most twice.
  for (let round = 0; round < 3; round++) {
    const stream = client.messages.stream({ model: MODELS.smart, max_tokens: opts.webSearch ? 1600 : 900, system, messages, ...(tools ? { tools } : {}) })
    let afterTool = false
    stream.on('streamEvent', (ev) => {
      if (ev.type === 'content_block_start' && (ev.content_block.type === 'server_tool_use' || ev.content_block.type === 'web_search_tool_result')) afterTool = true
    })
    stream.on('text', (delta) => {
      // Text that resumes after a web search starts a new paragraph ("Let me look that up." → results).
      if (afterTool && text.trim()) {
        const br = text.endsWith('\n\n') ? '' : '\n\n'
        text += br
        send(br)
      }
      afterTool = false
      text += delta
      sent += delta.length
      send(delta)
    })
    const final = await stream.finalMessage()
    for (const b of final.content) {
      if (b.type === 'text' && Array.isArray(b.citations)) {
        for (const c of b.citations) if (c.type === 'web_search_result_location' && c.url) sources.set(c.url, c.title || new URL(c.url).hostname)
      }
    }
    if (final.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: final.content })
  }
  if (sources.size && !/\]\(https?:/.test(text)) {
    const list = [...sources].slice(0, 4).map(([url, title]) => `- [${title.slice(0, 80)}](${url})`).join('\n')
    const tail = `\n\n**Sources**\n${list}`
    text += tail
    send(tail)
  }
  return { text: text.trim(), sent }
}

async function streamMock(text: string, send: (d: string) => void): Promise<string> {
  for (const w of wordChunks(text)) {
    send(w)
    await sleep(MOCK_WORD_MS)
  }
  return text
}

export function registerAi(): void {
  handleResult(CH.aiSummarize, async (sessionId: number, force?: boolean) => {
    const u = requireUser()
    const detail = getSessionDetail(Number(sessionId), u.id)
    if (detail?.isLockedNow) return fail('This session is locked. Unlock it with your password first.')
    if (!detail) return fail('Session not found')
    return ok(await summarizeSession(detail, u.name, !!force))
  })

  handleWithEvent(CH.aiAsk, async (event: IpcMainInvokeEvent, input: AskInput) => {
    const u = requireUser()
    const question = String(input?.question ?? '').trim().slice(0, 2000)
    if (!question) return fail('Ask me something first 🙂')
    const requestId = String(input?.requestId ?? '')
    const send = (delta: string): void => {
      if (!event.sender.isDestroyed()) event.sender.send(CH.aiAskDelta, { requestId, delta })
    }
    const sid = input?.sessionId != null ? Number(input.sessionId) : latestSessionId(u.id)
    const detail = sid ? getSessionDetail(sid, u.id) : null
    if (input?.sessionId != null && !detail) return fail('Session not found')

    const fName = firstName(u.name)
    const introducedAs = introducedName(question)
    const priorCount = Number(
      get<{ n: number }>('SELECT COUNT(*) AS n FROM qa_history WHERE user_id = ? AND session_id IS ?', [u.id, detail?.id ?? null])?.n ?? 0
    )
    const greet = priorCount === 0

    const mode = input?.mode === 'recording' ? 'recording' : 'smart'
    let answer: string | null = null
    if (detail?.isLockedNow) {
      answer = await streamMock('🔒 This session is locked. Unlock it with your password (the lock button above), then ask again.', send)
      return ok(answer)
    }
    // Per-session privacy: when Claude access is off, nothing from this session is sent to the cloud.
    // Per-session privacy: when Claude access is off, the assistant gets NO content from this session.
    const isPrivate = !!detail && !detail.access.ai
    if (isPrivate && mode === 'recording') {
      answer = await streamMock(
        '🔒 You turned off Claude’s access to this session, so I can’t read it, and nothing from it is sent anywhere. ' +
          'To ask about it, open **Access** and turn on Claude AI access, or switch to Smart mode for general questions.',
        send
      )
      return ok(answer)
    }
    const cloudAllowed = true // private sessions are never put in the prompt (see streamClaude)
    const client = getAnthropic()
    const hasContext = !!detail && !isPrivate && (detail.segments.length > 0 || detail.events.length > 0)
    if (client && (hasContext || mode === 'smart')) {
      let partial = ''
      try {
        const system = askSystemPrompt({ userName: u.name, firstName: fName, greet, introducedAs, mode })
        const onDelta = (d: string): void => {
          partial += d
          send(d)
        }
        let r: { text: string }
        try {
          r = await streamClaude(client, detail, question, system, onDelta, { webSearch: mode === 'smart' })
        } catch (e) {
          // Web search may be unavailable for this API key/org — retry once without it if nothing was shown yet.
          if (mode !== 'smart' || partial) throw e
          log.warn('Ask with web search failed, retrying without it:', (e as { status?: number }).status ?? (e as Error).message)
          r = await streamClaude(client, detail, question, system, onDelta, { webSearch: false })
        }
        answer = r.text || null
      } catch (e) {
        log.error('Claude ask failed — falling back to mock answer', e)
        if (partial.length > 0) {
          // Part of an answer is already on screen: finish it gracefully rather than starting a second one.
          const tail = '…\n\n(The connection dropped — ask again for the full answer.)'
          send(tail)
          answer = partial + tail
        }
      }
    }
    if (answer == null) {
      let mock = isPrivate
        ? '🔒 You turned off Claude’s access to this session, so I can’t read it. Turn on Claude AI access in the session’s Access settings to ask about it.'
        : mockAnswer({ detail, question, firstName: fName, greet, introducedAs })
      if (!client && mode === 'smart' && /don.t see|isn.t in|not in (this|the) recording|can.t find/i.test(mock))
        mock += '\n\n_For questions beyond your recording (places, facts, ideas), turn on live Claude in **Settings → AI & privacy**._'
      void cloudAllowed
      answer = await streamMock(mock, send)
    }

    run('INSERT INTO qa_history(user_id, session_id, question, answer, created_at) VALUES(?,?,?,?,?)', [
      u.id,
      detail?.id ?? null,
      question,
      answer,
      nowIso()
    ])
    return ok(answer)
  })

  handle(CH.aiHistory, (sessionId: number | null): QARow[] => {
    const u = requireUser()
    const sid = sessionId != null ? Number(sessionId) : latestSessionId(u.id)
    if (sid && sessionAccess(sid)?.lockedNow) return [] // locked sessions hide their chat history too
    return all<Record<string, unknown>>(
      'SELECT * FROM qa_history WHERE user_id = ? AND session_id IS ? ORDER BY id DESC LIMIT 50',
      [u.id, sid ?? null]
    )
      .reverse()
      .map(toQA)
  })
}
