import type { HotkeyStatus, PasteStatus } from '../../shared/ipc-contract';
import type { DictationMode } from '../../shared/settings';
import type { ScopedLogger } from '../logging/logger';
import type { DictationStatus } from '../tray/dictation-status';
import { CtrlHold, type Timers } from './ctrl-hold';
import type { KeyListener } from './key-listener';

/** The parts of Electron's globalShortcut we use (injectable for tests). */
export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

/** What recording does with start/stop/cancel (VAI-302 plugs the recorder in here). */
export interface DictationEvents {
  start(source: 'hold' | 'toggle'): void;
  stop(): void;
  cancel(): void;
  /** Ctrl went down cleanly — dictation may start in 120 ms (open the mic early). */
  prepare?(): void;
  /** It was a shortcut after all. */
  abandon?(): void;
}

export interface DictationHotkeyDeps {
  shortcuts: ShortcutApi;
  /** null where there's no Ctrl watcher (helper not built, Linux). */
  listener: KeyListener | null;
  /** How text gets out, for the status (VAI-304/312). Default: clipboard only. */
  paste?(): PasteStatus;
  status: DictationStatus;
  events?: DictationEvents;
  config(): { mode: DictationMode; toggleShortcut: string[] };
  logger?: ScopedLogger;
  timers?: Timers;
}

/** ['Ctrl', 'Shift', 'Space'] → 'Control+Shift+Space' (Electron accelerator). */
export function toAccelerator(keys: readonly string[]): string {
  const names: Record<string, string> = { Ctrl: 'Control', Meta: 'Super' };
  return keys.map((k) => names[k] ?? k).join('+');
}

/**
 * Starts and stops dictation from the keyboard (VAI-301, D-019).
 * - Hold mode: Hold-Ctrl via the watcher. If the watcher can't run, the toggle shortcut works
 *   instead (fallback).
 * - Toggle mode: the toggle shortcut starts and stops; Esc cancels (only taken while recording).
 */
export class DictationHotkey {
  private recording: 'hold' | 'toggle' | null = null;
  private registered: string | null = null;
  private escRegistered = false;
  private toggleError: string | null = null;
  private suspended = false;
  private holdAvailable = false;
  private readonly hold: CtrlHold;

  constructor(private readonly d: DictationHotkeyDeps) {
    this.hold = new CtrlHold(
      {
        start: () => this.begin('hold'),
        stop: () => this.end('stop'),
        cancel: () => this.end('cancel'),
        prepare: () => this.d.events?.prepare?.(),
        abandon: () => this.d.events?.abandon?.(),
      },
      d.timers,
    );
  }

  /** How the current recording was started, or null (the overlay's "Esc to cancel"). */
  get recordingSource(): 'hold' | 'toggle' | null {
    return this.recording;
  }

  /** Called by the watcher for each key event (hold mode only). */
  keyEvent(event: Parameters<CtrlHold['handle']>[0]): void {
    if (this.d.config().mode !== 'hold' || this.suspended) return;
    if (this.recording === 'toggle') return;
    this.hold.handle(event);
  }

  /** Watcher became ready or unavailable. */
  holdAvailability(available: boolean): void {
    this.holdAvailable = available;
    if (!available) this.hold.reset();
    this.apply();
  }

  /** (Re)apply the current settings: start/stop the watcher, (un)register the toggle shortcut. */
  apply(): void {
    const { mode } = this.d.config();
    if (mode === 'hold' && this.d.listener) this.d.listener.start();
    if (mode === 'toggle' && this.d.listener) {
      this.d.listener.stop();
      this.hold.reset();
    }
    const wantToggle = !this.suspended && (mode === 'toggle' || !this.holdAvailable);
    this.registerToggle(wantToggle);
  }

  /** Pause global shortcuts while Settings records a new one. */
  suspend(on: boolean): void {
    this.suspended = on;
    this.apply();
  }

  /** Can this shortcut be registered (not taken by another app)? Leaves ours as it was. */
  canUse(keys: readonly string[]): boolean {
    const accel = toAccelerator(keys);
    if (accel === this.registered) return true;
    const ok = this.d.shortcuts.register(accel, () => undefined);
    if (ok) this.d.shortcuts.unregister(accel);
    return ok;
  }

  status(): HotkeyStatus {
    const { mode, toggleShortcut } = this.d.config();
    return {
      mode,
      holdCtrl: !this.d.listener
        ? 'unsupported'
        : this.holdAvailable
          ? 'ready'
          : this.d.listener.needsPermission
            ? 'no-permission'
            : 'unavailable',
      paste: this.d.paste?.() ?? 'clipboard-only',
      toggleShortcut,
      toggleActive: this.registered !== null,
      ...(this.toggleError ? { toggleError: this.toggleError } : {}),
    };
  }

  /** "Check again" after granting a permission (macOS): restart the watcher in hold mode. */
  recheck(): void {
    if (this.d.config().mode === 'hold') this.d.listener?.recheck();
    this.apply();
  }

  dispose(): void {
    this.d.listener?.stop();
    this.registerToggle(false);
    this.setEsc(false);
  }

  private registerToggle(want: boolean): void {
    const accel = toAccelerator(this.d.config().toggleShortcut);
    if (this.registered && (!want || this.registered !== accel)) {
      this.d.shortcuts.unregister(this.registered);
      this.registered = null;
    }
    if (!want || this.registered) {
      if (!want) this.toggleError = null;
      return;
    }
    if (this.d.shortcuts.register(accel, () => this.toggle())) {
      this.registered = accel;
      this.toggleError = null;
    } else {
      this.toggleError = `${this.d.config().toggleShortcut.join('+')} is already used by another app.`;
      this.d.logger?.warn('Toggle shortcut is taken by another app', { shortcut: accel });
    }
  }

  private toggle(): void {
    if (this.recording === 'toggle') this.end('stop');
    else if (!this.recording) this.begin('toggle');
  }

  private begin(source: 'hold' | 'toggle'): void {
    this.recording = source;
    this.d.status.set('recording');
    if (source === 'toggle') this.setEsc(true);
    this.d.logger?.info('Dictation started', { source });
    this.d.events?.start(source);
  }

  private end(how: 'stop' | 'cancel'): void {
    if (!this.recording) return;
    this.setEsc(false);
    this.recording = null;
    this.d.status.set('idle');
    this.d.logger?.info(how === 'stop' ? 'Dictation stopped' : 'Dictation cancelled');
    if (how === 'stop') this.d.events?.stop();
    else this.d.events?.cancel();
  }

  /** Esc cancels a toggle recording; only taken from other apps while recording. */
  private setEsc(on: boolean): void {
    if (on && !this.escRegistered) {
      this.escRegistered = this.d.shortcuts.register('Escape', () => this.end('cancel'));
    } else if (!on && this.escRegistered) {
      this.d.shortcuts.unregister('Escape');
      this.escRegistered = false;
    }
  }
}
