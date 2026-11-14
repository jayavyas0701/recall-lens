// OWNER: subagent A. On-device screen context captured at each screenshot: frontmost app + window title,
// browser URL (macOS), and OCR of the screenshot (macOS Vision). Everything stays on this machine.
// Every function here is best-effort: wrapped in a timeout + try/catch, never throws, returns partial results.
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { log } from '../log'
import { cleanOcr, orderOcrItems, sanitizeUrl, type OcrItem, type ScreenContext } from './describe'

export interface WindowInfo {
  app: string | null
  title: string | null
  url: string | null
}

const EMPTY: WindowInfo = { app: null, title: null, url: null }
const OWN_NAMES = /^(electron|context vault)( helper.*)?$/i

/** Run a binary with args (never through a shell). Resolves stdout, or null on error/timeout. */
function run(cmd: string, args: string[], timeoutMs: number): Promise<{ out: string | null; err: string }> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) resolve({ out: null, err: `${error.message} ${stderr ?? ''}` })
        else resolve({ out: String(stdout), err: String(stderr ?? '') })
      })
    } catch (e) {
      resolve({ out: null, err: String(e) })
    }
  })
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      }
    )
  })
}

function safeJson<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s.trim()) as T
  } catch {
    return null
  }
}

// ======================= macOS =======================

/**
 * JXA: the frontmost on-screen, normal-layer window that isn't ours.
 * CGWindowListCopyWindowInfo returns windows front-to-back. Constants are used as literals because
 * JXA's bridge doesn't always expose them: kCGWindowListOptionOnScreenOnly = 1,
 * kCGWindowListExcludeDesktopElements = 16, kCGNullWindowID = 0.
 * Window titles (kCGWindowName) require the Screen Recording permission, which recording already needs.
 * argv[0] = our own PID.
 */
const MAC_WINDOW_JXA = `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
function run(argv) {
  var selfPid = parseInt(argv[0], 10);
  var ref = $.CGWindowListCopyWindowInfo(1 | 16, 0);
  var list = ObjC.deepUnwrap(ObjC.castRefToObject(ref)) || [];
  var skipOwners = /^(Electron|Context Vault|Window Server|Dock|SystemUIServer|Control Center|Notification Center|Spotlight|WindowManager|screencaptureui)$/i;
  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    if (!w || w.kCGWindowLayer !== 0) continue;
    if (w.kCGWindowOwnerPID === selfPid) continue;
    var owner = w.kCGWindowOwnerName || '';
    if (skipOwners.test(owner)) continue;
    if (w.kCGWindowAlpha !== undefined && w.kCGWindowAlpha < 0.1) continue;
    var b = w.kCGWindowBounds || {};
    if ((b.Width || 0) < 120 || (b.Height || 0) < 80) continue;
    return JSON.stringify({ app: owner, title: w.kCGWindowName || '' });
  }
  return JSON.stringify({ app: '', title: '' });
}
`

async function macWindow(): Promise<{ app: string | null; title: string | null }> {
  const r = await run('osascript', ['-l', 'JavaScript', '-e', MAC_WINDOW_JXA, String(process.pid)], 5000)
  const j = safeJson<{ app?: string; title?: string }>(r.out)
  if (j && (j.app || j.title)) return { app: j.app || null, title: j.title || null }
  if (!r.out) log.warn('Frontmost-window lookup failed:', r.err.slice(0, 200))
  // Fallback (app name only): lsappinfo front → ASN, then its display name.
  const front = await run('lsappinfo', ['front'], 3000)
  const asn = front.out?.trim()
  if (!asn) return { app: null, title: null }
  const info = await run('lsappinfo', ['info', '-only', 'name', asn], 3000)
  const name = /="([^"]*)"/.exec(info.out ?? '')?.[1] ?? null
  return { app: name && !OWN_NAMES.test(name) ? name : null, title: null }
}

/** AppleScript per browser. Returns "title<LF>URL". Only run when that browser is frontmost (so it never launches it). */
const BROWSER_SCRIPTS: Record<string, string> = {
  'Google Chrome': 'tell application "Google Chrome" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  'Google Chrome Canary': 'tell application "Google Chrome Canary" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  Chromium: 'tell application "Chromium" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  Arc: 'tell application "Arc" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  'Brave Browser': 'tell application "Brave Browser" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  'Microsoft Edge': 'tell application "Microsoft Edge" to tell active tab of front window to return (title as text) & linefeed & (URL as text)',
  Safari: 'tell application "Safari" to tell front document to return (name as text) & linefeed & (URL as text)'
}

/** Browsers whose Automation permission was denied this app session — never asked again until restart. */
const deniedBrowsers = new Set<string>()

async function macBrowserTab(app: string): Promise<{ title: string | null; url: string | null }> {
  const script = BROWSER_SCRIPTS[app]
  if (!script || deniedBrowsers.has(app)) return { title: null, url: null }
  // First call may show macOS's one-time Automation prompt; give the user a few seconds.
  const r = await run('osascript', ['-e', script], 8000)
  if (r.out == null) {
    if (/-1743|not authori[sz]ed|not allowed/i.test(r.err)) {
      deniedBrowsers.add(app)
      log.info(`Browser URL capture disabled for ${app} (Automation permission denied).`)
    }
    return { title: null, url: null }
  }
  const [title, ...rest] = r.out.replace(/\r/g, '').split('\n')
  const url = rest.join('').trim()
  return { title: title?.trim() || null, url: sanitizeUrl(url) }
}

/**
 * JXA OCR with the built-in Vision framework (macOS 10.15+). argv[0] = image path.
 * Returns JSON [{s, x, y, h}] — boxes are normalized with origin bottom-left; ordering happens in Node.
 * recognitionLevel 0 = VNRequestTextRecognitionLevelAccurate.
 */
const MAC_OCR_JXA = `
ObjC.import('Foundation');
ObjC.import('Vision');
function run(argv) {
  var url = $.NSURL.fileURLWithPath(argv[0]);
  var req = $.VNRecognizeTextRequest.alloc.init;
  req.setRecognitionLevel(0);
  req.setUsesLanguageCorrection(true);
  var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  var err = Ref();
  var ok = handler.performRequestsError($.NSArray.arrayWithObject(req), err);
  if (!ok) return '[]';
  var results = req.results;
  var out = [];
  var n = results.count;
  for (var i = 0; i < n; i++) {
    var obs = results.objectAtIndex(i);
    var cands = obs.topCandidates(1);
    if (!cands || cands.count < 1) continue;
    var text = ObjC.unwrap(cands.firstObject.string);
    if (!text) continue;
    var item = { s: text };
    try {
      var bb = obs.boundingBox;
      item.x = bb.origin.x; item.y = bb.origin.y; item.h = bb.size.height;
    } catch (e) {}
    out.push(item);
  }
  return JSON.stringify(out);
}
`

async function macOcr(imagePath: string): Promise<string | null> {
  const r = await run('osascript', ['-l', 'JavaScript', '-e', MAC_OCR_JXA, imagePath], 8000)
  const items = safeJson<OcrItem[]>(r.out)
  if (!Array.isArray(items)) {
    log.warn('On-device OCR unavailable:', r.err.slice(0, 200))
    return null
  }
  const text = cleanOcr(orderOcrItems(items), 1500)
  return text || null
}

// ======================= Windows =======================
const WIN_PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class CvWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$h = [CvWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[void][CvWin]::GetWindowText($h, $sb, 1024)
$procId = [uint32]0
[void][CvWin]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId
$desc = $null
try { $desc = $p.MainModule.FileVersionInfo.FileDescription } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
@{ app = $p.ProcessName; desc = $desc; title = $sb.ToString(); pid = $procId } | ConvertTo-Json -Compress
`

async function winWindow(): Promise<{ app: string | null; title: string | null }> {
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_PS], 6000)
  const j = safeJson<{ app?: string; desc?: string; title?: string; pid?: number }>(r.out)
  if (!j || Number(j.pid) === process.pid) return { app: null, title: null }
  const name = j.app && /^(chrome|msedge|firefox|code|explorer|winword|excel|powerpnt|outlook)$/i.test(j.app) ? j.app : j.desc || j.app || null
  if (name && OWN_NAMES.test(name)) return { app: null, title: null }
  return { app: name, title: j.title || null }
}

// ======================= Linux =======================
async function linuxWindow(): Promise<{ app: string | null; title: string | null }> {
  const title = await run('xdotool', ['getactivewindow', 'getwindowname'], 3000)
  if (title.out == null) return { app: null, title: null } // xdotool missing or no active window
  const pidR = await run('xdotool', ['getactivewindow', 'getwindowpid'], 3000)
  const pid = Number(pidR.out?.trim())
  if (pid && pid === process.pid) return { app: null, title: null }
  let app: string | null = null
  if (pid) {
    try {
      app = readFileSync(`/proc/${pid}/comm`, 'utf8').trim() || null
    } catch {
      app = null
    }
  }
  if (app && OWN_NAMES.test(app)) return { app: null, title: null }
  return { app, title: title.out.trim() || null }
}

// ======================= public API =======================

/** Frontmost app, window title and (macOS browsers) the active tab's URL. Call it the moment a screenshot is taken. */
export async function captureWindow(): Promise<WindowInfo> {
  const work = async (): Promise<WindowInfo> => {
    try {
      if (process.platform === 'darwin') {
        const w = await macWindow()
        if (!w.app) return { ...EMPTY, title: w.title }
        const tab = await macBrowserTab(w.app)
        return { app: w.app, title: tab.title || w.title, url: tab.url }
      }
      if (process.platform === 'win32') return { ...EMPTY, ...(await winWindow()) }
      if (process.platform === 'linux') return { ...EMPTY, ...(await linuxWindow()) }
    } catch (e) {
      log.warn('captureWindow failed', e)
    }
    return EMPTY
  }
  return withTimeout(work(), 9000, EMPTY)
}

/** On-device OCR of a saved screenshot (macOS only; null elsewhere). */
export async function ocrScreenshot(imagePath: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null
  try {
    return await withTimeout(macOcr(imagePath), 9000, null)
  } catch (e) {
    log.warn('OCR failed for', basename(imagePath), e)
    return null
  }
}

/** Convenience: window info + OCR. */
export async function captureScreenContext(windowP: Promise<WindowInfo>, imagePath: string): Promise<ScreenContext> {
  const [w, ocr] = await Promise.all([windowP, ocrScreenshot(imagePath)])
  return { ...w, ocr }
}
