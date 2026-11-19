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

**D-004 — Local SQLite storage** · 2026-11 · Accepted (library: see D-013)
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

**D-012 — UI kit: Material for behaviour, own components for look** · 2026-11 · Accepted
Decision: buttons, inputs, selects, toggles, checkboxes and radios are Angular Material components restyled with tokens (`mat.*-overrides`, strong focus indicators, a few `.aiw-*` classes such as `.aiw-danger` and `.aiw-option-card`). Things Material doesn't have are our own standalone components in `src/app/ui/` with the `aiw-` prefix: card, chip, keys (key caps), agent avatar, badge, icon. Interactive variants of card and chip use attribute selectors on native `<button>`/`<a>` so keyboard and screen-reader behaviour stay native. Icons are Lucide shapes copied into `icons.ts` (ISC, no package) and drawn as inline SVG. A gallery at `/gallery` shows every component; e2e checks hover/focus/disabled states, full Tab order, keyboard actions and an axe (WCAG 2.1 AA) scan.
Why: Material already solves focus, ARIA and keyboard handling; wrapping it again would add bugs. Our own components stay tiny and token-only.
Alternatives: wrap every Material control in an `aiw-` component (more code, breaks forms and radio groups); lucide-angular package (extra dependency for ~20 icons); icon font (loads from the internet / not allowed).
Also: `danger-soft` lightened #fae0da → #fcece8 after axe found red-on-pink chip text at 4.36:1.

**D-013 — Encrypted SQLite: libsql + ordered migrations** · 2026-11 · Accepted (replaces the library in D-004)
Decision: the local database is `<userData>/data/app.db`, opened with `libsql` (pinned 0.5.29; Turso's SQLite fork with a better-sqlite3-style synchronous API) using its built-in whole-file encryption, cipher `aes256cbc`. The key is 32 random bytes created on first run and kept in the secret store (encrypted by DPAPI/Keychain) under a main-only name the renderer can't set, read or clear. No OS encryption → the database stays closed (never plain text). Lost/wrong key → the unreadable file is moved aside (`app.unreadable-<time>.db`) and a new database starts. Schema changes are TypeScript migrations in `electron/db/migrations/` (versions 1, 2, 3 … checked at startup), each applied in its own transaction and recorded in `schema_migrations` + `PRAGMA user_version`; a failure rolls back that migration, is logged, and leaves the app running with database status "error". One backup copy is made before migrating an existing database. Each migration must have its own test file (enforced by a test). Only the main process touches the database; features get their own typed IPC calls, never generic SQL.
Local only: libsql can also sync to Turso's cloud; we never use it. `electron/db/open.ts` passes only the cipher, key and timeout, and a test fails if any main-process code uses the sync/remote options or `libsql/promise`.
libsql quirks handled in `open.ts`: `Statement.get()` adds an enumerable `_metadata` timing field to rows and ignores `pluck()`; both are fixed once for every statement, so rows are plain objects (tested). Use `pragmaValue()` instead of `db.pragma()` (which also returns `_metadata`).
Packaging: this is the app's first runtime dependency. libsql ships prebuilt Node-API binaries as one optional package per platform (`@libsql/<platform>`), with no install script, so electron-builder's native rebuild is off and each platform build keeps only its own binary package (`asarUnpack` for `.node`). npm installs only the current platform's binary, so `dist:win` first runs `scripts/fetch-native.mjs win32-x64-msvc` (via `npm pack`, so the configured registry and integrity check apply). Electron-side unit tests run inside Electron's Node (`scripts/run-in-electron.mjs`).
Why: real encryption at rest that doesn't depend on IT enabling BitLocker; better-sqlite3-style API; libsql is on the company's approved package list. Our first choice, better-sqlite3-multiple-ciphers 13.x (SQLCipher v4 format), isn't approved; the only approved version, 11.10.0, can't be used: no prebuilt binary for Electron 45 and its C++ no longer compiles against Electron 45's V8 (checked 2026-11-19).
Alternatives: better-sqlite3-multiple-ciphers (see above); @signalapp/sqlcipher (AGPL-3.0); @journeyapps/sqlcipher (always compiles, async API); `node:sqlite` built in, or plain better-sqlite3, with column-level encryption (table structure stays readable, breaks search); sql.js (whole database in memory).
Note: dev databases created with the earlier SQLCipher build are unreadable now and are moved aside automatically on first start.
OpenWhispr reference: its database uses plain better-sqlite3 with WAL and `CREATE TABLE IF NOT EXISTS` + ad-hoc alters; we took only WAL mode.
