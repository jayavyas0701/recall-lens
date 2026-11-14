# Context Vault — brief for feature subagents

Context Vault is an Electron desktop app for a **live hackathon demo in front of judges**. It records the user's screen + voice (3-minute sessions max), turns them into a searchable memory, and lets the user ask Claude questions such as "What did I say in the last minute?". Visual polish and reliability during the demo matter most.

Project root: `/home/claude/context-vault`. Original spec: `/mnt/user-data/uploads/c68df092-attachment.txt` (read the sections relevant to you).

## Stack (already installed — do NOT add heavy deps without reason; if you must, `npm i -D <pkg>` and say so in your report)
Electron 45 · electron-vite 6 · Vite 8 · React 19 · TypeScript 5.9 · Tailwind v4 · framer-motion · lucide-react · recharts · canvas-confetti · sonner (toasts) · Radix primitives · react-router-dom 7 (HashRouter) · @anthropic-ai/sdk (main process only) · sql.js (SQLite WASM) · @huggingface/transformers (renderer).

## Architecture (read these files first)
- `src/shared/types.ts` — **all shared types, the full `CVApi` (window.cv) surface, IPC channel names `CH`, constants (`MODELS`, `MAX_SESSION_SECONDS`, `PLAN_LIMITS`, …)**.
- `src/preload/index.ts` — implements every `CVApi` method as `ipcRenderer.invoke(CH.x, ...)`. `ai.ask` streams deltas over `CH.aiAskDelta` events `{requestId, delta}`.
- `src/main/index.ts` — window, `cv-media://` protocol (serve vault files to `<img>/<video>/<audio>`; build URLs with `cv.storage.mediaUrl(path)`), display-media handler (auto picks primary screen; loopback audio where supported), IPC registration.
- `src/main/db.ts` — `all/get/run/exec/transaction/nowIso`. Positional `?` params. Persisted automatically.
- `src/main/schema.ts` — tables: users, sessions, transcript_segments, screen_events, qa_history, feedback, agents, tickets, subscriptions, settings.
- `src/main/mappers.ts` — row → type mappers (`toUser`, `toSession`, `toSegment`, `toEvent`, `toAgent`, `toTicket`, `parseSummary`).
- `src/main/ipc/util.ts` — `handle`, `handleResult` (exceptions → `{ok:false,error}`), `handleWithEvent`, `ok`, `fail`.
- `src/main/ipc/auth.ts` — `requireUser()` / `currentUser()` for user-scoped handlers.
- `src/main/ipc/sessions.ts` — list/get/latest/stats/search + exported `getSessionDetail(id, userId)`, `latestSessionId(userId)`.
- `src/main/ipc/demo.ts` — demo Tokyo session fixture: `seedDemoSession(userId)`, `DEMO_SEGMENTS`, `DEMO_EVENTS`, `DEMO_SUMMARY`.
- `src/main/ai/client.ts` — `getAnthropic()` (null when no key → use mock), `hasAnthropic()`, `textOf(msg)`, `describeScreenshot(base64, t)`.
- `src/main/paths.ts` — `getPaths()` → `{root, audio, screen, screenshots, transcripts}`; `APP_HOME`, `DB_PATH`.
- Renderer: `src/renderer/src/` — `lib/api.ts` (`cv`), `lib/auth.tsx` (`useAuth`, `useUser`), `lib/events.ts` (`emit/on/useAppEvent` with events `sessions:changed`, `files:changed`, `user:changed`, `qa:changed`, `recording:open`, `tickets:changed`), `lib/confetti.ts` (`celebrate`, `sparkle`), `lib/utils.ts` (`cn`, `formatClock`, `formatDuration`, `formatBytes`, `formatDate`, `GRADIENTS`, `ACCENTS`, `logError`).
- UI kit: `components/ui/*` (Button variants: gradient/default/outline/ghost/soft/danger/link; Card; Input/Textarea/Label; Badge variants; Dialog; Tabs; Checkbox; Switch; Skeleton; Progress).
- Common: `components/common/*` — `Page`, `PageHeader`, `stagger`/`fadeUp` variants, `TiltCard`, `CountUp`, `StatCard`, `EmptyState`, `GradientAvatar`, `VaultMark`, `Aurora`.
- Design tokens (Tailwind v4 `@theme` in `styles/globals.css`): colors `canvas, ink, ink-soft, ink-faint, line, violet, pink, orange, cyan, lime, danger`; utilities `glass`, `bg-grad`, `bg-grad-cool`, `bg-grad-warm`, `bg-grad-fresh`, `text-grad`, `grad-animate`, `shimmer`; shadows `shadow-soft`, `shadow-glow-violet`, `shadow-glow-pink`; fonts `font-display` (Space Grotesk headings) & sans (Plus Jakarta Sans). ⚠️ Don't combine `bg-grad` with another `bg-*` class inside `cn()` — tailwind-merge will drop one.

## Design bar
Bright, playful, impressive: near-white `#FAFAFF` base, vivid violet/pink/orange/cyan/lime accents, gradients on CTAs and highlights, glass cards (`glass rounded-2xl`), generous spacing, Framer Motion everywhere but tasteful (page transitions via `<Page>`, hover lift/tilt, staggered lists, count-up numbers, skeleton loaders). Toast (sonner `toast`) for every action. Must look great at **1440×900** (the content area is ~1190×820 after the 248px sidebar and 76px top bar). Add extra delightful touches where they fit.

## Rules
1. **Only edit files you own** (listed in your task). Shared files (`src/shared/*`, `src/preload/*`, `src/main/index.ts`, `src/main/db.ts`, `schema.ts`, `mappers.ts`, `paths.ts`, `ipc/util.ts`, `ipc/auth.ts`, `ipc/sessions.ts`, `ipc/system.ts`, `ipc/demo.ts`, `ai/client.ts`, `App.tsx`, `components/**`, `lib/**`, `styles/**`) belong to the orchestrator. If you need a change there, **don't make it** — describe the exact change in your final report (or work around it inside your own files). You may create new files inside your own folders.
2. Recordings never leave the device; only text + screenshots go to the Anthropic API, and only from the main process. No dark patterns.
3. Every AI call must have a realistic **mock fallback** when `getAnthropic()` returns null, and must catch API errors and fall back too. Never crash.
4. Log errors with the `[ContextVault]` prefix (`log` from `src/main/log.ts`, `logError` in renderer).
5. Keep the existing exported function names/signatures of the stub you replace (others import them).
6. Add one line per meaningful decision to your report (the orchestrator will merge them into `DECISIONS.md`). Do not edit DECISIONS.md / PROGRESS.md yourself (parallel agents would clobber each other).

## Verifying your work (other agents work in parallel in the same tree)
- Typecheck: `cd /home/claude/context-vault && npm run typecheck 2>&1 | grep -E "error TS" | grep -E "<your paths>"` — only your files' errors are yours; ignore errors in other agents' files (they're mid-edit).
- Build into **your own** out dir: `npx electron-vite build --outDir out-<letter>` (never the default `out`).
- Headless run with screenshots: write a steps JSON (see `.smoke/auth.json` for an example) and run `OUT=out-<letter> ./scripts-smoke.sh .smoke/<letter>-steps.json /tmp/cv-home-<letter>`; then view the PNGs with the Read tool. Steps: `{"wait":ms}`, `{"js":"...code; return value"}` (runs in renderer, `window.cv` available; navigate with `location.hash='#/app/vault'`), `{"shot":"/tmp/smoke-<letter>/x.png"}`. Use a fresh HOME dir per run (`rm -rf /tmp/cv-home-<letter>`). A typical setup step: `const r = await window.cv.auth.signUp({name:'Shilpa Rao',email:'s'+Date.now()+'@t.co',password:'Tokyo!2026'}); await window.cv.auth.completeOnboarding(); await window.cv.demo.loadSession(); location.reload(); return r.ok` then wait ~2500 ms.
- The headless box is Linux without mic/camera and with no ANTHROPIC_API_KEY, so you'll see mock-AI paths. Real mic/screen capture can't be exercised here — write it carefully and defensively.
- **Debugging budget:** at most 3 fix attempts on any one problem; then use a simpler fallback (clearly labeled) and note it in your report. Never loop.

## Final report (your last message)
- Files created/changed.
- What works & how you verified it (include which screenshots you looked at).
- Requested changes to orchestrator-owned files (exact code if possible).
- Decisions (one line each).
- Known limitations.
