import type { Recording } from '../../shared/audio';
import type { TranscriptionResult } from '../ai/transcribe';
import type { ScopedLogger } from '../logging/logger';
import type { DictationStatus } from '../tray/dictation-status';

/** Where dictated text goes. VAI-303: clipboard + notification; VAI-304: paste at the cursor. */
export interface DictationOutput {
  text(text: string): void | Promise<void>;
  /** A short user-facing message (never audio, text or keys). */
  problem(message: string): void;
}

export interface DictationPipelineDeps {
  transcribe(recording: Recording): Promise<TranscriptionResult>;
  /** AI cleanup (VAI-307) in the target app's style (VAI-308). Returns the raw text on problems. */
  refine?(text: string, app: string | null): Promise<string>;
  /** The app this recording goes to, captured when it started (VAI-308). */
  targetApp?(): Promise<string | null>;
  output: DictationOutput;
  status: DictationStatus;
  /** Is the mic still open ("Listening") after dictation? */
  micReady(): boolean;
  logger?: ScopedLogger;
}

/**
 * Finished recording → speech-to-text → AI cleanup (VAI-307) → output (VAI-303/304). Recordings are handled one at a time,
 * in order, so two quick dictations come out in the order they were spoken. While text is on
 * its way the tray shows "Transcribing" (unless a new recording has started).
 */
export class DictationPipeline {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(private readonly d: DictationPipelineDeps) {}

  /** Resolves when this recording has been handled (for tests). */
  onRecording(recording: Recording): Promise<void> {
    this.pending++;
    this.showBusy();
    // Capture now: by the time it's this recording's turn, a newer one may have started.
    const app = this.d.targetApp?.() ?? Promise.resolve(null);
    const run = this.queue.then(() => this.handle(recording, app));
    this.queue = run;
    return run;
  }

  private async handle(recording: Recording, target: Promise<string | null>): Promise<void> {
    let result: TranscriptionResult;
    try {
      result = await this.d.transcribe(recording);
    } catch {
      this.d.logger?.error('Transcription crashed');
      result = {
        kind: 'problem',
        code: 'server-error',
        message: 'Transcription failed. Try again.',
        attempts: 0,
      };
    }
    let text = result.kind === 'text' ? result.text : '';
    if (result.kind === 'text' && this.d.refine) {
      try {
        text = await this.d.refine(text, await target);
      } catch {
        this.d.logger?.error('Cleanup crashed; pasting the raw text');
      }
    }
    this.pending--;
    try {
      if (result.kind === 'text') await this.d.output.text(text);
      else if (result.kind === 'problem') this.d.output.problem(result.message);
    } catch {
      this.d.logger?.error('Could not deliver dictation result');
    }
    if (this.pending === 0 && this.d.status.get() === 'transcribing') {
      this.d.status.set(this.d.micReady() ? 'listening' : 'idle');
    }
  }

  private showBusy(): void {
    const state = this.d.status.get();
    if (state === 'idle' || state === 'listening') this.d.status.set('transcribing');
  }
}
