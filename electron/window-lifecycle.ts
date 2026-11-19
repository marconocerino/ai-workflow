import type { ScopedLogger } from './logging/logger';

/** The parts of BrowserWindow we use (injectable for tests). */
export interface WindowLike {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): void;
  hide(): void;
  show(): void;
  focus(): void;
  restore(): void;
  isMinimized(): boolean;
  isDestroyed(): boolean;
}

/** Started by the OS at sign-in: stay in the tray (VAI-205). */
export const HIDDEN_ARG = '--hidden';

export function startHidden(argv: readonly string[]): boolean {
  return argv.includes(HIDDEN_ARG);
}

/**
 * Close-to-tray (VAI-205): closing the window hides it; the app keeps running for dictation.
 * Real quits (tray "Quit", Cmd+Q, OS shutdown, updates) call `quitting()` first via
 * app 'before-quit', so the close goes through.
 */
export class WindowLifecycle {
  private isQuitting = false;
  private win: WindowLike | null = null;

  constructor(private readonly logger?: ScopedLogger) {}

  attach(win: WindowLike): void {
    this.win = win;
    win.on('close', (event) => {
      if (this.isQuitting) return;
      event.preventDefault();
      win.hide();
      this.logger?.info('Window closed to tray');
    });
  }

  /** Call from app 'before-quit'. */
  quitting(): void {
    if (!this.isQuitting) this.logger?.info('Quitting');
    this.isQuitting = true;
  }

  get quittingNow(): boolean {
    return this.isQuitting;
  }

  /** Show and focus the main window (tray click, second instance, dock click). */
  show(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}
