import type { DictationStatus } from '../tray/dictation-status';

/**
 * The app the current dictation goes to (VAI-305/308), looked up once when recording starts, so
 * the overlay chip and the cleanup style agree. Program/app name only, never a window title.
 */
export class TargetApp {
  private latest: Promise<string | null> = Promise.resolve(null);
  private readonly unsubscribe: () => void;

  constructor(
    status: DictationStatus,
    private readonly lookup: (() => Promise<string | null>) | null,
  ) {
    this.unsubscribe = status.onChange((s) => {
      if (s === 'recording') this.latest = this.ask();
    });
  }

  /** The app for the recording that started last (null if unknown or no lookup). */
  current(): Promise<string | null> {
    return this.latest;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private ask(): Promise<string | null> {
    if (!this.lookup) return Promise.resolve(null);
    return this.lookup().catch(() => null);
  }
}
