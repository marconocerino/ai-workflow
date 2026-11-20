import {
  type AudioCommand,
  type AudioEvent,
  MAX_RECORDING_MS,
  type MicStatus,
  PRE_ROLL_MS,
  type Recording,
  SAMPLE_RATE,
} from '../../shared/audio';
import type { KeepMicReadySeconds } from '../../shared/settings';
import type { DictationEvents } from '../hotkey/dictation-hotkey';
import type { ScopedLogger } from '../logging/logger';
import type { DictationStatus } from '../tray/dictation-status';

export interface AudioControllerDeps {
  /** Send a command to the hidden audio window. */
  send(command: AudioCommand): void;
  config(): { micDeviceId: string; keepMicReadySeconds: KeepMicReadySeconds };
  status: DictationStatus;
  /** What to do with a finished recording (VAI-303: transcribe). Default: drop it. */
  onRecording?(recording: Recording): void;
  logger?: ScopedLogger;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

type MicState = 'closed' | 'ready' | 'recording';

/**
 * The microphone, driven by the hotkey (VAI-302, D-020). The audio itself lives in the hidden
 * audio window; this keeps the state:
 * - Ctrl pressed cleanly → open the mic early (prepare); a shortcut after all → close again.
 * - start → record (the pre-roll buffer becomes the start of the recording).
 * - stop/cancel → keep the mic ready for N seconds ("Listening"), then close and clear it.
 * Audio is never written to disk or logged — only its length and level.
 */
export class AudioController implements DictationEvents {
  private state: MicState = 'closed';
  private preparedOnly = false;
  private warmTimer: unknown = null;
  private problem: MicStatus['problem'];
  private usingDefaultInstead = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(private readonly d: AudioControllerDeps) {
    this.setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  status(): MicStatus {
    return {
      state: this.state,
      usingDefaultInstead: this.usingDefaultInstead,
      ...(this.problem ? { problem: this.problem } : {}),
    };
  }

  /** Ctrl went down cleanly: open the mic now so a cold start doesn't clip the first word. */
  prepare(): void {
    if (this.state !== 'closed') return;
    this.open();
    this.preparedOnly = true;
  }

  /** It was a shortcut (Ctrl+C …): close a mic opened only for this press. */
  abandon(): void {
    if (this.state === 'ready' && this.preparedOnly) this.close();
  }

  start(): void {
    this.cancelWarm();
    if (this.state === 'closed') this.open();
    this.preparedOnly = false;
    this.state = 'recording';
    this.d.send({ type: 'start' });
  }

  stop(): void {
    if (this.state !== 'recording') return;
    this.d.send({ type: 'stop' });
    this.afterDictation();
  }

  cancel(): void {
    if (this.state !== 'recording') return;
    this.d.send({ type: 'cancel' });
    this.afterDictation();
  }

  /** Events from the audio window. */
  onEvent(event: AudioEvent): void {
    if (event.type === 'opened') {
      this.d.logger?.info('Microphone opened', { openMs: event.openMs, fellBack: event.fellBack });
      this.problem = undefined;
      this.usingDefaultInstead = event.fellBack;
      if (event.fellBack) this.d.logger?.warn('Chosen microphone not found; using System default');
    } else if (event.type === 'error') {
      this.problem = event.reason;
      this.d.logger?.error('Microphone could not be opened', { reason: event.reason });
      this.reset();
    } else if (event.type === 'closed' && this.state !== 'closed') {
      this.reset();
    }
  }

  /** A finished recording from the audio window. Validated; never logged or stored. */
  onRecording(raw: unknown): void {
    const r = raw as Partial<Recording> | null;
    const pcm = r?.pcm;
    const maxBytes = ((MAX_RECORDING_MS + PRE_ROLL_MS) / 1000) * SAMPLE_RATE * 2;
    if (
      !(pcm instanceof ArrayBuffer) ||
      pcm.byteLength % 2 !== 0 ||
      pcm.byteLength > maxBytes ||
      typeof r?.peak !== 'number'
    ) {
      this.d.logger?.warn('Ignored an invalid recording from the audio window');
      return;
    }
    const recording: Recording = {
      pcm,
      durationMs: Math.round((pcm.byteLength / 2 / SAMPLE_RATE) * 1000),
      peak: Math.min(Math.max(r.peak, 0), 1),
    };
    this.d.logger?.info('Recording finished', {
      durationMs: recording.durationMs,
      peakDb: recording.peak > 0 ? Math.round(20 * Math.log10(recording.peak)) : -100,
    });
    this.d.onRecording?.(recording);
  }

  /** Settings changed (device or keep-ready time): reopen on next use. */
  configChanged(): void {
    if (this.state === 'ready') this.close();
  }

  dispose(): void {
    this.cancelWarm();
    if (this.state !== 'closed') this.d.send({ type: 'close' });
    this.state = 'closed';
  }

  private open(): void {
    const { micDeviceId } = this.d.config();
    this.state = 'ready';
    this.d.send({ type: 'open', deviceId: micDeviceId, preRollMs: PRE_ROLL_MS });
  }

  private afterDictation(): void {
    const seconds = this.d.config().keepMicReadySeconds;
    if (seconds > 0 && !this.problem) {
      this.state = 'ready';
      this.preparedOnly = false;
      this.d.status.set('listening');
      this.warmTimer = this.setTimer(() => {
        this.warmTimer = null;
        this.close();
      }, seconds * 1000);
    } else {
      this.close();
    }
  }

  private close(): void {
    this.cancelWarm();
    this.d.send({ type: 'close' }); // the audio window also clears its pre-roll buffer
    this.state = 'closed';
    this.preparedOnly = false;
    if (this.d.status.get() === 'listening') this.d.status.set('idle');
  }

  private reset(): void {
    this.cancelWarm();
    this.state = 'closed';
    this.preparedOnly = false;
    if (this.d.status.get() !== 'idle') this.d.status.set('idle');
  }

  private cancelWarm(): void {
    if (this.warmTimer !== null) this.clearTimer(this.warmTimer);
    this.warmTimer = null;
  }
}
