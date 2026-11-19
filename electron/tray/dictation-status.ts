/** What dictation is doing (VAI-205). Set by the hotkey and recorder (VAI-301/302). */
export type DictationState = 'idle' | 'listening' | 'recording';

export const DICTATION_STATES: readonly DictationState[] = ['idle', 'listening', 'recording'];

/** Tiny observable for the main process; the tray (and later the overlay) follow it. */
export class DictationStatus {
  private state: DictationState = 'idle';
  private readonly listeners = new Set<(state: DictationState) => void>();

  get(): DictationState {
    return this.state;
  }

  set(state: DictationState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  onChange(listener: (state: DictationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
