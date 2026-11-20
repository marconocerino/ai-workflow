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
  | { type: 'error'; reason: MicProblem };

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

/** For Settings and the tray. */
export interface MicStatus {
  state: 'closed' | 'ready' | 'recording';
  /** The chosen device wasn't found; System default is used. */
  usingDefaultInstead: boolean;
  problem?: MicProblem;
}
