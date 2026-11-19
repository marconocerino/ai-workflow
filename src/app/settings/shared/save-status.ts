import { Injectable, signal } from '@angular/core';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The "Changes save automatically" confirmation shared by every Settings page (VAI-204).
 * Provided by the Settings layout; each page reports its saves here and the header shows them.
 */
@Injectable()
export class SaveStatus {
  readonly state = signal<SaveState>('idle');

  /** Back to "Changes save automatically" (a page was opened). */
  reset(): void {
    this.state.set('idle');
  }

  set(state: Exclude<SaveState, 'idle'>): void {
    this.state.set(state);
  }

  /** Report a save: "Saving…" while it runs, then "Saved" or the error state. Rethrows. */
  async track<T>(save: Promise<T>): Promise<T> {
    this.state.set('saving');
    try {
      const result = await save;
      this.state.set('saved');
      return result;
    } catch (e) {
      this.state.set('error');
      throw e;
    }
  }
}
