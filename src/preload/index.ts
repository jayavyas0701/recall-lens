// OWNER: orchestrator. Typed bridge between renderer and main.
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { CH, type CVApi } from '../shared/types'

const inv = <T>(ch: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(ch, ...args) as Promise<T>

let reqCounter = 0

const api: CVApi = {
  app: { info: () => inv(CH.appInfo), setAnthropicKey: (k) => inv(CH.appSetAnthropicKey, k) },
  auth: {
    signUp: (i) => inv(CH.authSignUp, i),
    signIn: (i) => inv(CH.authSignIn, i),
    signOut: () => inv(CH.authSignOut),
    current: () => inv(CH.authCurrent),
    updateProfile: (i) => inv(CH.authUpdateProfile, i),
    completeOnboarding: () => inv(CH.authCompleteOnboarding)
  },
  perms: {
    status: () => inv(CH.permsStatus),
    requestMicrophone: () => inv(CH.permsRequestMic),
    openScreenSettings: () => inv(CH.permsOpenScreen),
    openMicSettings: () => inv(CH.permsOpenMic)
  },
  storage: {
    paths: () => inv(CH.storagePaths),
    chooseRoot: () => inv(CH.storageChooseRoot),
    stats: () => inv(CH.storageStats),
    openFolder: (k) => inv(CH.storageOpenFolder, k),
    showItem: (p) => inv(CH.storageShowItem, p),
    mediaUrl: (p) => `cv-media://local/${encodeURIComponent(p)}`
  },
  sessions: {
    list: () => inv(CH.sessionsList),
    get: (id) => inv(CH.sessionsGet, id),
    latest: () => inv(CH.sessionsLatest),
    rename: (id, t) => inv(CH.sessionsRename, id, t),
    stats: () => inv(CH.sessionsStats),
    search: (q) => inv(CH.sessionsSearch, q),
    setAccess: (id, a) => inv(CH.sessionsSetAccess, id, a),
    unlock: (id, pw) => inv(CH.sessionsUnlock, id, pw),
    relock: (id) => inv(CH.sessionsRelock, id)
  },
  recording: {
    create: (i) => inv(CH.recCreate, i),
    screenshot: (i) => inv(CH.recScreenshot, i),
    finalize: (i) => inv(CH.recFinalize, i),
    setStatus: (id, s) => inv(CH.recSetStatus, id, s)
  },
  files: {
    list: () => inv(CH.filesList),
    trash: (p) => inv(CH.filesTrash, p)
  },
  transcripts: {
    save: (id, segs) => inv(CH.transcriptsSave, id, segs),
    transcribeRemote: (id) => inv(CH.transcriptsRemote, id)
  },
  ai: {
    summarize: (id, force) => inv(CH.aiSummarize, id, !!force),
    ask: async (input, onDelta) => {
      const requestId = `ask-${Date.now()}-${++reqCounter}`
      const listener = (_e: IpcRendererEvent, payload: { requestId: string; delta: string }): void => {
        if (payload.requestId === requestId) onDelta(payload.delta)
      }
      ipcRenderer.on(CH.aiAskDelta, listener)
      try {
        return await inv(CH.aiAsk, { ...input, requestId })
      } finally {
        ipcRenderer.removeListener(CH.aiAskDelta, listener)
      }
    },
    history: (id) => inv(CH.aiHistory, id)
  },
  support: {
    chat: (m) => inv(CH.supportChat, m),
    createTicket: (i) => inv(CH.supportCreateTicket, i),
    myTickets: () => inv(CH.supportMyTickets),
    agentLoad: () => inv(CH.supportAgentLoad)
  },
  subs: {
    get: () => inv(CH.subsGet),
    upgrade: (i) => inv(CH.subsUpgrade, i)
  },
  feedback: {
    submit: (i) => inv(CH.feedbackSubmit, i),
    list: () => inv(CH.feedbackList)
  },
  settings: {
    get: (k) => inv(CH.settingsGet, k),
    set: (k, v) => inv(CH.settingsSet, k, v)
  },
  demo: { loadSession: () => inv(CH.demoLoad) }
}

contextBridge.exposeInMainWorld('cv', api)
