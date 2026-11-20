/** Microphone capture (VAI-302). Types only, shared by main, the audio window and Settings. */

/** Main → audio window. */
export type AudioCommand =
  | { type: 'open'; deviceId: string; preRollMs: number }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'cancel' }
  | { type: 'close' };

/** Audio window → main. */
export type AudioEvent =
  | { type: 'ready' }
  | { type: 'opened'; fellBack: boolean; openMs: number }
  | { type: 'closed' }
  | { type: 'error'; reason: MicProblem }
  /** While recording, every LEVEL_INTERVAL_MS: loudness 0..1 for the overlay meter (VAI-305). */
  | { type: 'level'; level: number };

/** blocked: Windows privacy settings or a policy deny the mic · no-device: no microphone at all */
export type MicProblem = 'blocked' | 'no-device' | 'failed';

/** A finished recording: 16 kHz mono 16-bit little-endian PCM, in memory only. */
export interface Recording {
  pcm: ArrayBuffer;
  durationMs: number;
  /** Loudest sample, 0..1 (for "did we hear anything", never the content). */
  peak: number;
}

export const SAMPLE_RATE = 16_000;
/** Longest single dictation; capture stops adding audio after this (bounds memory). */
export const MAX_RECORDING_MS = 10 * 60_000;
/** Rolling buffer kept while the mic is ready, so the first word isn't clipped. */
export const PRE_ROLL_MS = 500;
/** How often the level meter updates while recording (20 per second). */
export const LEVEL_INTERVAL_MS = 50;

/** RMS of 16-bit samples → 0..1 on a −60…0 dBFS scale (how loud it looks on a meter). */
export function levelOf(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms / 32768);
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

/** For Settings and the tray. */
export interface MicStatus {
  state: 'closed' | 'ready' | 'recording';
  /** The chosen device wasn't found; System default is used. */
  usingDefaultInstead: boolean;
  problem?: MicProblem;
}
