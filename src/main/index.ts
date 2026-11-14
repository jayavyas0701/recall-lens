// OWNER: orchestrator. Electron main entry: window, protocols, media permissions, IPC registration.
import { app, BrowserWindow, desktopCapturer, net, protocol, session, shell } from 'electron'
import { join, resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { loadEnv } from './env'
import { initDb, flush } from './db'
import { getPaths, isServablePath } from './paths'
import { log } from './log'
import { mediaBlocked } from './access'
import { registerAuth, restoreSession } from './ipc/auth'
import { registerSystem } from './ipc/system'
import { registerSessions } from './ipc/sessions'
import { registerSettings } from './ipc/settings'
import { registerDemo } from './ipc/demo'
import { registerRecording } from './ipc/recording'
import { registerFiles } from './ipc/files'
import { registerAi } from './ipc/ai'
import { registerTranscripts } from './ipc/transcripts'
import { registerSupport, seedSupport } from './ipc/support'
import { registerSubs } from './ipc/subs'
import { registerFeedback } from './ipc/feedback'

// System-audio loopback on macOS 13+ (ScreenCaptureKit). Harmless where unsupported.
app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride')

protocol.registerSchemesAsPrivileged([
  { scheme: 'cv-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

process.on('uncaughtException', (e) => log.error('Uncaught exception', e))
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e))

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 740,
    show: false,
    title: 'Context Vault',
    backgroundColor: '#FAFAFF',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') log.error('[renderer]', details.message)
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  if (process.env.CV_SMOKE_SCRIPT) runSmokeScript(win, process.env.CV_SMOKE_SCRIPT)
  return win
}

/**
 * Dev/testing aid: CV_SMOKE_SCRIPT=/path/steps.json runs scripted steps against the renderer, then quits.
 * Steps: { "wait": ms } | { "js": "code returning a value" } | { "shot": "/abs/out.png" }
 */
function runSmokeScript(win: BrowserWindow, file: string): void {
  win.webContents.once('did-finish-load', async () => {
    try {
      const steps = JSON.parse(readFileSync(file, 'utf8')) as Array<{ wait?: number; js?: string; shot?: string }>
      for (const s of steps) {
        if (s.wait) await new Promise((r) => setTimeout(r, s.wait))
        if (s.js) {
          const out = await win.webContents.executeJavaScript(`(async () => { ${s.js} })()`, true)
          log.info('[smoke] js →', JSON.stringify(out)?.slice(0, 2000))
        }
        if (s.shot) {
          const img = await win.webContents.capturePage()
          writeFileSync(s.shot, img.toPNG())
          log.info('[smoke] screenshot →', s.shot)
        }
      }
    } catch (e) {
      log.error('[smoke] failed', e)
    }
    flush()
    app.exit(0)
  })
}

function setupMedia(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'].includes(permission))
  })
  ses.setPermissionCheckHandler((_wc, permission) => ['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission))

  // getDisplayMedia() → automatically pick the primary screen (no picker), with loopback audio where supported.
  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (!sources.length) return callback({})
          const wantsAudio = request.audioRequested && process.platform !== 'linux'
          callback(wantsAudio ? { video: sources[0], audio: 'loopback' } : { video: sources[0] })
        })
        .catch((e) => {
          log.error('desktopCapturer failed', e)
          callback({})
        })
    },
    { useSystemPicker: false }
  )
}

function setupMediaProtocol(): void {
  // cv-media://local/<encoded absolute path> → serves recordings/screenshots from the vault only.
  protocol.handle('cv-media', async (req) => {
    try {
      const url = new URL(req.url)
      const p = resolve(decodeURIComponent(url.pathname.replace(/^\//, '')))
      if (!isServablePath(p) || mediaBlocked(p)) return new Response('Forbidden', { status: 403 })
      const res = await net.fetch(pathToFileURL(p).toString(), { headers: req.headers })
      // Allow renderer fetch() (e.g. local Whisper decoding the mic audio).
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    } catch (e) {
      log.error('cv-media failed', e)
      return new Response('Not found', { status: 404 })
    }
  })
}

app.whenReady().then(async () => {
  loadEnv()
  getPaths()
  try {
    await initDb()
    seedSupport()
    restoreSession()
  } catch (e) {
    log.error('Startup DB init failed', e)
  }
  setupMedia()
  setupMediaProtocol()
  registerAuth()
  registerSystem()
  registerSessions()
  registerSettings()
  registerDemo()
  registerRecording()
  registerFiles()
  registerAi()
  registerTranscripts()
  registerSupport()
  registerSubs()
  registerFeedback()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => flush())
app.on('window-all-closed', () => {
  flush()
  if (process.platform !== 'darwin') app.quit()
})
