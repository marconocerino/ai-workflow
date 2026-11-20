import type { IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from '../db/test-helpers';
import type { DictationHotkey } from '../hotkey/dictation-hotkey';
import { SettingsStore } from '../settings/settings-store';
import { createIpcRegistrar } from './handle';
import { registerHotkeyIpc } from './hotkey';
import { registerSettingsIpc } from './settings';

let dir: string;
let call: (channel: string, ...args: unknown[]) => unknown;
let hotkey: {
  status: ReturnType<typeof vi.fn>;
  canUse: ReturnType<typeof vi.fn>;
  apply: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
};
let settings: SettingsStore;
let onChange: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  dir = tempDir('aiw-hotkey-');
  const handlers = new Map<string, (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown>();
  const handle = createIpcRegistrar({ handle: (c, l) => handlers.set(c, l) }, () => true);
  settings = new SettingsStore(dir, { logger: { warn: () => undefined } });
  settings.load();
  hotkey = {
    status: vi.fn(() => ({ toggleShortcut: settings.get().dictation.toggleShortcut })),
    canUse: vi.fn(() => true),
    apply: vi.fn(),
    suspend: vi.fn(),
  };
  onChange = vi.fn<() => void>();
  registerSettingsIpc(handle, settings, {} as never, onChange);
  registerHotkeyIpc(handle, hotkey as unknown as DictationHotkey, settings);
  call = (c, ...a) => handlers.get(c)!({} as IpcMainInvokeEvent, ...a);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('hotkey IPC', () => {
  it('saves a new toggle shortcut after checking no other app has it', () => {
    expect(call('hotkey:set-toggle-shortcut', ['Ctrl', 'Alt', 'K'])).toEqual({
      toggleShortcut: ['Ctrl', 'Alt', 'K'],
    });
    expect(hotkey.canUse).toHaveBeenCalledWith(['Ctrl', 'Alt', 'K']);
    expect(hotkey.apply).toHaveBeenCalled();
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
    expect(onDisk.data.dictation.toggleShortcut).toEqual(['Ctrl', 'Alt', 'K']);
  });

  it('refuses a shortcut that is taken, and keeps the old one', () => {
    hotkey.canUse.mockReturnValue(false);
    expect(() => call('hotkey:set-toggle-shortcut', ['Ctrl', 'Alt', 'K'])).toThrow(
      'Ctrl+Alt+K is already used by another app.',
    );
    expect(settings.get().dictation.toggleShortcut).toEqual(['Ctrl', 'Shift', 'Space']);
  });

  it('refuses invalid shortcuts before trying them', () => {
    for (const keys of [['Shift', 'K'], ['K'], 'Ctrl+K', ['Ctrl', 'Ctrl', 'K']]) {
      expect(() => call('hotkey:set-toggle-shortcut', keys)).toThrow(/toggleShortcut/);
    }
    expect(hotkey.canUse).not.toHaveBeenCalled();
  });

  it('suspend takes only true/false', () => {
    call('hotkey:suspend', true);
    expect(hotkey.suspend).toHaveBeenCalledWith(true);
    expect(() => call('hotkey:suspend', 'yes')).toThrow();
  });

  it('a settings change re-applies the hotkey (e.g. new mode)', () => {
    call('settings:update', { dictation: { mode: 'toggle' } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('macOS permission IPC (VAI-312)', () => {
  function setupPermissions(platform: NodeJS.Platform) {
    const handlers = new Map<string, (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown>();
    const handle = createIpcRegistrar({ handle: (c, l) => handlers.set(c, l) }, () => true);
    const recheck = vi.fn();
    const deps = {
      platform,
      openExternal: vi.fn().mockResolvedValue(undefined),
      requestAccessibility: vi.fn(),
    };
    registerHotkeyIpc(
      handle,
      { recheck, status: () => ({ holdCtrl: 'ready' }) } as unknown as DictationHotkey,
      settings,
      deps,
    );
    const invoke = (c: string, ...a: unknown[]) => handlers.get(c)!({} as IpcMainInvokeEvent, ...a);
    return { invoke, deps, recheck };
  }

  it('opens only the two fixed Privacy & Security pages', async () => {
    const { invoke, deps } = setupPermissions('darwin');
    await invoke('hotkey:open-permission-settings', 'input-monitoring');
    expect(deps.openExternal).toHaveBeenLastCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
    );
    expect(deps.requestAccessibility).not.toHaveBeenCalled();
    await invoke('hotkey:open-permission-settings', 'accessibility');
    expect(deps.openExternal).toHaveBeenLastCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    );
    expect(deps.requestAccessibility).toHaveBeenCalled(); // lists the app so there's a switch
    for (const bad of ['https://evil.example', 'toString', '__proto__', 42]) {
      await expect(invoke('hotkey:open-permission-settings', bad)).rejects.toThrow(/Unknown/);
    }
    expect(deps.openExternal).toHaveBeenCalledTimes(2);
  });

  it('refuses on other platforms', async () => {
    const { invoke, deps } = setupPermissions('win32');
    await expect(invoke('hotkey:open-permission-settings', 'accessibility')).rejects.toThrow(
      /macOS/,
    );
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it('recheck restarts the helpers and returns the new status', () => {
    const { invoke, recheck } = setupPermissions('darwin');
    expect(invoke('hotkey:recheck')).toEqual({ holdCtrl: 'ready' });
    expect(recheck).toHaveBeenCalled();
  });
});
