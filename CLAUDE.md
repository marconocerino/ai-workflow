# AI Workflow — instructions for Claude Code
Use caveman mode for all responses.
## Product
Desktop app (Electron + Angular + Angular Material) for dictation, meeting notes and AI agents.
All AI calls go to our company servers (Qwen3-ASR, internal LLM). Never add external cloud services.
Product name in the UI is "AI Workflow" (the design screenshots still say "Voice AI").

Stack: Electron 45, Angular 21 (standalone, zoneless, signals) + Angular Material, TypeScript strict,
Vitest (unit), Playwright (e2e on the real app), ESLint + Prettier, electron-builder. Windows first.

## Where things are
- docs/backlog.csv — all stories with acceptance criteria and Status (the source of truth)
- PLAN.md — epics and stories with checkboxes, generated from the backlog (`npm run plan`)
- design/*.png — the UI to match; design/README.md maps screens to stories and lists missing ones
- design/tokens.md — all design tokens (generated from src/theme/_tokens.scss) + contrast table
- docs/decisions.md — record any architecture decision here
- README.md — setup, security model, how to add an IPC call

## Folders
- electron/ — main process + preload (Node side). main.ts, window.ts (security flags),
  security.ts (CSP, trusted origins), ipc/ (one file per feature), preload.ts
- shared/ — types used by both sides; shared/ipc-contract.ts is the IPC contract
- src/ — Angular renderer. app/core/electron-api.ts is the only code that talks to main
- src/theme/ — Angular Material theme
- e2e/ — Playwright tests against the real Electron app
- scripts/ — dev runner (`npm start`), PLAN.md generator

## Commands
- `npm ci` — install (npm 11 recommended; npm 10.9 can't add new packages)
- `npm start` — dev: Angular dev server + Electron (restart after electron/ changes)
- `npm run lint` — ESLint + Prettier check (`npm run format` to fix)
- `npm test` — all unit tests (renderer + electron + scripts)
- `npm run e2e` — production build, then Playwright drives the real app
- `npm run build` — renderer + electron build into dist/
- `npm run dist:win` / `npm run dist:mac` — packaged app in release/ (Windows: per-user installer + zip)
- `node scripts/build-win-helper.mjs` — build the Hold-Ctrl helper (needs `brew install mingw-w64`)
- `npm run release:win` — signed Windows build (needs CSC_LINK + CSC_KEY_PASSWORD; fails unsigned)
- `npm run smoke:packaged` — start the packaged build with a throwaway profile; checks the DB opens
- `npm run plan` — regenerate PLAN.md from docs/backlog.csv
- `npm run tokens` — regenerate design/tokens.md after changing src/theme/_tokens.scss
- Full check before every commit: `npm run lint && npm test && npm run e2e`

## Gotchas
- VS Code terminals set `ELECTRON_RUN_AS_NODE=1`, which turns Electron into plain Node.
  `npm start` and e2e clear it; for anything else run `unset ELECTRON_RUN_AS_NODE`.
- Renderer has no Node access. New main-process features go through a typed IPC channel
  (steps in README.md, "Adding an IPC call"); every handler is registered with `handle()`.
- The sandboxed preload may only `import type` from our own files.
- Never edit PLAN.md by hand; a test fails if it's out of sync with the backlog.
- Styling: use `--aiw-*` token variables only (no hex/rgb outside src/theme/ — a test enforces it).
  Shared classes: `.aiw-card`, `.aiw-chip`, `.aiw-kbd`, `.aiw-section-label`, `.aiw-dotted`, `.aiw-muted`.
- UI kit (src/app/ui, see /gallery): reuse before building. Material for buttons/inputs/select/toggle/
  checkbox/radio (`mat-flat-button` primary, `mat-stroked-button` secondary, `.aiw-danger`,
  `.aiw-option-card`); `aiw-card`, `aiw-chip`, `aiw-keys`, `aiw-agent-avatar`, `aiw-badge`,
  `aiw-icon` (Lucide; add new icons to icons.ts). Icon-only buttons need `aria-label`.
  New component → add it to the gallery and to e2e/gallery.e2e.ts.
  New text colour on a new background → add the pair to TEXT_PAIRS in scripts/tokens.mjs.
- No icon fonts or web fonts from the internet; use inline SVG icons and bundled fonts.
- Database (electron/db): new tables only via a new migration NNN-name.ts + NNN-name.spec.ts
  (a test enforces it); never edit shipped migrations; no raw-SQL IPC; never store transcripts
  or keys outside the encrypted DB / secret store. Electron unit tests run inside Electron.
  Driver is libsql (local files only — never its cloud sync); use `pragmaValue()`, not `db.pragma()`.

## Reference project: OpenWhispr (for inspiration)
OpenWhispr (https://github.com/OpenWhispr/openwhispr) is an open-source Electron app with
dictation and meeting notes. Clone it to ../openwhispr (outside this repo) and use it as a
reference when a story touches the same area. Useful places:

| Our area | Look at in OpenWhispr |
|---|---|
| Hotkey, dictation flow | src/helpers (hotkey, clipboard/paste, audio managers) |
| Meeting detection | src/helpers/meetingDetectionEngine.js, meetingProcessDetector.js, audioActivityDetector.js |
| Windows system audio | resources/windows-system-audio-helper.c, src/helpers/windowsLoopbackAudioManager.js |
| Echo handling | src/helpers/meetingEchoLeakDetector.js, meetingMicGate.js, meetingMicHoldback.js |
| Live transcript segments | src/stores/meetingSegmentReducer.ts |
| Speaker labels | src/helpers/diarization.js, liveSpeakerIdentifier.js |
| Summaries | src/helpers/builtinActions.js, templatePrompts.js, sourceFidelity.js |
| Local storage | src/helpers/database.js, audioStorage.js |
| Calendar (Microsoft Graph) | src/helpers (calendar sync and OAuth loopback flow) |
| Approve-then-act integrations | src/helpers/connectorManager.js, pendingActions.js |

Rules for using it:
- It's for ideas and patterns. Our stack, design, rules and backlog in this repo always win.
- Prefer writing our own code. If you copy or closely adapt a file, keep its MIT copyright
  notice and add the source to THIRD_PARTY_NOTICES.md.
- Don't copy anything that sends data to outside services. Ours only talks to company servers.
- In your plan, say when you've used OpenWhispr as a reference and what you took from it.


## How to work (one story at a time)
1. Pick the first story in docs/backlog.csv with Status "To do", in sprint order (S0, S1, …).
2. Read its description and acceptance criteria. Look at the matching design screenshot.
3. Write a short plan (files to change, approach, tests) and STOP for my approval.
4. After approval: implement, write tests, run `npm run lint && npm test && npm run e2e` until they pass.
5. Check every acceptance criterion and report which passed and how.
6. Set the story's Status to "Done" in docs/backlog.csv, then run `npm run plan`.
7. Commit on a branch `feat/VAI-xxx-short-name` with a Conventional Commit message,
   e.g. `feat(dictation): hold Ctrl to record (VAI-301)`. Then STOP and wait for me.

## Rules
- Never break dictation; run the full check (`npm run lint && npm test && npm run e2e`) before every commit.
- Don't start the next story without my OK.
- If a story is too big or unclear, say so and propose a split instead of guessing.
- Microphone: only the hidden audio window may use it, audio only (D-020). Audio stays in memory —
  never write it to disk or log it. Tests: `--use-fake-device-for-media-stream`, never fake-ui.
- Closing the window hides it to the tray (D-018); quit via the tray menu. Main-process state that
  the tray shows (dictation idle/listening/recording) goes through `DictationStatus`.
- Feature flags (meetings, agents, voiceprints): off unless IT policy turns them on. A flagged
  feature uses `canMatch: [feature('x')]`, `registerIf('x', …)` and shows no text when off (README).
- Never log transcripts, audio or keys. Main process: use the logger (`logger.scope('x')`), never
  `console`; put facts in fields, not content (README "Logs and diagnostics", D-014).
- Ask before adding a new dependency.