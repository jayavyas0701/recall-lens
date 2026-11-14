// OWNER: subagent A. Offline, on-device screen describer: {app, title, url, ocr} → one specific line.
// Pure functions only (no Electron / fs) so they can be unit-tested in plain Node.

export interface ScreenContext {
  app: string | null
  title: string | null
  url: string | null
  ocr: string | null
}

export const NOTHING_CAPTURED = 'Screen captured (app not detected)'
const MAX_WORDS = 25

// ---------- small helpers ----------
const ZW = /[​-‍⁠﻿]/g
const clean = (s: string | null | undefined): string => (s ?? '').replace(ZW, '').replace(/\s+/g, ' ').trim()
const SEP = /\s+[-–—|·]\s+/

/** Quote a fragment, capped so one long title can't eat the whole line. */
function q(s: string, maxChars = 64): string {
  let t = clean(s).replace(/^["“”']+|["“”']+$/g, '')
  if (t.length > maxChars) t = t.slice(0, maxChars - 1).replace(/\s+\S*$/, '') + '…'
  return `"${t}"`
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function capWords(s: string, max = MAX_WORDS): string {
  const w = s.split(/\s+/).filter(Boolean)
  if (w.length <= max) return s
  let out = w.slice(0, max).join(' ').replace(/[,;:—–-]+$/, '')
  if ((out.match(/"/g) ?? []).length % 2 === 1) out += '…"'
  else out += '…'
  return out
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s.replace(/\+/g, ' ')
  }
}

const titleCaseWord = (w: string): string => (w ? w[0]!.toUpperCase() + w.slice(1) : w)

// ---------- apps & browsers ----------
const BROWSERS: Record<string, string> = {
  'google chrome': 'Chrome',
  'google chrome canary': 'Chrome',
  'google chrome beta': 'Chrome',
  chrome: 'Chrome',
  chromium: 'Chromium',
  arc: 'Arc',
  'brave browser': 'Brave',
  brave: 'Brave',
  'microsoft edge': 'Edge',
  msedge: 'Edge',
  safari: 'Safari',
  'safari technology preview': 'Safari',
  firefox: 'Firefox',
  'firefox developer edition': 'Firefox',
  'firefox nightly': 'Firefox',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
  'zen browser': 'Zen',
  zen: 'Zen',
  orion: 'Orion',
  'microsoft-edge': 'Edge'
}

const APP_ALIASES: Record<string, string> = {
  code: 'VS Code',
  'visual studio code': 'VS Code',
  'code - insiders': 'VS Code',
  'code - oss': 'VS Code',
  electron: 'Electron',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  zed: 'Zed',
  'sublime text': 'Sublime Text',
  sublime_text: 'Sublime Text',
  idea: 'IntelliJ IDEA',
  idea64: 'IntelliJ IDEA',
  webstorm: 'WebStorm',
  webstorm64: 'WebStorm',
  pycharm: 'PyCharm',
  pycharm64: 'PyCharm',
  xcode: 'Xcode',
  terminal: 'Terminal',
  iterm2: 'iTerm',
  iterm: 'iTerm',
  warp: 'Warp',
  ghostty: 'Ghostty',
  alacritty: 'Alacritty',
  kitty: 'kitty',
  windowsterminal: 'Windows Terminal',
  'windows terminal': 'Windows Terminal',
  'gnome-terminal-server': 'Terminal',
  'gnome-terminal': 'Terminal',
  konsole: 'Konsole',
  powershell: 'PowerShell',
  pwsh: 'PowerShell',
  cmd: 'Command Prompt',
  finder: 'Finder',
  explorer: 'File Explorer',
  nautilus: 'Files',
  'org.gnome.nautilus': 'Files',
  slack: 'Slack',
  'zoom.us': 'Zoom',
  zoom: 'Zoom',
  'ms-teams': 'Teams',
  teams: 'Teams',
  'microsoft teams': 'Teams',
  spotify: 'Spotify',
  figma: 'Figma',
  notion: 'Notion',
  winword: 'Word',
  'microsoft word': 'Word',
  excel: 'Excel',
  'microsoft excel': 'Excel',
  powerpnt: 'PowerPoint',
  'microsoft powerpoint': 'PowerPoint',
  outlook: 'Outlook',
  'microsoft outlook': 'Outlook',
  olk: 'Outlook',
  mail: 'Mail',
  messages: 'Messages',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  notes: 'Notes',
  obsidian: 'Obsidian',
  bear: 'Bear',
  preview: 'Preview',
  acrobat: 'Acrobat',
  'adobe acrobat': 'Acrobat',
  acrord32: 'Acrobat',
  pages: 'Pages',
  numbers: 'Numbers',
  keynote: 'Keynote',
  calendar: 'Calendar',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  'system settings': 'System Settings',
  'system preferences': 'System Settings'
}

export function isBrowser(app: string | null | undefined): boolean {
  return !!app && clean(app).toLowerCase() in BROWSERS
}

/** Friendly app name ("Google Chrome" → "Chrome", "code" → "VS Code", "WINWORD" → "Word"). */
export function appLabel(app: string | null | undefined): string | null {
  const a = clean(app).replace(/\.exe$/i, '')
  if (!a) return null
  const k = a.toLowerCase()
  return BROWSERS[k] ?? APP_ALIASES[k] ?? (a === a.toLowerCase() ? titleCaseWord(a) : a)
}

/** Strip browser/app suffixes, profile names, unread counters and zero-width characters from a window title. */
export function cleanTitle(title: string | null | undefined): string {
  let t = clean(title)
  if (!t) return ''
  t = t.replace(/^\(\d+\+?\)\s+/, '') // "(3) YouTube" unread counters
  t = t.replace(/\s+and \d+ more pages?$/i, '')
  // Edge: "Title - Personal - Microsoft Edge"; Chrome: "Title - Google Chrome - Profile 2"
  t = t.replace(/(?:\s+[-–—]\s+(?:Personal|Work|Default|Profile \d+|Guest|InPrivate))?\s+[-–—]\s+Microsoft\s?Edge(?:\s+(?:Beta|Dev|Canary))?$/i, '')
  t = t.replace(/\s+[-–—]\s+(?:Google Chrome(?: Canary| Beta)?|Chromium|Mozilla Firefox(?: Private Browsing)?|Firefox(?: Developer Edition| Nightly)?|Brave|Safari|Arc|Opera|Vivaldi|Zen Browser|Orion)(?:\s+[-–—]\s+.{1,40})?$/i, '')
  t = t.replace(/^\s*[●•*]\s*/, '') // unsaved-file dots
  return t.trim()
}

function stripSuffix(title: string, re: RegExp): string {
  return title.replace(re, '').trim()
}

// ---------- URLs ----------
const SENSITIVE_PARAM = /token|auth|code|key|sig|session|password|passwd|secret|otp|ticket|state|nonce|jwt|credential|^sid$|^email$/i

/** Drop secrets-looking query params and fragments (except Gmail's #search) and cap the length. */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  const s = clean(raw)
  if (!s || !/^[a-z][a-z0-9+.-]*:/i.test(s)) return null
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol) && u.protocol !== 'file:') return null
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_PARAM.test(k) && !/^(q|k|query)$/i.test(k)) u.searchParams.delete(k)
    if (!(u.hostname === 'mail.google.com' && /^#(search|label|inbox)/.test(u.hash))) u.hash = ''
    u.username = ''
    u.password = ''
    const out = u.toString()
    return out.length > 300 ? out.slice(0, 300) : out
  } catch {
    return null
  }
}

function parseUrl(raw: string | null | undefined): URL | null {
  const s = sanitizeUrl(raw)
  if (!s) return null
  try {
    return new URL(s)
  } catch {
    return null
  }
}

const hostOf = (u: URL): string => u.hostname.replace(/^www\./, '').toLowerCase()

// ---------- OCR helpers ----------
const BREADCRUMB = /^(https?:\/\/\S+|[\w-]+(\.[\w-]+)+(\s*›.*)?|.*\s›\s.*)$/i
const NOISE = /^(sponsored|ads?|people also ask|people also search for|related searches|images|videos|news|shopping|maps|all|more|tools|web|short videos|forums|places|see more|show more|about \d|\d+ results?|things to know|top stories|what people are saying|feedback|sign in|ai overview)\b/i

/** Result titles from the OCR text of a search page: the line right after a site/breadcrumb line. */
export function extractSearchResults(ocr: string | null | undefined, query = '', max = 3): string[] {
  if (!ocr) return []
  const lines = ocr.split('\n').map((l) => clean(l)).filter(Boolean)
  const qn = clean(query).toLowerCase()
  const out: string[] = []
  for (let i = 0; i < lines.length - 1 && out.length < max; i++) {
    if (!BREADCRUMB.test(lines[i]!)) continue
    const next = lines[i + 1]!
    if (BREADCRUMB.test(next) || NOISE.test(next)) continue
    if (next.length < 6 || next.length > 110 || !/[a-z]{3}/i.test(next)) continue
    if (qn && next.toLowerCase() === qn) continue
    const title = next.replace(/\s*(\.\.\.|…)$/, '').replace(/\s+[-|–]\s+[^-|–]{2,30}$/, '').trim()
    if (title.length >= 4 && !out.some((o) => o.toLowerCase() === title.toLowerCase())) out.push(title)
  }
  return out
}

const MENU_WORDS = new Set('file edit view window help go history bookmarks profiles tab tabs format tools insert selection run terminal debug navigate code refactor build product editor shell session scripts favorites develop table arrange slide data'.split(' '))
const isMenuBar = (l: string): boolean => l.split(/\s+/).every((w) => MENU_WORDS.has(w.toLowerCase()) || /^[^\p{L}]*$/u.test(w))

/** First meaningful line of OCR text (for when we know nothing else). */
function firstOcrLine(ocr: string | null | undefined): string | null {
  if (!ocr) return null
  for (const l of ocr.split('\n')) {
    const c = clean(l)
    if (c.length >= 12 && /[a-z]{3,}/i.test(c) && !BREADCRUMB.test(c) && !isMenuBar(c)) return c
  }
  return null
}

/** Window titles often end with the app name (" - Visual Studio Code") — use it when the app itself is unknown (Linux). */
const TITLE_APPS: [RegExp, string][] = [
  [/\s[-–—]\s(?:Visual Studio Code|Code - OSS)$/i, 'VS Code'],
  [/\s[-–—]\sCursor$/i, 'Cursor'],
  [/\s[-–—]\s(?:Google Chrome|Chromium)(?:\s[-–—]\s.{1,40})?$/i, 'Google Chrome'],
  [/\s[-–—]\sMozilla Firefox(?: Private Browsing)?$/i, 'Firefox'],
  [/\s[-–—]\sMicrosoft\s?Edge$/i, 'Microsoft Edge'],
  [/\s[-–—]\sBrave$/i, 'Brave Browser'],
  [/\s[-–—]\sSlack$/i, 'Slack'],
  [/\s[-–—]\s(?:Word|Excel|PowerPoint)$/i, '$W']
]
function inferAppFromTitle(title: string): string | null {
  for (const [re, app] of TITLE_APPS) {
    const m = re.exec(title)
    if (m) return app === '$W' ? m[0].replace(/^\s[-–—]\s/, '') : app
  }
  return null
}

function withResults(base: string, results: string[]): string {
  if (!results.length) return base
  const picked: string[] = []
  for (const r of results) {
    const short = r.length > 40 ? r.slice(0, 39).replace(/\s+\S*$/, '') + '…' : r
    const next = `${base} — top results: ${[...picked, short].join(', ')}`
    if (wordCount(next) > MAX_WORDS) break
    picked.push(short)
  }
  return picked.length ? `${base} — top results: ${picked.join(', ')}` : base
}

// ---------- web rules ----------
interface WebIn {
  host: string
  path: string
  params: URLSearchParams
  hash: string
  title: string
  browser: string
  ocr: string | null
}

function googleProduct(path: string, title: string): string | null {
  if (path.startsWith('/document')) return 'Google Docs'
  if (path.startsWith('/spreadsheets')) return 'Google Sheets'
  if (path.startsWith('/presentation')) return 'Google Slides'
  if (path.startsWith('/forms')) return 'Google Forms'
  const m = /\s[-–]\s(Google (?:Docs|Sheets|Slides|Forms))$/.exec(title)
  return m ? m[1]! : null
}

function placeFromSlug(slug: string): string {
  return decode(slug)
    .replace(/--/g, ', ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function describeWeb(w: WebIn): string | null {
  const { host, path, params, title, ocr } = w
  const get = (k: string): string => clean(decode(params.get(k) ?? ''))

  // Search engines
  if (/(^|\.)google\.[a-z.]+$/.test(host)) {
    if (path.startsWith('/maps')) return describeMaps(path, title)
    if (path.startsWith('/travel/flights')) {
      const qq = get('q') || stripSuffix(title, /\s*[-|–]\s*Google Flights$/i)
      return qq && !/^google flights$/i.test(qq) ? `Searching Google Flights for ${q(qq)}` : 'Searching flights on Google Flights'
    }
    if (path.startsWith('/travel')) {
      const qq = get('q') || stripSuffix(title, /\s*[-|–]\s*Google (Hotels|Travel)$/i)
      return qq ? `Searching hotels on Google Travel: ${q(qq)}` : 'Searching hotels on Google Travel'
    }
    const qq = get('q')
    if (path === '/search' && qq) {
      const tbm = params.get('tbm') ?? params.get('udm')
      if (tbm === 'isch' || tbm === '2') return `Searching Google Images for ${q(qq)}`
      if (tbm === 'nws') return `Searching Google News for ${q(qq)}`
      if (tbm === 'shop' || tbm === '28') return `Shopping on Google for ${q(qq)}`
      return withResults(`Searching Google for ${q(qq)}`, extractSearchResults(ocr, qq))
    }
  }
  if (host === 'mail.google.com') return describeGmail(title, w.hash)
  if (host === 'docs.google.com') {
    const product = googleProduct(path, title) ?? 'Google Docs'
    const name = stripSuffix(title, /\s+[-–]\s+Google (Docs|Sheets|Slides|Forms)$/i)
    return name ? `Editing ${q(name)} in ${product}` : `Working in ${product}`
  }
  if (host === 'drive.google.com') return title && !/^(my drive|home)\b/i.test(title) ? `Browsing Google Drive: ${q(stripSuffix(title, /\s+[-–]\s+Google Drive$/i))}` : 'Browsing files in Google Drive'
  if (host === 'calendar.google.com') return 'Checking Google Calendar'
  if (host === 'meet.google.com') return 'In a Google Meet call'
  if (host === 'bing.com' && get('q')) return withResults(`Searching Bing for ${q(get('q'))}`, extractSearchResults(ocr, get('q')))
  if (host === 'duckduckgo.com' && get('q')) return withResults(`Searching DuckDuckGo for ${q(get('q'))}`, extractSearchResults(ocr, get('q')))
  if (host.endsWith('search.yahoo.com') && get('p')) return `Searching Yahoo for ${q(get('p'))}`
  if (host === 'perplexity.ai' && get('q')) return `Asking Perplexity ${q(get('q'))}`
  if (host === 'perplexity.ai') return title && !/^perplexity$/i.test(title) ? `Asking Perplexity about ${q(stripSuffix(title, /\s+[-|]\s+Perplexity$/i))}` : 'Using Perplexity'

  // Video & music
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    if (path === '/results' && get('search_query')) return `Searching YouTube for ${q(get('search_query'))}`
    const name = stripSuffix(title, /\s+-\s+YouTube$/i)
    if ((path === '/watch' || host === 'youtu.be' || path.startsWith('/shorts')) && name && !/^youtube$/i.test(name)) return `Watching ${q(name)} on YouTube`
    return 'Browsing YouTube'
  }
  if (host === 'open.spotify.com') return title && !/^spotify/i.test(title) ? `Listening to ${q(stripSuffix(title, /\s+\|\s+Spotify$/i))} on Spotify` : 'Listening to music on Spotify'
  if (host === 'netflix.com') return path.startsWith('/watch') ? 'Watching Netflix' : 'Browsing Netflix'

  // Dev
  if (host === 'github.com') return describeGitHub(path, params, title)
  if (host === 'stackoverflow.com' || host.endsWith('.stackexchange.com') || host === 'superuser.com' || host === 'serverfault.com') {
    if (path.startsWith('/search') && get('q')) return `Searching Stack Overflow for ${q(get('q'))}`
    const t = stripSuffix(stripSuffix(title, /\s+-\s+(Stack Overflow|Super User|Server Fault|[\w ]+ Stack Exchange)$/i), /^[\w.#+-]+(?:\s+[\w.#+-]+)?\s+-\s+(?=\S)/)
    return t ? `Reading Stack Overflow: ${q(t, 80)}` : 'Browsing Stack Overflow'
  }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(host) || host.endsWith('.local')) {
    return `Testing a local web app${title ? ` ${q(title)}` : ''} at ${host}${w.path === '/' ? '' : w.path.slice(0, 30)}`
  }

  // Shopping & travel
  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
    if (get('k')) return `Shopping on Amazon for ${q(get('k'))}`
    const t = stripSuffix(title.replace(/^Amazon\.[a-z.]+\s*:\s*/i, ''), /\s*:\s*[^:]{2,40}$/)
    return t && !/^amazon/i.test(t) ? `Viewing ${q(t)} on Amazon` : 'Shopping on Amazon'
  }
  if (/(^|\.)booking\.com$/.test(host)) {
    if (get('ss')) return `Searching hotels in ${titleCaseWord(get('ss'))} on Booking.com`
    if (path.startsWith('/hotel/') && title) return `Viewing hotel ${q(title.split(/[,|–-]\s/)[0]!)} on Booking.com`
    return 'Looking at hotels on Booking.com'
  }
  if (/(^|\.)airbnb\.[a-z.]+$/.test(host)) {
    const m = /^\/s\/([^/]+)/.exec(path)
    if (m) return `Searching Airbnb stays in ${placeFromSlug(m[1]!)}`
    if (get('query')) return `Searching Airbnb stays in ${get('query')}`
    if (path.startsWith('/rooms/')) return title ? `Viewing an Airbnb listing: ${q(stripSuffix(title, /\s+-\s+Airbnb$/i))}` : 'Viewing an Airbnb listing'
    return 'Browsing stays on Airbnb'
  }
  if (/(^|\.)expedia\.[a-z.]+$/.test(host)) {
    if (/flights/i.test(path)) {
      const leg = get('leg1')
      const from = /from:([^,]+)/i.exec(leg)?.[1]
      const to = /to:([^,]+)/i.exec(leg)?.[1]
      return from && to ? `Searching flights from ${clean(from)} to ${clean(to)} on Expedia` : 'Searching flights on Expedia'
    }
    const dest = get('destination')
    return dest ? `Searching hotels in ${dest} on Expedia` : 'Browsing trips on Expedia'
  }
  if (/(^|\.)kayak\.[a-z.]+$/.test(host)) {
    const m = /^\/flights\/([A-Z]{3})[^-/]*-([A-Z]{3})/i.exec(path)
    if (m) return `Searching flights ${m[1]!.toUpperCase()} → ${m[2]!.toUpperCase()} on Kayak`
    const h = /^\/hotels\/([^/]+)/.exec(path)
    if (h) return `Searching hotels in ${placeFromSlug(h[1]!).replace(/,\s*c\d+$/i, '')} on Kayak`
    return 'Searching travel deals on Kayak'
  }
  if (/(^|\.)skyscanner\.[a-z.]+$/.test(host)) return title ? `Searching flights on Skyscanner: ${q(stripSuffix(title, /\s+\|\s+Skyscanner.*$/i))}` : 'Searching flights on Skyscanner'

  // AI & productivity
  if (host === 'chatgpt.com' || host === 'chat.openai.com') {
    const t = stripSuffix(title, /\s*[-|]\s*ChatGPT$/i)
    return t && !/^chatgpt$/i.test(t) ? `Chatting with ChatGPT about ${q(t)}` : 'Chatting with ChatGPT'
  }
  if (host === 'claude.ai') {
    const t = stripSuffix(title, /\s*[-|]\s*Claude$/i)
    return t && !/^claude$/i.test(t) ? `Chatting with Claude about ${q(t)}` : 'Chatting with Claude'
  }
  if (host === 'notion.so' || host.endsWith('.notion.site')) return title ? `Editing ${q(title.replace(/\s*\|\s*Notion$/i, ''))} in Notion` : 'Working in Notion'
  if (host === 'app.slack.com') return describeSlack(title)
  if (host.endsWith('zoom.us')) return 'In a Zoom meeting'
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'In Microsoft Teams'
  if (host === 'figma.com') return title ? `Designing ${q(stripSuffix(title, /\s+[–-]\s+Figma$/i))} in Figma` : 'Designing in Figma'
  if (/(^|\.)wikipedia\.org$/.test(host)) {
    const t = stripSuffix(title, /\s+-\s+Wikipedia$/i)
    return t ? `Reading ${q(t)} on Wikipedia` : 'Reading Wikipedia'
  }
  if (host === 'reddit.com' || host === 'old.reddit.com') {
    const sub = /^\/r\/([^/]+)/.exec(path)?.[1]
    const t = stripSuffix(title, /\s*:\s*r\/\w+$/i)
    if (sub && t && !/^r\//i.test(t)) return `Reading ${q(t)} on r/${sub}`
    return sub ? `Browsing r/${sub} on Reddit` : 'Browsing Reddit'
  }
  if (host === 'outlook.office.com' || host === 'outlook.live.com') return 'Checking email in Outlook'
  return null
}

function describeMaps(path: string, title: string): string {
  const seg = path.split('/').filter(Boolean)
  const i = seg.indexOf('search')
  if (i >= 0 && seg[i + 1]) return `Searching Google Maps for ${q(decode(seg[i + 1]!))}`
  const p = seg.indexOf('place')
  if (p >= 0 && seg[p + 1]) return `Looking at ${q(decode(seg[p + 1]!))} on Google Maps`
  const d = seg.indexOf('dir')
  if (d >= 0 && seg[d + 1] && seg[d + 2] && !seg[d + 2]!.startsWith('@')) {
    return `Getting directions from ${decode(seg[d + 1]!).split(',')[0]} to ${decode(seg[d + 2]!).split(',')[0]} on Google Maps`
  }
  const t = stripSuffix(title, /\s+-\s+Google Maps$/i)
  return t && !/^google maps$/i.test(t) ? `Looking at ${q(t)} on Google Maps` : 'Browsing Google Maps'
}

function describeGmail(title: string, hash: string): string {
  const s = /^#search\/([^/]+)/.exec(hash)
  if (s) return `Searching Gmail for ${q(decode(s[1]!))}`
  const parts = stripSuffix(title, /\s+-\s+Gmail$/i).split(/\s+-\s+/)
  const subject = parts.length > 1 ? parts.slice(0, -1).join(' - ') : parts[0] ?? ''
  if (!subject || /^(inbox|starred|sent|drafts|all mail|spam|trash|snoozed|important)\b/i.test(subject) || /@/.test(subject)) return 'Checking the Gmail inbox'
  return `Reading email ${q(subject)} in Gmail`
}

function describeGitHub(path: string, params: URLSearchParams, title: string): string {
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'search') return params.get('q') ? `Searching GitHub for ${q(decode(params.get('q')!))}` : 'Searching GitHub'
  const repo = seg.length >= 2 ? `${seg[0]}/${seg[1]}` : null
  const tTitle = title.split(/\s+·\s+/)[0]!.replace(/\s+by\s+[\w-]+$/i, '').trim()
  if (repo && (seg[2] === 'pull' || seg[2] === 'pulls') && seg[3]) return `Reviewing PR #${seg[3]} ${q(tTitle, 56)} in ${repo} on GitHub`
  if (repo && seg[2] === 'issues' && seg[3]) return `Reading issue #${seg[3]} ${q(tTitle, 56)} in ${repo} on GitHub`
  if (repo && seg[2] === 'blob' && seg.length > 4) return `Viewing ${seg.slice(4).join('/').slice(-50)} in ${repo} on GitHub`
  if (repo && seg[2] === 'actions') return `Checking GitHub Actions for ${repo}`
  if (repo && seg[2] === 'pulls') return `Browsing pull requests in ${repo} on GitHub`
  if (repo && seg[2] === 'issues') return `Browsing issues in ${repo} on GitHub`
  if (repo) return `Browsing the ${repo} repo on GitHub`
  return 'Browsing GitHub'
}

function describeSlack(title: string): string {
  let t = stripSuffix(title, /\s+-\s+Slack$/i)
  const old = /^Slack\s*\|\s*([^|]+?)(?:\s*\|\s*(.+))?$/.exec(t)
  if (old) {
    const ch = old[1]!.trim()
    return `Chatting in Slack ${ch.startsWith('#') ? ch : `#${ch}`}${old[2] ? ` (${old[2].trim()})` : ''}`
  }
  const parts = t.split(/\s+-\s+/)
  t = parts[0] ?? ''
  const ws = parts.length > 1 ? ` (${parts[parts.length - 1]})` : ''
  const ch = /^(.+?)\s+\((Channel|Private channel)\)/i.exec(t)
  if (ch) return `Chatting in Slack #${ch[1]!.replace(/^#/, '')}${ws}`
  const dm = /^(.+?)\s+\(DM\)/i.exec(t)
  if (dm) return `Messaging ${dm[1]} on Slack${ws}`
  return t && !/^slack$/i.test(t) ? `Chatting in Slack: ${q(t)}` : 'Chatting in Slack'
}

/** Title-only rules (Firefox, Windows, Linux — no URL available). */
function describeByTitle(title: string, browser: string, ocr: string | null): string | null {
  let m: RegExpExecArray | null
  if ((m = /^(.+?)\s+-\s+Google Search$/i.exec(title))) return withResults(`Searching Google for ${q(m[1]!)}`, extractSearchResults(ocr, m[1]))
  if ((m = /^(.+?)\s+(?:at|-)\s+DuckDuckGo$/i.exec(title))) return `Searching DuckDuckGo for ${q(m[1]!)}`
  if ((m = /^(.+?)\s+-\s+(?:Search|Bing)$/i.exec(title))) return `Searching Bing for ${q(m[1]!)}`
  if ((m = /^(.+?)\s+-\s+YouTube$/i.exec(title))) return /^youtube$/i.test(m[1]!) ? 'Browsing YouTube' : `Watching ${q(m[1]!)} on YouTube`
  if (/\s+-\s+Gmail$/i.test(title)) return describeGmail(title, '')
  if ((m = /^(.+?)\s+-\s+(Google (?:Docs|Sheets|Slides|Forms))$/i.exec(title))) return `Editing ${q(m[1]!)} in ${m[2]}`
  if ((m = /^(.+?)\s+·\s+Pull Request #(\d+)\s+·\s+([\w.-]+\/[\w.-]+)/i.exec(title))) return `Reviewing PR #${m[2]} ${q(m[1]!.replace(/\s+by\s+[\w-]+$/i, ''), 56)} in ${m[3]} on GitHub`
  if ((m = /^(.+?)\s+·\s+Issue #(\d+)\s+·\s+([\w.-]+\/[\w.-]+)/i.exec(title))) return `Reading issue #${m[2]} ${q(m[1]!, 56)} in ${m[3]} on GitHub`
  if ((m = /^GitHub\s+-\s+([\w.-]+\/[\w.-]+)/i.exec(title))) return `Browsing the ${m[1]} repo on GitHub`
  if (/\s+-\s+Stack Overflow$/i.test(title)) {
    const t = stripSuffix(stripSuffix(title, /\s+-\s+Stack Overflow$/i), /^[\w.#+-]+(?:\s+[\w.#+-]+)?\s+-\s+(?=\S)/)
    return `Reading Stack Overflow: ${q(t, 80)}`
  }
  if ((m = /^(.+?)\s+-\s+Wikipedia$/i.exec(title))) return `Reading ${q(m[1]!)} on Wikipedia`
  if ((m = /^(.+?)\s*\|\s*Google Flights$/i.exec(title))) return `Searching Google Flights for ${q(m[1]!)}`
  if ((m = /^(.+?)\s+-\s+Google Maps$/i.exec(title))) return `Looking at ${q(m[1]!)} on Google Maps`
  if ((m = /^Amazon\.[a-z.]+\s*:\s*(.+)$/i.exec(title))) {
    const k = /^(.+?)\s*:\s*[^:]{2,40}$/.exec(m[1]!)?.[1] ?? m[1]!
    return `Viewing ${q(k)} on Amazon`
  }
  if ((m = /^(.+?)\s+[-|]\s+ChatGPT$/i.exec(title)) || /^ChatGPT$/i.test(title)) return m ? `Chatting with ChatGPT about ${q(m[1]!)}` : 'Chatting with ChatGPT'
  if ((m = /^(.+?)\s+-\s+Claude$/i.exec(title))) return `Chatting with Claude about ${q(m[1]!)}`
  if (/\s+-\s+Slack$/i.test(title) || /^Slack\s*\|/.test(title)) return describeSlack(title)
  void browser
  return null
}

// ---------- desktop apps ----------
const EDITORS = new Set(['VS Code', 'Cursor', 'Windsurf', 'Zed', 'Sublime Text', 'IntelliJ IDEA', 'WebStorm', 'PyCharm', 'Xcode'])
const TERMINALS = new Set(['Terminal', 'iTerm', 'Warp', 'Ghostty', 'Alacritty', 'kitty', 'Windows Terminal', 'Konsole', 'PowerShell', 'Command Prompt'])
const FILE_MANAGERS = new Set(['Finder', 'File Explorer', 'Files'])
const DOC_APPS: Record<string, string> = { Word: 'Editing', Pages: 'Editing', Excel: 'Working on', Numbers: 'Working on', PowerPoint: 'Editing slides', Keynote: 'Editing slides', Preview: 'Reading', Acrobat: 'Reading' }
const SHELLS = /^-?(zsh|bash|fish|sh|pwsh|powershell|cmd|nu|tmux|login)$/i

function titleParts(title: string, app: string): string[] {
  return title
    .split(SEP)
    .map((p) => p.trim().replace(/^[●•*]\s*/, ''))
    .filter((p) => p && p.toLowerCase() !== app.toLowerCase() && !/^(visual studio code|code - insiders|\[extension development host\]|cursor|windsurf|zed|sublime text.*|intellij idea.*|webstorm.*|pycharm.*)$/i.test(p))
}

function describeApp(app: string, title: string): string {
  const t = title
  if (EDITORS.has(app)) {
    const parts = titleParts(t, app)
    if (parts.length >= 2) return `Editing ${parts[0]} in ${parts[1]} with ${app}`
    if (parts.length === 1) return /\.\w{1,6}$/.test(parts[0]!) ? `Editing ${parts[0]} in ${app}` : `Coding in ${app} — ${q(parts[0]!)}`
    return `Coding in ${app}`
  }
  if (TERMINALS.has(app)) {
    const parts = titleParts(t, app).filter((p) => !SHELLS.test(p) && !/^\d+\s*[×x]\s*\d+$/.test(p))
    const dir = parts.map((p) => /(?:^|:\s*)(~[^\s]*|\/[^\s]*)$/.exec(p)?.[1]).find(Boolean)
    if (dir) return `Using the terminal in ${dir}`
    const cmd = parts.find((p) => !/@/.test(p))
    return cmd ? `Running ${q(cmd, 48)} in ${app}` : `Using ${app}`
  }
  if (FILE_MANAGERS.has(app)) {
    const name = t.replace(/\s+-\s+File Explorer$/i, '').trim()
    return name && !/^(finder|file explorer|files)$/i.test(name) ? `Browsing the ${q(name, 48)} folder in ${app}` : `Browsing files in ${app}`
  }
  if (app === 'Slack') return describeSlack(t)
  if (app === 'Zoom') return /meeting|webinar/i.test(t) ? 'In a Zoom meeting' : 'Using Zoom'
  if (app === 'Teams') return /meeting|call/i.test(t) ? 'In a Microsoft Teams call' : t ? `Using Microsoft Teams — ${q(stripSuffix(t, /\s+\|\s+Microsoft Teams$/i))}` : 'Using Microsoft Teams'
  if (app === 'Spotify') {
    const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(t)
    if (m && !/^spotify/i.test(t)) return `Listening to ${q(m[2]!)} by ${m[1]} on Spotify`
    return 'Listening to music on Spotify'
  }
  if (app === 'Figma') return t && !/^figma$/i.test(t) ? `Designing ${q(stripSuffix(t, /\s+[–-]\s+Figma$/i))} in Figma` : 'Designing in Figma'
  if (app === 'Notion' || app === 'Obsidian' || app === 'Bear' || app === 'Notes') {
    const n = stripSuffix(t, /\s+[-–]\s+(Obsidian.*|Notion)$/i)
    return n && n.toLowerCase() !== app.toLowerCase() ? `Writing ${q(n)} in ${app}` : `Writing notes in ${app}`
  }
  if (app in DOC_APPS) {
    const n = stripSuffix(t, /\s+[-–]\s+(Word|Excel|PowerPoint|Saved.*|Compatibility Mode|Read-Only)(\s+[-–]\s+.*)?$/i).replace(/\s+[-–]\s+(Edited|Locked)$/i, '')
    return n ? `${DOC_APPS[app]} ${q(n)} in ${app}` : `Using ${app}`
  }
  if (app === 'Mail' || app === 'Outlook') return t && !/^(inbox|mail|outlook)\b/i.test(t) ? `Reading email ${q(stripSuffix(t, /\s+[-–]\s+(Outlook|Mail)$/i))} in ${app}` : `Checking email in ${app}`
  if (app === 'Messages' || app === 'WhatsApp' || app === 'Telegram' || app === 'Discord') return t && t.toLowerCase() !== app.toLowerCase() ? `Chatting in ${app} — ${q(t, 48)}` : `Chatting in ${app}`
  if (app === 'Calendar') return 'Checking the calendar'
  if (app === 'ChatGPT' || app === 'Claude') return t && t.toLowerCase() !== app.toLowerCase() ? `Chatting with ${app} about ${q(t)}` : `Chatting with ${app}`
  if (app === 'System Settings') return t && !/^system (settings|preferences)$/i.test(t) ? `Changing System Settings — ${t}` : 'Changing System Settings'
  return t && t.toLowerCase() !== app.toLowerCase() ? `Using ${app} — ${q(t)}` : `Using ${app}`
}

// ---------- entry point ----------
/** One specific line (≤25 words) describing what's on screen. Never throws. */
export function describeContext(ctx: Partial<ScreenContext> | null | undefined): string {
  try {
    let rawApp = clean(ctx?.app)
    let rawTitle = clean(ctx?.title)
    // Our own window is never interesting (the capture code skips it too).
    if (/^(electron|context vault)$/i.test(rawApp)) {
      rawApp = ''
      rawTitle = ''
    }
    if (!rawApp && rawTitle) rawApp = inferAppFromTitle(rawTitle) ?? ''
    const app = appLabel(rawApp)
    const browser = isBrowser(rawApp) ? app! : null
    const title = cleanTitle(rawTitle)
    const ocr = ctx?.ocr ?? null
    const url = parseUrl(ctx?.url)
    let line: string | null = null

    if (url && /^https?:$/.test(url.protocol)) {
      line = describeWeb({ host: hostOf(url), path: url.pathname, params: url.searchParams, hash: url.hash, title, browser: browser ?? 'the browser', ocr })
      if (!line) line = describeByTitle(title, browser ?? '', ocr)
      if (!line) {
        const where = browser ? ` in ${browser}` : ''
        line = title ? `Viewing ${q(title)} (${hostOf(url)})${where}` : `Viewing ${hostOf(url)}${where}`
      }
    } else if (url && url.protocol === 'file:') {
      line = `Viewing local file ${q(decode(url.pathname.split('/').pop() ?? 'file'))}${browser ? ` in ${browser}` : ''}`
    } else if (browser) {
      line = (title && describeByTitle(title, browser, ocr)) || (title ? `Viewing ${q(title)} in ${browser}` : `Browsing the web in ${browser}`)
    } else if (app) {
      line = describeApp(app, title)
    } else if (title) {
      line = describeByTitle(title, '', ocr) ?? `Viewing ${q(title)}`
    } else {
      const first = firstOcrLine(ocr)
      line = first ? `Viewing a screen showing ${q(first, 60)}` : null
    }
    return line ? capWords(line.replace(/\s+/g, ' ').trim()) : NOTHING_CAPTURED
  } catch {
    return NOTHING_CAPTURED
  }
}

// ---------- OCR ordering & the stored screen_text block ----------
export interface OcrItem {
  s: string
  x?: number
  y?: number // Vision coordinates: normalized, origin bottom-left
  h?: number
}

/** Order Vision observations top-to-bottom, left-to-right; returns cleaned lines. */
export function orderOcrItems(items: OcrItem[]): string[] {
  const valid = items.filter((i) => typeof i?.s === 'string' && i.s.trim())
  const withPos = valid.every((i) => typeof i.y === 'number' && typeof i.x === 'number')
  const sorted = withPos
    ? [...valid].sort((a, b) => {
        const tol = Math.max(a.h ?? 0.01, b.h ?? 0.01) * 0.5
        const ay = a.y! + (a.h ?? 0)
        const by = b.y! + (b.h ?? 0)
        if (Math.abs(ay - by) > tol) return by - ay
        return a.x! - b.x!
      })
    : valid
  return sorted.map((i) => clean(i.s))
}

/** Clean OCR lines: drop junk, collapse whitespace, de-duplicate, cap total length. */
export function cleanOcr(lines: string[], cap = 1500): string {
  const out: string[] = []
  let len = 0
  for (const raw of lines) {
    const l = clean(raw)
    if ((l.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) continue
    if (out[out.length - 1] === l) continue
    if (len + l.length + 1 > cap) {
      const room = cap - len - 1
      if (room > 20) out.push(l.slice(0, room))
      break
    }
    out.push(l)
    len += l.length + 1
  }
  return out.join('\n')
}

/** The compact block stored in screen_events.screen_text. */
export function formatScreenText(ctx: Partial<ScreenContext>, ocrCap = 1500): string | null {
  const lines: string[] = []
  const app = appLabel(ctx.app)
  const title = cleanTitle(ctx.title)
  const url = sanitizeUrl(ctx.url)
  if (app) lines.push(`App: ${app}`)
  if (title) lines.push(`Title: ${title}`)
  if (url) lines.push(`URL: ${url}`)
  const ocr = ctx.ocr ? cleanOcr(ctx.ocr.split('\n'), ocrCap) : ''
  if (ocr) lines.push(`Visible text: ${ocr}`)
  return lines.length ? lines.join('\n') : null
}

export interface ParsedScreenText {
  app: string | null
  title: string | null
  url: string | null
  visible: string | null
}

export function parseScreenText(text: string | null | undefined): ParsedScreenText {
  const out: ParsedScreenText = { app: null, title: null, url: null, visible: null }
  if (!text) return out
  const vi = text.indexOf('Visible text: ')
  const head = vi >= 0 ? text.slice(0, vi) : text
  if (vi >= 0) out.visible = text.slice(vi + 'Visible text: '.length).trim() || null
  for (const l of head.split('\n')) {
    const m = /^(App|Title|URL):\s*(.+)$/.exec(l.trim())
    if (m) out[m[1] === 'App' ? 'app' : m[1] === 'Title' ? 'title' : 'url'] = m[2]!.trim()
  }
  return out
}

/** One-line excerpt of visible text for prompts/answers. */
export function visibleExcerpt(text: string | null | undefined, max = 200): string | null {
  const v = parseScreenText(text).visible
  if (!v) return null
  const flat = v.replace(/\n+/g, ' · ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : flat
}
