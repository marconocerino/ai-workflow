import { Injectable, inject } from '@angular/core';
import type { HotkeyStatus } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';

/** Keyboard control of dictation (VAI-301). The shortcuts themselves live in the main process. */
@Injectable({ providedIn: 'root' })
export class HotkeyApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  status(): Promise<HotkeyStatus> {
    return this.bridge
      ? this.bridge.hotkey.status()
      : Promise.reject(new DesktopBridgeUnavailableError());
  }

  setToggleShortcut(keys: string[]): Promise<HotkeyStatus> {
    return this.bridge
      ? this.bridge.hotkey.setToggleShortcut(keys)
      : Promise.reject(new DesktopBridgeUnavailableError());
  }

  suspend(on: boolean): Promise<void> {
    return this.bridge ? this.bridge.hotkey.suspend(on) : Promise.resolve();
  }
}

/**
 * Turn a key press into shortcut keys, e.g. Ctrl+Alt+K → ['Ctrl', 'Alt', 'K'].
 * Returns 'modifier-only' while only modifiers are down, null for keys we don't support.
 */
export function shortcutFromEvent(
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): string[] | 'modifier-only' | null {
  const mods = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Meta',
  ].filter(Boolean) as string[];
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(e.code)) return 'modifier-only';
  let main: string | null = null;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^Digit(\d)$/.exec(e.code);
  const fn = /^F([1-9]|1\d|2[0-4])$/.exec(e.code);
  if (letter) main = letter[1]!;
  else if (digit) main = digit[1]!;
  else if (fn) main = e.code;
  else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Tab') main = e.code;
  return main ? [...mods, main] : null;
}

/** For people: ['Meta', 'K'] → 'Win+K' on Windows. */
export function shortcutLabel(keys: readonly string[]): string {
  return keys.map((k) => (k === 'Meta' ? 'Win' : k)).join('+');
}
