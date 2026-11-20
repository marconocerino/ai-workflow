/** Events from the Ctrl watcher (see native/win-key-listener/main.c). */
export type KeyEvent = 'CTRL_DOWN_CLEAN' | 'CTRL_DOWN_DIRTY' | 'CTRL_UP' | 'OTHER';

export const HOLD_MS = 120;

export interface CtrlHoldHandlers {
  start(): void;
  stop(): void;
  cancel(): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

type State = 'idle' | 'pending' | 'active' | 'blocked';

/**
 * Hold-Ctrl logic (VAI-301). Ctrl pressed on its own and held for 120 ms starts; releasing
 * stops. Any other key, click or scroll before 120 ms means it was a shortcut (Ctrl+C …): nothing
 * happens. After 120 ms it cancels the recording. Keys are never blocked, only observed.
 */
export class CtrlHold {
  private state: State = 'idle';
  private timer: unknown = null;

  constructor(
    private readonly handlers: CtrlHoldHandlers,
    private readonly timers: Timers = realTimers,
    private readonly holdMs = HOLD_MS,
  ) {}

  get current(): State {
    return this.state;
  }

  handle(event: KeyEvent): void {
    switch (this.state) {
      case 'idle':
        if (event === 'CTRL_DOWN_CLEAN') {
          this.state = 'pending';
          this.timer = this.timers.set(() => this.elapsed(), this.holdMs);
        } else if (event === 'CTRL_DOWN_DIRTY') {
          this.state = 'blocked';
        }
        break;
      case 'pending':
        if (event === 'OTHER') {
          this.clearTimer();
          this.state = 'blocked';
        } else if (event === 'CTRL_UP') {
          this.clearTimer();
          this.state = 'idle';
        }
        break;
      case 'active':
        if (event === 'OTHER') {
          this.state = 'blocked';
          this.handlers.cancel();
        } else if (event === 'CTRL_UP') {
          this.state = 'idle';
          this.handlers.stop();
        }
        break;
      case 'blocked':
        if (event === 'CTRL_UP') this.state = 'idle';
        break;
    }
  }

  /** The watcher stopped (crash/quit): drop any recording in progress. */
  reset(): void {
    this.clearTimer();
    if (this.state === 'active') this.handlers.cancel();
    this.state = 'idle';
  }

  private elapsed(): void {
    this.timer = null;
    if (this.state !== 'pending') return;
    this.state = 'active';
    this.handlers.start();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}

/** Parse one line from the watcher; anything unexpected is ignored. */
export function parseKeyEvent(line: string): KeyEvent | 'READY' | null {
  switch (line.trim()) {
    case 'READY':
      return 'READY';
    case 'CTRL_DOWN clean':
      return 'CTRL_DOWN_CLEAN';
    case 'CTRL_DOWN dirty':
      return 'CTRL_DOWN_DIRTY';
    case 'CTRL_UP':
      return 'CTRL_UP';
    case 'OTHER':
      return 'OTHER';
    default:
      return null;
  }
}
