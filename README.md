# AI Workflow

Desktop app for dictation, meeting notes and AI agents. Built with Electron + Angular + Angular
Material. All AI calls go to our company servers. See `docs/decisions.md` for architecture
decisions and `docs/backlog.csv` for the backlog.

## Prerequisites

- Node.js `^20.19`, `^22.12` or `>=24` (Angular 21 requirement)
- npm 11 recommended (`npm install -g npm@11`). npm 10.9 fails when adding new packages
  (`Cannot read properties of null (reading 'edgesOut')`); `npm ci` from the lockfile works on both.
- Windows 10/11 or macOS. Windows is the target platform; macOS is fine for development.

## Run

```sh
npm ci          # install exactly what's in package-lock.json
npm start       # Angular dev server + Electron, renderer reloads on save
```

`npm start` runs `scripts/dev.mjs`: it compiles `electron/` (and keeps watching it), starts
`ng serve` on port 4200 and opens Electron pointing at it. Renderer changes reload live; after
changing `electron/` code, close the app and run `npm start` again.

## Test

| Command                 | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run lint`          | ESLint (TypeScript, Angular, templates + accessibility) and Prettier |
| `npm test`              | All unit tests: renderer (`ng test`, Vitest) + main process (Vitest) |
| `npm run test:renderer` | Angular unit tests only                                              |
| `npm run test:electron` | Type-check + unit tests for `electron/` and `shared/`                |
| `npm run e2e`           | Production build, then Playwright launches the real Electron app     |
| `npm run format`        | Fix formatting with Prettier                                         |

Run `npm run lint && npm test && npm run e2e` before every commit.

## Build

| Command            | Output                                                    |
| ------------------ | --------------------------------------------------------- |
| `npm run build`    | `dist/renderer` (Angular) + `dist/app` (main and preload) |
| `npm run dist:win` | `release/AI Workflow-<version>-win.zip` (x64, unsigned)   |
| `npm run dist:mac` | `release/mac-*/AI Workflow.app` (unsigned, for dev)       |

`dist:win` also works from macOS. Installer, code signing and auto-update come later (VAI-108,
VAI-110).

## Project layout

```
electron/          main process + preload (Node side)
  main.ts          app lifecycle, window, app:// protocol, session lockdown
  window.ts        BrowserWindow options (security flags live here)
  security.ts      CSP, trusted-origin checks, safe file resolving
  ipc/handle.ts    typed IPC registrar that rejects untrusted senders
  ipc/*.ts         one file per IPC feature
  preload.ts       exposes window.aiWorkflow via contextBridge
shared/
  ipc-contract.ts  the IPC contract: channel → request/response types
src/               Angular renderer
  app/core/electron-api.ts   the only Angular code that talks to the main process
  theme/                     Angular Material theme (design tokens: VAI-201)
e2e/               Playwright tests against the real app
scripts/dev.mjs    `npm start` runner
```

## Security model

- Renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, `webSecurity: true`. Checked by unit and e2e tests.
- Production renderer is served from `app://renderer/` (custom protocol), never `file://`.
- Strict Content-Security-Policy: no inline or remote scripts; network only to our own origin.
  Company AI hosts get added explicitly (VAI-104). No external services.
- New windows are denied; navigation away from the app is blocked; all permission requests
  (mic, camera, …) are denied until a story needs one.
- Every IPC handler checks that the call comes from our own page.
- The preload exposes narrow functions only, never `ipcRenderer` itself.
- Never log transcripts, audio or keys.

## Settings and secrets

- Settings: `<userData>/settings.json`, versioned (`{ "version": 1, "data": { … } }`) and migrated
  on load (`electron/settings/migrations.ts`). Corrupt files are moved aside and defaults are used.
- Secrets (API keys): `<userData>/secrets.json`, each value encrypted with Electron `safeStorage`
  (DPAPI on Windows, Keychain on macOS). The renderer can set, check and clear them, never read them.
- `<userData>` is `%APPDATA%\AI Workflow` on Windows and `~/Library/Application Support/AI Workflow`
  on macOS.
- To change the settings shape: bump `SETTINGS_VERSION` in `electron/settings/schema.ts`, add a
  migration step, add a test. Never edit a migration that has shipped.
- Dev/test only: `AIW_USER_DATA_DIR=<dir>` uses a separate profile folder and
  `AIW_MOCK_KEYCHAIN=1` avoids macOS Keychain prompts. Both are ignored in packaged builds.

## AI servers

- Users set the speech-to-text and LLM servers in **Settings → AI servers**: base URL (OpenAI-compatible,
  usually ending in `/v1`), model and API key. "Test connection" calls `GET {baseUrl}/models`.
- All AI requests go through `electron/ai/ai-http.ts` (`AiHttpClient`) in the main process: only to the
  configured host, no redirects, key added as `Authorization: Bearer …`, never logged. The renderer
  never talks to AI servers directly. See D-009.

## Design tokens

- All colours, fonts, spacing, radii, shadows and borders live in `src/theme/_tokens.scss` and become
  `--aiw-*` CSS variables. Angular Material is pointed at them in `src/theme/_theme.scss`.
- Use the variables (and the `.aiw-*` helper classes in `src/styles.scss`), never raw colours —
  `npm test` fails on hex/rgb values outside `src/theme/` and on text pairs below 4.5:1 contrast.
- After changing tokens run `npm run tokens` to update `design/tokens.md`.

## Adding an IPC call

1. Add the channel to `IpcContract` in `shared/ipc-contract.ts` and a method to `AiWorkflowApi`.
2. Implement the handler in `electron/ipc/<feature>.ts` (keep it pure where possible + spec).
3. Register it in `registerIpc()` in `electron/main.ts` with `handle('<channel>', …)`.
4. Expose it in `electron/preload.ts`, then call it through `ElectronApi` in Angular.

Wrong channel names or payload types fail to compile on both sides.

## Troubleshooting

- **Electron starts as plain Node / no window** (often from a VS Code terminal): the shell has
  `ELECTRON_RUN_AS_NODE=1`. `npm start` and the e2e tests clear it automatically; for other
  commands run `unset ELECTRON_RUN_AS_NODE`.
- **Dependency install scripts**: npm 11 blocks them unless listed in `allowScripts` in
  `package.json`. Only `esbuild` is allowed; the others are optional native speed-ups.
