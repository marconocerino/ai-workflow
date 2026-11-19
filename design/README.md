# Design

Screenshots of the target UI. They still say "Voice AI"; the product name is **AI Workflow**.

## Screens we have

| Screenshot                      | What it shows                                                    | Stories                                         |
| ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `Sidebar component@1x.png`      | Workspace sidebar: nav, Ctrl hint, agent roster, company-AI note | VAI-203, VAI-809                                |
| `Settings@1x.png`               | Settings → Dictation: shortcut, microphone, startup              | VAI-204, VAI-301, VAI-302, VAI-205              |
| `Dictation overlay@1x.png`      | Recording overlay with live text; agent-name voice routing       | VAI-305, VAI-306, VAI-308, VAI-805              |
| `Meeting notes@1x.png`          | Meeting page: summary, action items, transcript, ask the meeting | VAI-409, VAI-504, VAI-505, VAI-507, VAI-806     |
| `Agent chat@1x.png`             | Agent chat threads, thread view, approval cards, composer        | VAI-801, VAI-802, VAI-803, VAI-804              |

Notes on what's built:

- **Tray (VAI-205):** placeholder icons drawn in code from the logo's waveform bars (grey idle,
  green listening, green + red dot recording). The app still has no app icon (Electron default).
- **Settings (VAI-204):** sidebar and Dictation page match the design, with two differences.
  An "AI servers" section sits after Transcription (D-009), and the status card says "Not active
  yet" until the hotkey exists (VAI-301). Dictation's Microphone and Startup sections arrive with
  VAI-302 and VAI-205. Transcription, AI cleanup, Vocabulary and Style per app show a "Coming
  soon" page until their stories (design still missing). About & diagnostics is built from the
  UI kit (no design).
- **Sidebar (VAI-203):** matches the design. Meetings, Agent chats and the "Your agents" roster
  appear only when their feature flags are on (VAI-109). Agent status is "Idle" for every agent
  and the unread badge is hidden until the agent runtime exists (VAI-801+). The Ctrl hint is shown
  before the hotkey works (VAI-301). Meetings, Agent chats and Dictations are placeholder pages.

## Screens still missing

Stories that need a design before they can be matched. Ask design for these before the sprint
they're in.

| Missing screen                     | Stories          | Sprint |
| ---------------------------------- | ---------------- | ------ |
| Home dashboard                     | VAI-206          | S2     |
| Empty, loading and error states    | VAI-207          | S2     |
| First-run onboarding               | VAI-209          | S2     |
| Dictation history                  | VAI-310          | S2     |
| Recording notice and consent       | VAI-405          | S3     |
| Meetings list                      | VAI-409          | S4     |
| Name speakers                      | VAI-503          | S6     |
| Other Settings pages (AI cleanup, vocabulary, style per app, about & diagnostics) | VAI-204, VAI-307–309 | S1–S2 |
| Agent roster and permissions       | VAI-809          | S10    |
| Tray icon (idle, listening, recording) and app icon | VAI-205, VAI-108 | S1 |

## Tokens

See `tokens.md` (generated from `src/theme/_tokens.scss` by `npm run tokens`).
