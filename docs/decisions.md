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
