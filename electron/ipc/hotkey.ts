import type { DictationHotkey } from '../hotkey/dictation-hotkey';
import { applyPatch } from '../settings/schema';
import type { SettingsStore } from '../settings/settings-store';
import type { createIpcRegistrar } from './handle';

type Handle = ReturnType<typeof createIpcRegistrar>;

export class ShortcutTakenError extends Error {
  constructor(keys: readonly string[]) {
    super(`${keys.join('+')} is already used by another app. Choose another shortcut.`);
    this.name = 'ShortcutTakenError';
  }
}

/** Hotkey channels (VAI-301). */
export function registerHotkeyIpc(
  handle: Handle,
  hotkey: DictationHotkey,
  settings: SettingsStore,
): void {
  handle('hotkey:status', () => hotkey.status());

  handle('hotkey:set-toggle-shortcut', (_event, keys) => {
    const patch = { dictation: { toggleShortcut: keys } };
    // Validate first (throws with the field name), then check no other app has it.
    const next = applyPatch(settings.get(), patch);
    if (!hotkey.canUse(next.dictation.toggleShortcut)) {
      throw new ShortcutTakenError(next.dictation.toggleShortcut);
    }
    settings.update(patch);
    hotkey.apply();
    return hotkey.status();
  });

  handle('hotkey:suspend', (_event, on) => {
    if (typeof on !== 'boolean') throw new Error('suspend must be true or false.');
    hotkey.suspend(on);
  });
}
