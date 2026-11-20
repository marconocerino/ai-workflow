import type { PermissionPane } from '../../shared/ipc-contract';
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

/** macOS Privacy & Security pages (fixed; the renderer only names one). */
export const PERMISSION_PANES: Record<PermissionPane, string> = {
  'input-monitoring': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};

export interface PermissionDeps {
  platform: NodeJS.Platform;
  openExternal(url: string): Promise<void>;
  /** Accessibility: ask macOS to list the app (shows its prompt once). */
  requestAccessibility(): void;
}

/** Hotkey channels (VAI-301; permissions VAI-312). */
export function registerHotkeyIpc(
  handle: Handle,
  hotkey: DictationHotkey,
  settings: SettingsStore,
  permissions?: PermissionDeps,
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

  handle('hotkey:recheck', () => {
    hotkey.recheck();
    return hotkey.status();
  });

  handle('hotkey:open-permission-settings', async (_event, pane) => {
    if (permissions?.platform !== 'darwin') throw new Error('Only on macOS.');
    if (typeof pane !== 'string' || !Object.hasOwn(PERMISSION_PANES, pane)) {
      throw new Error('Unknown settings page.');
    }
    if (pane === 'accessibility') permissions.requestAccessibility();
    await permissions.openExternal(PERMISSION_PANES[pane]);
  });
}
