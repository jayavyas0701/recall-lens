// Shared types between main, preload and renderer.
// OWNER: orchestrator. Subagents request changes via their result.

export type Plan = 'free' | 'pro' | 'team'
export type Billing = 'monthly' | 'yearly'
export type ThemeMode = 'light' | 'vibrant'

export interface User {
  id: number
  name: string
  email: string
  avatarColor: string // a gradient key, e.g. 'violet' | 'pink' | 'orange' | 'cyan' | 'lime'
  plan: Plan
  onboarded: boolean
  createdAt: string
}

export interface Result<T = undefined> {
  ok: boolean
  data?: T
  error?: string
}

export type PermState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' | 'unavailable'

export interface PermissionStatus {
  microphone: PermState
  screen: PermState
  systemAudio: 'supported' | 'experimental' | 'unavailable'
  platform: NodeJS.Platform | string
}

export interface AppInfo {
  hasAnthropicKey: boolean
  hasOpenAIKey: boolean
  platform: string
  storageRoot: string
  dbPath: string
  version: string
}

export interface StoragePaths {
  root: string
  audio: string
  screen: string
  screenshots: string
  transcripts: string
}

export interface StorageStats {
  audioBytes: number
  screenBytes: number
  otherBytes: number
  freeBytes: number
  totalBytes: number
}

export type FolderKind = 'root' | 'recordings' | 'audio' | 'screen' | 'transcripts' | 'screenshots'

// ---------- Sessions ----------
export interface TranscriptSegment {
  id?: number
  sessionId: number
  tStart: number // seconds from session start
  tEnd: number
  text: string
}

export interface ScreenEvent {
  id?: number
  sessionId: number
  t: number // seconds from session start
  description: string
  screenshotPath: string | null
  /** Local screen context captured on-device: app/window/URL + OCR'd visible text (may be empty). */
  screenText?: string | null
}

export interface TimelineItem {
  t: number
  kind: 'speech' | 'screen'
  text: string
}

export interface SessionSummary {
  tldr: string
  keyPoints: string[]
  timeline: TimelineItem[]
  topics: string[]
  actionItems: { text: string; done: boolean }[]
  generatedAt: string
  model: string // e.g. 'claude-sonnet-5-5' or 'mock'
}

export interface SessionRow {
  id: number
  userId: number
  title: string
  startedAt: string // ISO
  durationS: number
  audioPath: string | null
  screenPath: string | null
  thumbnailPath: string | null
  status: 'recording' | 'saved' | 'transcribing' | 'summarizing' | 'ready' | 'error'
  isDemo: boolean
  snippet: string // first ~140 chars of transcript
  hasSummary: boolean
  /** Per-session privacy controls chosen by the user. */
  access: SessionAccess
  /** True when the session is locked and has not been unlocked with the password in this app run (content is redacted). */
  isLockedNow: boolean
}

export interface SessionAccess {
  ai: boolean // Claude may read transcript/screenshots (summaries, Ask, screen descriptions)
  mcp: boolean // Claude Desktop / MCP clients may read it
  search: boolean // appears in global search
  locked: boolean // requires the account password to view
}

export interface SessionDetail extends SessionRow {
  segments: TranscriptSegment[]
  events: ScreenEvent[]
  summary: SessionSummary | null
}

export interface DashboardStats {
  minutesCaptured: number
  sessions: number
  questionsAsked: number
  streakDays: number
  audioCount: number
  screenCount: number
  audioDurationS: number
  screenDurationS: number
}

export interface VaultFile {
  path: string
  name: string
  kind: 'audio' | 'screen'
  sizeBytes: number
  modifiedAt: string
  sessionId: number | null
}

export interface SearchHit {
  sessionId: number
  sessionTitle: string
  startedAt: string
  t: number
  kind: 'speech' | 'screen'
  text: string
}

// ---------- Recording ----------
export interface CreateSessionInput {
  startedAt: string
  /** Let Claude see this session (screenshot descriptions, summary, Ask). Defaults to true. */
  aiAccess?: boolean
}
export interface FinalizeSessionInput {
  sessionId: number
  durationS: number
  audio: ArrayBuffer | null
  screen: ArrayBuffer | null
}
export interface ScreenshotInput {
  sessionId: number
  t: number
  jpegDataUrl: string // data:image/jpeg;base64,...
}

// ---------- AI ----------
/** smart = recording first, then Claude's own knowledge + web search (labeled). recording = strictly from the session. */
export type AskMode = 'smart' | 'recording'
export interface AskInput {
  requestId: string
  mode?: AskMode
  sessionId: number | null // null = latest session
  question: string
}
export interface QARow {
  id: number
  sessionId: number | null
  question: string
  answer: string
  createdAt: string
}

// ---------- Support ----------
export type Priority = 'low' | 'medium' | 'high'
export type TicketStatus = 'open' | 'in_progress' | 'resolved'
export interface Agent {
  id: number
  name: string
  email: string
  avatarColor: string
  specialty: string
}
export interface Ticket {
  id: number
  code: string // e.g. CV-1042
  userId: number | null
  agentId: number
  agent?: Agent
  subject: string
  description: string
  priority: Priority
  status: TicketStatus
  createdAt: string
}
export interface AgentLoad {
  agent: Agent
  open: number
  total: number
}
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
export interface CreateTicketInput {
  subject: string
  description: string
  priority: Priority
}

// ---------- Subscriptions / feedback ----------
export interface SubscriptionInfo {
  plan: Plan
  billing: Billing
  sessionsUsed: number
  sessionLimit: number | null // null = unlimited
  renewsAt: string | null
}
export interface FeedbackInput {
  sessionId: number | null
  rating: number // 1..5
  emoji: string | null
  comment: string
}
export interface FeedbackRow extends FeedbackInput {
  id: number
  createdAt: string
  sessionTitle?: string | null
}

// ---------- The preload API exposed as window.cv ----------
export interface CVApi {
  app: {
    info(): Promise<AppInfo>
    /** Save (or clear with '') the Anthropic API key to ~/ContextVault/.env and apply it immediately. */
    setAnthropicKey(key: string): Promise<Result<AppInfo>>
  }
  auth: {
    signUp(input: { name: string; email: string; password: string }): Promise<Result<User>>
    signIn(input: { email: string; password: string }): Promise<Result<User>>
    signOut(): Promise<void>
    current(): Promise<User | null>
    updateProfile(input: { name?: string; avatarColor?: string }): Promise<Result<User>>
    completeOnboarding(): Promise<Result<User>>
  }
  perms: {
    status(): Promise<PermissionStatus>
    requestMicrophone(): Promise<PermState>
    openScreenSettings(): Promise<void>
    openMicSettings(): Promise<void>
  }
  storage: {
    paths(): Promise<StoragePaths>
    chooseRoot(): Promise<StoragePaths | null>
    stats(): Promise<StorageStats>
    openFolder(kind: FolderKind): Promise<Result>
    showItem(path: string): Promise<void>
    mediaUrl(path: string): string // sync helper → cv-media:// URL
  }
  sessions: {
    list(): Promise<SessionRow[]>
    get(id: number): Promise<SessionDetail | null>
    latest(): Promise<SessionDetail | null>
    rename(id: number, title: string): Promise<Result>
    stats(): Promise<DashboardStats>
    search(query: string): Promise<SearchHit[]>
    setAccess(id: number, access: Partial<SessionAccess>): Promise<Result<SessionRow>>
    unlock(id: number, password: string): Promise<Result<SessionRow>>
    relock(id: number): Promise<Result<SessionRow>>
  }
  recording: {
    create(input: CreateSessionInput): Promise<Result<{ sessionId: number }>>
    screenshot(input: ScreenshotInput): Promise<Result<ScreenEvent>>
    finalize(input: FinalizeSessionInput): Promise<Result<SessionRow>>
    setStatus(sessionId: number, status: SessionRow['status']): Promise<void>
  }
  files: {
    list(): Promise<VaultFile[]>
    trash(paths: string[]): Promise<Result<{ freedBytes: number; trashed: number }>>
  }
  transcripts: {
    save(sessionId: number, segments: Omit<TranscriptSegment, 'sessionId' | 'id'>[]): Promise<Result>
    transcribeRemote(sessionId: number): Promise<Result<Omit<TranscriptSegment, 'sessionId' | 'id'>[]>>
  }
  ai: {
    summarize(sessionId: number, force?: boolean): Promise<Result<SessionSummary>>
    ask(input: Omit<AskInput, 'requestId'>, onDelta: (delta: string) => void): Promise<Result<string>>
    history(sessionId: number | null): Promise<QARow[]>
  }
  support: {
    chat(messages: ChatMessage[]): Promise<Result<string>>
    createTicket(input: CreateTicketInput): Promise<Result<Ticket>>
    myTickets(): Promise<Ticket[]>
    agentLoad(): Promise<AgentLoad[]>
  }
  subs: {
    get(): Promise<SubscriptionInfo>
    upgrade(input: { plan: Plan; billing: Billing }): Promise<Result<User>>
  }
  feedback: {
    submit(input: FeedbackInput): Promise<Result<FeedbackRow>>
    list(): Promise<FeedbackRow[]>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
  }
  demo: {
    loadSession(): Promise<Result<SessionRow>>
  }
}

// IPC channel names (single source of truth)
export const CH = {
  appInfo: 'app:info',
  appSetAnthropicKey: 'app:setAnthropicKey',
  authSignUp: 'auth:signUp',
  authSignIn: 'auth:signIn',
  authSignOut: 'auth:signOut',
  authCurrent: 'auth:current',
  authUpdateProfile: 'auth:updateProfile',
  authCompleteOnboarding: 'auth:completeOnboarding',
  permsStatus: 'perms:status',
  permsRequestMic: 'perms:requestMic',
  permsOpenScreen: 'perms:openScreen',
  permsOpenMic: 'perms:openMic',
  storagePaths: 'storage:paths',
  storageChooseRoot: 'storage:chooseRoot',
  storageStats: 'storage:stats',
  storageOpenFolder: 'storage:openFolder',
  storageShowItem: 'storage:showItem',
  sessionsList: 'sessions:list',
  sessionsGet: 'sessions:get',
  sessionsLatest: 'sessions:latest',
  sessionsRename: 'sessions:rename',
  sessionsStats: 'sessions:stats',
  sessionsSearch: 'sessions:search',
  sessionsSetAccess: 'sessions:setAccess',
  sessionsUnlock: 'sessions:unlock',
  sessionsRelock: 'sessions:relock',
  recCreate: 'rec:create',
  recScreenshot: 'rec:screenshot',
  recFinalize: 'rec:finalize',
  recSetStatus: 'rec:setStatus',
  filesList: 'files:list',
  filesTrash: 'files:trash',
  transcriptsSave: 'transcripts:save',
  transcriptsRemote: 'transcripts:remote',
  aiSummarize: 'ai:summarize',
  aiAsk: 'ai:ask',
  aiAskDelta: 'ai:ask:delta',
  aiHistory: 'ai:history',
  supportChat: 'support:chat',
  supportCreateTicket: 'support:createTicket',
  supportMyTickets: 'support:myTickets',
  supportAgentLoad: 'support:agentLoad',
  subsGet: 'subs:get',
  subsUpgrade: 'subs:upgrade',
  feedbackSubmit: 'feedback:submit',
  feedbackList: 'feedback:list',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  demoLoad: 'demo:load'
} as const

export const MAX_SESSION_SECONDS = 180
export const SCREENSHOT_INTERVAL_SECONDS = 15
export const PLAN_LIMITS: Record<Plan, number | null> = { free: 5, pro: null, team: null }
export const MODELS = {
  smart: 'claude-sonnet-5-5',
  fast: 'claude-haiku-5-5'
} as const
