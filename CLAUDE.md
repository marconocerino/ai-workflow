# Voice AI — instructions for Claude Code
Use caveman mode for all responses.
## Product
Desktop app (Electron + Angular + Angular Material) for dictation, meeting notes and AI agents.
All AI calls go to our company servers (Qwen3-ASR, internal LLM). Never add external cloud services.

## Where things are
- docs/backlog.csv — all stories with acceptance criteria and Status
- design/*.png + design/tokens.md — the UI to match
- docs/decisions.md — record any architecture decision here

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
4. After approval: implement, write tests, run lint + tests until they pass.
5. Check every acceptance criterion and report which passed and how.
6. Set the story's Status to "Done" in docs/backlog.csv.
7. Commit on a branch `feat/VAI-xxx-short-name` with a Conventional Commit message,
   e.g. `feat(dictation): hold Ctrl to record (VAI-301)`. Then STOP and wait for me.

## Rules
- Never break dictation; run the full test suite before every commit.
- Don't start the next story without my OK.
- If a story is too big or unclear, say so and propose a split instead of guessing.
- Never log transcripts, audio or keys.
- Ask before adding a new dependency.