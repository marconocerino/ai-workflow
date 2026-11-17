# Architecture decisions

Add a new entry whenever a library, pattern or trade-off is chosen. Newest at the bottom.
Format: **D-number — title** · date · status (Accepted / Superseded by D-x) · decision · why · alternatives considered.

---

**D-001 — Electron + Angular + Angular Material** · 2026-11 · Accepted
Decision: desktop app built with Electron; UI in Angular with Angular Material, TypeScript strict.
Why: existing dictation MVP uses this stack; team knows it; good Windows support.
Alternatives: Tauri (smaller, Rust backend) — rejected for now to avoid a rewrite.

**D-002 — All AI on company servers** · 2026-11 · Accepted
Decision: speech-to-text via our hosted Qwen3-ASR; text tasks via our internal LLM endpoints (OpenAI-compatible API). Endpoints come from managed config.
Why: data must not leave the company.

**D-003 — Meeting capture without a bot** · 2026-11 · Accepted
Decision: capture the microphone and the computer's own audio output (WASAPI process loopback on Windows) as two separate channels, via a native helper process.
Why: works with Teams and Zoom without admin approval of a meeting bot; mic channel identifies the user.

**D-004 — Local SQLite storage** · 2026-11 · Accepted
Decision: better-sqlite3 with versioned migrations; transcripts stored at word level with channel and timestamps; secrets via Electron safeStorage.

**D-005 — No stored voiceprints in the pilot** · 2026-11 · Accepted
Decision: speakers are labelled per meeting and named by the user (with attendee suggestions). Voiceprints only behind a feature flag after legal/DPO approval and opt-in.
Why: voiceprints are biometric data under GDPR.

**D-006 — Agents propose, users approve** · 2026-11 · Accepted
Decision: one orchestrator model with personas; tools are marked read-only or action; every action goes through an approval queue and is logged.
Why: safety, trust, and protection against instructions hidden in documents or emails.

**D-007 — Scaffold tooling: Angular CLI + tsc + electron-builder** · 2026-11 · Accepted
Decision: Angular 21 (CLI, standalone components, zoneless, Vitest unit tests) builds the renderer to `dist/renderer`; main and preload compile with plain `tsc` (CommonJS) to `dist/app`; electron-builder packages. Production renderer is served via a privileged `app://renderer` protocol, not `file://`. Playwright `_electron` for end-to-end tests; ESLint (angular-eslint + typescript-eslint) + Prettier. All npm packages are devDependencies, because Angular is bundled and main has no runtime deps, so nothing from node_modules ships in the app. npm 11 `allowScripts` limits install scripts (only esbuild allowed).
Why: Angular 21 instead of 22 because the dev machine runs Node 22.13 (Angular 22 needs ≥22.22); upgrade later. tsc instead of a bundler keeps the toolchain small; the sandboxed preload uses type-only imports so it needs no bundling. electron-builder gives NSIS installers and Windows signing for VAI-108. A custom protocol gives a real origin for CSP, IPC sender checks and Angular routing.
Alternatives: Electron Forge (weaker Angular support, Squirrel installer); Vite/esbuild bundling for main (not needed yet); `file://` loading (no origin, weaker CSP and routing).

**D-008 — Typed IPC contract with sender checks** · 2026-11 · Accepted
Decision: every channel is declared once in `shared/ipc-contract.ts` (request/response types). Main registers handlers through `createIpcRegistrar`, which rejects calls whose sender frame is not our renderer origin. Preload exposes narrow functions on `window.aiWorkflow`, never `ipcRenderer`. Angular reaches it only through the `ElectronApi` service.
Why: compile-time safety on both sides, one place to review the attack surface, and easy mocking in tests.
Alternatives: exposing a generic `invoke(channel, …)` to the renderer (wider attack surface).

**D-009 — AI endpoints are user-editable in Settings** · 2026-11 · Accepted (partly supersedes D-002)
Decision: the speech-to-text and LLM base URLs, model names and API keys are set by the user in Settings (story VAI-113), not only through managed config. VAI-104 (managed endpoint config) is closed. Requests are made from the main process only, to the configured hosts. An optional host allowlist that IT can lock down may be added later; when empty, any http(s) URL is allowed.
Why: product owner wants users to connect the app to the company AI servers themselves.
Risk: a user could point the app at an outside AI service, which breaks the "all AI on company servers" rule. Mitigations: URLs validated (http/https, no credentials or query); the allowlist hook above; pilot users are told to use company endpoints only.
Alternatives: managed config only (VAI-104 as written) — rejected by product owner for now.

**D-010 — Settings and secrets storage** · 2026-11 · Accepted
Decision: settings live in `<userData>/settings.json` as `{ version, data }`, upgraded step by step by `electron/settings/migrations.ts`, validated field by field with hand-written checks (no schema library). Writes are atomic (temp file + rename). Corrupt files are moved aside (`settings.corrupt-<time>.json`) and defaults are used; a file from a newer app version is left untouched and updates are refused. Secrets (API keys, later tokens) live in a separate `<userData>/secrets.json`, each value encrypted with Electron `safeStorage` (DPAPI on Windows, Keychain on macOS), file mode 0600. If OS encryption isn't available (incl. Linux `basic_text`), secrets are not stored — never a plain-text fallback. The renderer can set, check and clear a secret but there is no channel that returns its value; only the main process decrypts. Logs name fields and files, never values.
Why: meets VAI-105; keeps keys out of the renderer, which is the part exposed to web content.
Alternatives: electron-store (extra dependency, no field-level recovery); zod for validation (extra dependency, not needed for a small schema); keytar (deprecated, native module).

**D-011 — Design tokens as Sass map → CSS variables, Material pointed at them** · 2026-11 · Accepted
Decision: every colour, font, spacing, radius, shadow and border is written once in `src/theme/_tokens.scss` and emitted as `--aiw-*` CSS variables on `:root`. Angular Material's system variables (`--mat-sys-*`) are overridden to point at our variables (`mat.theme-overrides`), and buttons/form fields get token-based overrides. Components use only variables; a test fails on raw colours outside `src/theme/`. A second test checks every real text/background pair for 4.5:1 contrast, and an e2e test checks rendered text in the app. `design/tokens.md` is generated from the SCSS (`npm run tokens`). Fonts (Fraunces, Archivo, JetBrains Mono) are bundled from `@fontsource-variable/*` (OFL).
Why: one place to change the look; runtime variables mean a token change reaches every screen and every Material component; contrast is enforced, not hoped for.
Changes from the screenshots: placeholder #838e81 → #637063, Notetaker avatar background #c5d4bb → #d2dec9 and Writer olive #5e6b1e → #515f1f (all to reach 4.5:1); the black input fields in the mocks are not copied.
Alternatives: Material palettes only (can't hit exact brand colours); tokens in JSON with a build step (more tooling); Google Fonts (external service, not allowed).
