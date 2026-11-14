# Context Vault — your memory, on demand

Context Vault records your screen and voice (3-minute sessions), turns them into a searchable memory, and lets you ask Claude things like **"What did I say in the last minute?"** or **"What was I searching for?"**.

Recordings never leave your device. The only data sent to the Anthropic API is transcript text and the screenshots (one every 15 seconds) that get turned into one-line descriptions.

## Quick start

```bash
npm install && npm run dev
```

Requirements: **Node 20.19+ or 22.12+** (Vite 8 needs one of these) on macOS, Windows or Linux. The first live transcription downloads the Whisper model (~80 MB) from Hugging Face, so record once on good Wi-Fi before the demo, or just use the demo session.

### API keys (optional)
```bash
cp .env.example .env
# then edit .env:
ANTHROPIC_API_KEY=sk-ant-...     # live Claude summaries, Q&A, screenshot descriptions, support bot
OPENAI_API_KEY=sk-...            # optional: use the OpenAI Whisper API instead of local Whisper
```
Without `ANTHROPIC_API_KEY`, the app still runs. A "Demo AI mode" banner appears and every AI feature uses realistic mock answers built from your own transcript data. Restart `npm run dev` after editing `.env`. The app also reads `~/ContextVault/.env`.

Models: `claude-sonnet-5-5` (summaries and Ask Claude) and `claude-haiku-5-5` (screenshot descriptions and the support bot). Claude is only called from the Electron main process.

### OS permissions (needs a person to click, once)
- **macOS → Microphone**: click *Grant access* during onboarding and accept the system prompt.
- **macOS → Screen Recording**: open System Settings → Privacy & Security → Screen Recording and turn on the app that runs `npm run dev` (Terminal, iTerm or VS Code) and/or **Electron**. Then **quit and relaunch** the app. The onboarding step has a button that opens this settings pane.
- **System audio** (sound from the screen): supported on Windows and experimental on macOS 13+. Everywhere else the mic is used, and nothing is blocked.

## Where things live
```
~/ContextVault/
├─ vault.db                 # local SQLite (sql.js)
├─ config.json              # storage-folder setting
├─ recordings/audio/        # mic .webm
├─ recordings/screen/       # screen .webm
├─ recordings/screenshots/  # 15-second screenshots (jpg)
└─ transcripts/             # .txt + .json per session
```
You can move the recordings folder in Onboarding or Settings. The DB always stays in `~/ContextVault/`.

## Demo safety net
**Settings → Load demo session** (also on the empty states) seeds a realistic 3-minute "Tokyo trip planning" session with a transcript, screen events and a summary. Everything (summary, Ask Claude, search and the MCP server) then works without a live recording.

## Claude Desktop integration (MCP)
A small stdio MCP server in `mcp/server.mts` reads the same DB in read-only mode and exposes:
- `get_recent_context(minutes)`: what you said and saw in the last N minutes of your latest session
- `search_context(query)`: search across all transcripts and screen descriptions

Add this to Claude Desktop's config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows). Replace the path with your project folder:
```json
{
  "mcpServers": {
    "context-vault": {
      "command": "/ABSOLUTE/PATH/TO/context-vault/node_modules/.bin/tsx",
      "args": ["/ABSOLUTE/PATH/TO/context-vault/mcp/server.mts"]
    }
  }
}
```
Restart Claude Desktop, then ask: *"Using Context Vault, what did I say in the last minute?"*
(If Claude Desktop can't find `node`, set `"command"` to your absolute `node` path and `"args"` to `["--import", "tsx", "/ABSOLUTE/PATH/.../mcp/server.mts"]`. You can also test it manually with `npm run mcp`.)

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run typecheck` | Typecheck main/preload and renderer |
| `npm run build` | Typecheck and build to `out/` |
| `npm run mcp` | Start the MCP server on stdio |

## Tech
Electron 45 · electron-vite · React 19 · TypeScript · Tailwind v4 · shadcn-style components on Radix · Framer Motion · lucide-react · Recharts · canvas-confetti · sonner · sql.js · bcryptjs · @huggingface/transformers (local Whisper) · @anthropic-ai/sdk · @modelcontextprotocol/sdk.

See `DECISIONS.md` for the design and engineering decisions and `PROGRESS.md` for build status.

## Developer testing aid
`scripts-smoke.sh` runs the built app headless (Xvfb) with scripted steps and screenshots. Steps live in `.smoke/*.json`, and the hook is `CV_SMOKE_SCRIPT` in `src/main/index.ts`. It's used for verification only and is inactive in normal runs.
