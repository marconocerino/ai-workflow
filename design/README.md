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

## Tokens

`tokens.md` (colours, fonts, spacing, radii, shadows) doesn't exist yet. It will be written with
VAI-201 (Design tokens), starting from colours sampled from these screenshots.
