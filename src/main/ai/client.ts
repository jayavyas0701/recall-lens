// OWNER: orchestrator. Anthropic client (main process only) + screenshot description.
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env'
import { log } from '../log'
import { MODELS } from '../../shared/types'
import { appLabel, cleanTitle, describeContext, sanitizeUrl, type ScreenContext } from '../screen/describe'

let client: Anthropic | null = null
let clientKey: string | undefined

/** Returns a client, or null when ANTHROPIC_API_KEY is missing (→ use mock fallbacks). */
export function getAnthropic(): Anthropic | null {
  const key = env.anthropicKey
  if (!key) return null
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, timeout: 30_000, maxRetries: 1 }) // fail fast on flaky venue Wi-Fi → mock fallback
    clientKey = key
  }
  return client
}

export const hasAnthropic = (): boolean => !!env.anthropicKey

/** Extract concatenated text from a Messages API response. */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/** Text block telling Claude what the OS reported about the screen at that moment. */
function contextPrompt(ctx: ScreenContext | null | undefined): string {
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.app) parts.push(`Frontmost app: ${appLabel(ctx.app)}`)
  if (ctx.title) parts.push(`window title: ${cleanTitle(ctx.title)}`)
  const url = sanitizeUrl(ctx.url)
  if (url) parts.push(`URL: ${url}`)
  if (ctx.ocr) parts.push(`visible text excerpt: ${ctx.ocr.replace(/\s+/g, ' ').slice(0, 900)}`)
  return parts.length ? `Context captured on-device at the same moment — ${parts.join('; ')}.` : ''
}

/**
 * One-line description of a screenshot.
 * With an API key: Claude (vision) + the on-device context (app, title, URL, OCR excerpt) for precise queries/results.
 * Without a key or on any API error: the offline describer, built from the same on-device context.
 */
export async function describeScreenshot(jpegBase64: string, t: number, ctx?: ScreenContext | null, allowCloud = true): Promise<string> {
  const offline = describeContext(ctx)
  const c = allowCloud ? getAnthropic() : null // per-session privacy: screenshots never leave the device when off
  if (!c) return offline
  try {
    const extra = contextPrompt(ctx)
    const msg = await c.messages.create({
      model: MODELS.fast,
      max_tokens: 120,
      system:
        'You describe screenshots for a personal memory app. Reply with ONE line (max 25 words) saying what the user is doing on screen. ' +
        'Name the specific search query, site or app, document/page title and the key result or item visible. ' +
        'Start with a verb like "Searching", "Viewing", "Editing", "Watching". No preamble, no quotes around the whole line.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: `${extra ? `${extra}\n\n` : ''}Describe what is on screen at ${Math.round(t)}s in one line.` }
          ]
        }
      ]
    })
    const line = textOf(msg).split('\n')[0]?.trim()
    return line || offline
  } catch (e) {
    log.error('describeScreenshot failed — using the on-device description', e instanceof Error ? e.message : e)
    return offline
  }
}
