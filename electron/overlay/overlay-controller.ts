import { HIDDEN_OVERLAY, type OverlayState } from '../../shared/overlay';
import type { ScopedLogger } from '../logging/logger';
import type { DictationState, DictationStatus } from '../tray/dictation-status';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The overlay window, as the controller sees it (Electron in main, a fake in tests). */
export interface OverlayWindow {
  /** Move and show without taking focus. */
  show(bounds: Rect): void;
  hide(): void;
  send(state: OverlayState): void;
}

export interface OverlayDeps {
  window: OverlayWindow;
  status: DictationStatus;
  /** Work area (screen minus taskbar/Dock) of the display under the mouse pointer. */
  workArea(): Rect;
  /** How the current recording was started (toggle shows "Esc to cancel"). */
  source(): 'hold' | 'toggle' | null;
  /** Name of the app in front, e.g. "Outlook"; null if unknown. */
  frontApp?(): Promise<string | null>;
  logger?: ScopedLogger;
  now?(): number;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

/** Window size: the bar plus room for its offset shadow. */
export const OVERLAY_SIZE = { width: 600, height: 92 };
const BOTTOM_MARGIN = 24;
/** After "stop", the recording reaches speech-to-text within milliseconds; give up after this. */
export const AWAIT_TEXT_MS = 3_000;

/** Bottom-centre of the work area, above the taskbar or Dock. */
export function overlayBounds(workArea: Rect, size = OVERLAY_SIZE): Rect {
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + workArea.height - size.height - BOTTOM_MARGIN),
    width: size.width,
    height: size.height,
  };
}

/**
 * The floating dictation bar (VAI-305): follows DictationStatus — shown (without focus) while
 * recording and transcribing, hidden otherwise. The window is created at startup, so showing it
 * is only a move + show (well under the 100 ms target). Logs timings only.
 */
export class OverlayController {
  private state: OverlayState = HIDDEN_OVERLAY;
  private session = 0;
  private lastShowMs: number | null = null;
  /** Loudest level of the current recording (tests/diagnostics; a number, never audio). */
  private peakLevel = 0;
  /** Stopped; waiting for the pipeline to say "transcribing" (status passes idle meanwhile). */
  private awaitingText = false;
  private awaitTimer: unknown = null;
  private pendingHide = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly unsubscribe: () => void;

  constructor(private readonly d: OverlayDeps) {
    this.now = d.now ?? (() => performance.now());
    this.setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = d.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.unsubscribe = d.status.onChange((s) => this.onStatus(s));
  }

  current(): OverlayState {
    return this.state;
  }

  /** Loudness from the audio window (20 per second while recording). */
  level(level: unknown): void {
    if (this.state.phase !== 'recording' || typeof level !== 'number' || !Number.isFinite(level)) {
      return;
    }
    const clamped = Math.min(1, Math.max(0, level));
    this.peakLevel = Math.max(this.peakLevel, clamped);
    this.update({ level: clamped });
  }

  /**
   * The hotkey ended the recording. Call before the recorder is told (the status goes idle
   * first): "stop" → "Transcribing…" right away, no flicker; "cancel" → hide.
   */
  ended(how: 'stop' | 'cancel'): void {
    this.pendingHide = false;
    if (this.state.phase !== 'recording') return;
    if (how === 'cancel') {
      this.hide();
      return;
    }
    this.update({ phase: 'transcribing', level: 0, hint: null });
    this.awaitingText = true;
    this.awaitTimer = this.setTimer(() => {
      this.awaitTimer = null;
      if (this.awaitingText) this.hide();
    }, AWAIT_TEXT_MS);
  }

  /** For tests and diagnostics: what's shown and how fast it appeared. */
  describe(): {
    phase: OverlayState['phase'];
    app: string | null;
    showMs: number | null;
    peakLevel: number;
  } {
    return {
      phase: this.state.phase,
      app: this.state.app,
      showMs: this.lastShowMs,
      peakLevel: this.peakLevel,
    };
  }

  dispose(): void {
    this.stopAwaiting();
    this.unsubscribe();
  }

  private onStatus(status: DictationState): void {
    if (status === 'recording') {
      this.stopAwaiting();
      this.startRecording();
    } else if (status === 'transcribing') {
      this.stopAwaiting();
      this.showTranscribing();
    } else if (!this.awaitingText && this.state.phase !== 'hidden') {
      // Idle/Listening: hide — unless the hotkey says "stop" in this same tick (see ended()).
      this.pendingHide = true;
      queueMicrotask(() => {
        if (this.pendingHide) this.hide();
      });
    }
  }

  private stopAwaiting(): void {
    this.awaitingText = false;
    if (this.awaitTimer !== null) this.clearTimer(this.awaitTimer);
    this.awaitTimer = null;
  }

  private startRecording(): void {
    const started = this.now();
    const session = ++this.session;
    this.peakLevel = 0;
    const wasHidden = this.state.phase === 'hidden';
    this.state = {
      phase: 'recording',
      level: 0,
      app: null,
      hint: this.d.source() === 'toggle' ? 'Esc to cancel' : null,
    };
    this.d.window.send(this.state);
    if (wasHidden) this.d.window.show(overlayBounds(this.d.workArea()));
    this.lastShowMs = Math.round(this.now() - started);
    this.d.logger?.debug('Overlay shown', { ms: this.lastShowMs });
    void this.d
      .frontApp?.()
      .then((app) => {
        if (session === this.session && this.state.phase !== 'hidden' && app) this.update({ app });
      })
      .catch(() => undefined);
  }

  private showTranscribing(): void {
    const wasHidden = this.state.phase === 'hidden';
    this.update({ phase: 'transcribing', level: 0, hint: null });
    if (wasHidden) this.d.window.show(overlayBounds(this.d.workArea()));
  }

  private hide(): void {
    this.pendingHide = false;
    this.stopAwaiting();
    this.session++;
    this.state = HIDDEN_OVERLAY;
    this.d.window.send(this.state);
    this.d.window.hide();
  }

  private update(patch: Partial<OverlayState>): void {
    this.state = { ...this.state, ...patch };
    this.d.window.send(this.state);
  }
}
