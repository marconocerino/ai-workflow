# Plan

<!-- Generated from docs/backlog.csv by `npm run plan`. Do not edit by hand. -->

Stories are picked in sprint order (S0, S1, …). Details and acceptance criteria live in
`docs/backlog.csv`.

## Progress

| Sprint | Stories done | Points done |
| --- | --- | --- |
| S0 | 6 / 10 | 16 / 26 |
| S1 | 13 / 14 | 46 / 48 |
| S2 | 0 / 12 | 0 / 39 |
| S3 | 0 / 5 | 0 / 24 |
| S4 | 0 / 4 | 0 / 23 |
| S5 | 0 / 8 | 0 / 39 |
| S6 | 0 / 6 | 0 / 24 |
| S7 | 0 / 5 | 0 / 13 |
| S8 | 0 / 5 | 0 / 24 |
| S9 | 0 / 9 | 0 / 35 |
| S10 | 0 / 7 | 0 / 23 |
| Backlog | 1 / 3 | 5 / 15 |
| **Total** | **20 / 88** | **67 / 333** |

## E1 Foundation

- [x] VAI-101 Project scaffold — S0 · 3 pts · Must
- [ ] VAI-102 CI pipeline — S0 · 3 pts · Must
- [x] VAI-103 AI working brief — S0 · 1 pt · Must
- [x] VAI-104 Company AI endpoint configuration — S0 · 3 pts · Must
- [x] VAI-105 Encrypted settings store — S0 · 3 pts · Must
- [x] VAI-113 AI server settings — S0 · 3 pts · Must
- [x] VAI-106 Local database and migrations — S1 · 5 pts · Must
- [x] VAI-107 Structured logging and diagnostics — S1 · 3 pts · Must
- [x] VAI-108 Windows installer and code signing — S1 · 5 pts · Must
- [ ] VAI-108b Sign with the company certificate — S1 · 2 pts · Must · Blocked
- [x] VAI-109 Feature flags — S1 · 2 pts · Should
- [ ] VAI-110 Auto-update — S2 · 3 pts · Should
- [ ] VAI-111 Crash recovery and error panel — S2 · 3 pts · Should
- [ ] VAI-112 Privacy-safe usage metrics — S6 · 3 pts · Should

## E2 Design system & shell

- [x] VAI-201 Design tokens — S0 · 3 pts · Must
- [x] VAI-202 Core components — S1 · 5 pts · Must
- [x] VAI-203 App shell and sidebar — S1 · 3 pts · Must
- [x] VAI-204 Settings screen redesign — S1 · 5 pts · Must
- [x] VAI-205 Tray icon and window behaviour — S1 · 3 pts · Should
- [ ] VAI-206 Home dashboard — S2 · 5 pts · Should
- [ ] VAI-207 Empty, loading and error states — S2 · 2 pts · Should
- [ ] VAI-208 Accessibility baseline — S2 · 3 pts · Must
- [ ] VAI-209 First-run onboarding — S2 · 5 pts · Should

## E3 Dictation

- [x] VAI-301 Hold-Ctrl global hotkey — S1 · 3 pts · Must
- [x] VAI-302 Microphone capture and device choice — S1 · 3 pts · Must
- [x] VAI-303 Transcription with Qwen3-ASR — S1 · 3 pts · Must
- [x] VAI-304 Paste at cursor — S1 · 3 pts · Must
- [x] VAI-305 Recording overlay — S1 · 3 pts · Must
- [ ] VAI-306 Live transcription preview — S2 · 5 pts · Should
- [ ] VAI-307 AI cleanup (Light and Polished) — S2 · 3 pts · Must
- [ ] VAI-308 Style per app — S2 · 3 pts · Should
- [ ] VAI-309 Custom vocabulary — S2 · 2 pts · Should
- [ ] VAI-310 Dictation history — S2 · 3 pts · Must
- [ ] VAI-311 Offline and error handling — S2 · 2 pts · Must
- [x] VAI-312 Paste at cursor and hold-to-talk on macOS (from source) — Backlog · 5 pts · Could

## E4 Meeting capture

- [ ] VAI-401 Spike: Windows system audio capture — S0 · 3 pts · Must
- [ ] VAI-402 Meeting detection — S3 · 5 pts · Must
- [ ] VAI-403 System audio helper (Windows) — S3 · 8 pts · Must
- [ ] VAI-404 Dual-channel meeting recording — S3 · 5 pts · Must
- [ ] VAI-405 Recording notice and consent — S3 · 3 pts · Must
- [ ] VAI-406 Echo handling — S4 · 5 pts · Must
- [ ] VAI-407 Live meeting transcript — S4 · 8 pts · Must
- [ ] VAI-408 Meeting storage — S4 · 5 pts · Must
- [ ] VAI-409 Meetings list and meeting page — S4 · 5 pts · Must
- [ ] VAI-410 Full re-transcription after the meeting — S5 · 3 pts · Should
- [ ] VAI-411 Manual recording and audio import — S5 · 2 pts · Could
- [ ] VAI-412 macOS system audio capture — Backlog · 5 pts · Could

## E5 Meeting intelligence

- [ ] VAI-501 Spike: speaker labelling quality — S3 · 3 pts · Must
- [ ] VAI-502 Speaker diarization — S5 · 8 pts · Must
- [ ] VAI-504 Meeting summary — S5 · 8 pts · Must
- [ ] VAI-505 Action items with owners — S5 · 5 pts · Must
- [ ] VAI-506 My notes during the meeting — S5 · 5 pts · Should
- [ ] VAI-507 Ask the meeting — S5 · 5 pts · Should
- [ ] VAI-508 Prompt evaluation set — S5 · 3 pts · Must
- [ ] VAI-503 Name speakers — S6 · 5 pts · Must
- [ ] VAI-509 Summary templates — S7 · 3 pts · Could
- [ ] VAI-510 Transcript correction pass — S7 · 3 pts · Could
- [ ] VAI-511 Share and export notes — S7 · 3 pts · Should
- [ ] VAI-512 Opt-in voiceprints — Backlog · 5 pts · Could

## E6 Microsoft 365

- [ ] VAI-601 IT request: Entra app registration — S0 · 1 pt · Must
- [ ] VAI-602 Microsoft sign-in — S6 · 5 pts · Must
- [ ] VAI-603 Calendar sync — S6 · 5 pts · Must
- [ ] VAI-604 Match recordings to calendar events — S6 · 3 pts · Must
- [ ] VAI-605 Up next and meeting brief — S6 · 3 pts · Should
- [ ] VAI-608 Invite disclosure line — S7 · 2 pts · Could
- [ ] VAI-609 People lookup — S7 · 2 pts · Could
- [ ] VAI-606 Outlook mail drafts — S8 · 3 pts · Must
- [ ] VAI-607 Free/busy and event creation — S9 · 5 pts · Should

## E7 Agent platform

- [ ] VAI-701 Spike: Qwen tool-calling reliability — S0 · 3 pts · Must
- [ ] VAI-702 Orchestrator and personas — S8 · 8 pts · Must
- [ ] VAI-703 Tool framework — S8 · 5 pts · Must
- [ ] VAI-704 Approval queue — S8 · 5 pts · Must
- [ ] VAI-705 Action log — S8 · 3 pts · Must
- [ ] VAI-706 Researcher search tool — S9 · 5 pts · Must
- [ ] VAI-707 Writer drafting tool — S9 · 3 pts · Must
- [ ] VAI-708 Scheduler tool — S9 · 5 pts · Should
- [ ] VAI-709 Thread context — S9 · 3 pts · Should
- [ ] VAI-710 Prompt-injection defences — S10 · 5 pts · Must
- [ ] VAI-711 Limits and load control — S10 · 3 pts · Should

## E8 Agent experience

- [ ] VAI-801 Agent chat threads — S9 · 3 pts · Must
- [ ] VAI-802 Chat thread view — S9 · 5 pts · Must
- [ ] VAI-803 Composer with @mentions — S9 · 3 pts · Must
- [ ] VAI-804 Approval cards — S9 · 3 pts · Must
- [ ] VAI-805 Voice routing to agents — S10 · 5 pts · Must
- [ ] VAI-806 Hand action items to agents — S10 · 3 pts · Must
- [ ] VAI-807 Agent activity feed — S10 · 2 pts · Should
- [ ] VAI-808 Notifications — S10 · 2 pts · Should
- [ ] VAI-809 Agent roster and permissions — S10 · 3 pts · Should
