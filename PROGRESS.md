# Progress

## Phase 1 — Scaffold, design system, shell (orchestrator)
- [x] electron-vite + React + TS + Tailwind v4 scaffold
- [x] Design system (tokens, glass, gradients, fonts, motion helpers)
- [x] shadcn-style UI kit
- [x] App shell: sidebar, top bar, global search, record slot, upgrade pill, API-key banner
- [x] Routing + guards (auth → onboarding → app)

## Phase 2 — Auth, DB, preload (orchestrator)
- [x] sql.js SQLite + schema + atomic persistence
- [x] bcrypt auth (sign up / sign in / persisted session)
- [x] Typed preload API (`window.cv`) + IPC channel map
- [x] Splash + Sign In / Sign Up screen with confetti
- [x] Demo-session seed fixture

## Phase 3 — Permissions onboarding (orchestrator)
- [x] Mic / Screen / System audio / Storage stepper with live badges

## Phase 4 — Features (parallel)
- [x] A: Recording, 3-min auto-stop, screenshots, Tab 1 My Vault, Tab 2 Clean Up
- [x] B: Whisper transcription, Claude summary, Tab 3 + Ask Claude chat
- [x] C: Support chatbot, agent seeding, ticket routing, admin view
- [x] D: Subscriptions, feedback, settings

## User feedback round (Nov 14)
- [x] Support page shows only the user's own tickets (no admin routing view)
- [x] Real on-device screen understanding (window, URL, OCR) — no more "(demo description)"
- [x] Paste API key in Settings; Live/Demo badge on Ask Claude

## Security round (Nov 14 AM)
- [x] Per-session access control (AI / MCP / search / password lock) + pre-recording privacy choice

## Phase 5–8
- [x] Integration + end-to-end run (headless: sign up UI → onboarding → vault → demo → summary + Ask → cleanup → ticket → Pro → settings)
- [x] Polish pass (dialog animation, outlet freeze, toast position, support bubble docking)
- [x] MCP server (stretch) — `get_recent_context`, `search_context`, tested with an MCP client
- [x] Reviewer pass + fixes — independent reviewer: 2 blockers + 5 should-fix + nice-to-haves, all addressed and re-verified

## Acceptance checklist
- [x] Sign up → permissions → main app works end to end, with confetti
- [x] Recording auto-stops at 3:00 and files show up in the real folders (verified with a real 180 s screen recording under Xvfb)
- [x] Tab 1 / Tab 2 tiles call `shell.openPath` on the real folders (OS file manager opening needs a desktop — verify on the Mac)
- [x] Deleted files go to the Trash and disappear from the UI
- [x] Summary appears; "What did I say in the last minute?" and "What was I searching for?" answered correctly (mock path verified; live path needs a key)
- [x] New ticket → agent with fewest open tickets; chat shows "Ticket #CV-1042 assigned to Priya (abc123@contextvault.com) 🎧"
- [x] Upgrading to Pro updates the avatar badge
- [x] Demo session button makes everything work without a live recording
- [x] Without an API key the app runs on the mock AI fallback
- [x] `npm run typecheck` and `npm run build` pass
- [x] DECISIONS.md and PROGRESS.md up to date
