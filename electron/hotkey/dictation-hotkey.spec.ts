import { describe, expect, it, vi } from 'vitest';
import type { DictationMode } from '../../shared/settings';
import { DictationStatus } from '../tray/dictation-status';
import type { Timers } from './ctrl-hold';
import { DictationHotkey, toAccelerator } from './dictation-hotkey';
import type { KeyListener } from './key-listener';

function setup(opts: { mode?: DictationMode; taken?: string[]; listener?: boolean } = {}) {
  const config = { mode: opts.mode ?? 'hold', toggleShortcut: ['Ctrl', 'Shift', 'Space'] };
  const callbacks = new Map<string, () => void>();
  const shortcuts = {
    register: vi.fn((accel: string, cb: () => void) => {
      if (opts.taken?.includes(accel) || callbacks.has(accel)) return false;
      callbacks.set(accel, cb);
      return true;
    }),
    unregister: vi.fn((accel: string) => callbacks.delete(accel)),
  };
  const listener = { start: vi.fn(), stop: vi.fn() } as unknown as KeyListener;
  const timers: { fn: () => void }[] = [];
  const fakeTimers: Timers = { set: (fn) => timers.push({ fn }), clear: () => undefined };
  const events = { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
  const status = new DictationStatus();
  const hotkey = new DictationHotkey({
    shortcuts,
    listener: opts.listener === false ? null : listener,
    status,
    events,
    config: () => config,
    timers: fakeTimers,
  });
  const press = (accel: string) => callbacks.get(accel)!();
  const elapse = () => timers.splice(0).forEach((t) => t.fn());
  return { hotkey, config, shortcuts, callbacks, listener, events, status, press, elapse };
}

describe('DictationHotkey', () => {
  it('hold mode with a working watcher: Hold-Ctrl drives recording; no toggle shortcut', () => {
    const { hotkey, callbacks, status, events, elapse, listener } = setup();
    hotkey.apply();
    hotkey.holdAvailability(true);
    expect(listener.start).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
    expect(hotkey.status()).toMatchObject({ holdCtrl: 'ready', toggleActive: false });

    hotkey.keyEvent('CTRL_DOWN_CLEAN');
    elapse();
    expect(status.get()).toBe('recording');
    expect(events.start).toHaveBeenCalledWith('hold');
    hotkey.keyEvent('CTRL_UP');
    expect(status.get()).toBe('idle');
    expect(events.stop).toHaveBeenCalled();
  });

  it('fallback: when the watcher fails, the toggle shortcut works', () => {
    const { hotkey, callbacks, status, events, press } = setup();
    hotkey.apply();
    hotkey.holdAvailability(true);
    hotkey.holdAvailability(false);
    expect([...callbacks.keys()]).toEqual(['Control+Shift+Space']);
    expect(hotkey.status()).toMatchObject({ holdCtrl: 'unavailable', toggleActive: true });
    press('Control+Shift+Space');
    expect(status.get()).toBe('recording');
    expect(events.start).toHaveBeenCalledWith('toggle');
    press('Control+Shift+Space');
    expect(status.get()).toBe('idle');
    // Watcher back → toggle released again.
    hotkey.holdAvailability(true);
    expect(callbacks.size).toBe(0);
  });

  it('a watcher crash while recording cancels it', () => {
    const { hotkey, events, elapse, status } = setup();
    hotkey.apply();
    hotkey.holdAvailability(true);
    hotkey.keyEvent('CTRL_DOWN_CLEAN');
    elapse();
    hotkey.holdAvailability(false);
    expect(events.cancel).toHaveBeenCalled();
    expect(status.get()).toBe('idle');
  });

  it('toggle mode: shortcut starts/stops, Esc cancels and is only taken while recording', () => {
    const { hotkey, callbacks, events, press, listener, config } = setup({ mode: 'toggle' });
    hotkey.apply();
    expect(listener.stop).toHaveBeenCalled();
    expect(callbacks.has('Escape')).toBe(false);
    press('Control+Shift+Space');
    expect(callbacks.has('Escape')).toBe(true);
    press('Escape');
    expect(events.cancel).toHaveBeenCalled();
    expect(callbacks.has('Escape')).toBe(false);
    // Hold-Ctrl events are ignored in toggle mode.
    hotkey.keyEvent('CTRL_DOWN_CLEAN');
    expect(events.start).toHaveBeenCalledTimes(1);
    // Switching back to hold releases the toggle shortcut once the watcher is ready.
    config.mode = 'hold';
    hotkey.holdAvailability(true);
    expect(callbacks.size).toBe(0);
  });

  it('reports a toggle shortcut taken by another app', () => {
    const { hotkey } = setup({ mode: 'toggle', taken: ['Control+Shift+Space'] });
    hotkey.apply();
    expect(hotkey.status()).toMatchObject({
      toggleActive: false,
      toggleError: 'Ctrl+Shift+Space is already used by another app.',
    });
  });

  it('canUse() tests a shortcut without keeping it', () => {
    const { hotkey, callbacks } = setup({ taken: ['Control+Alt+K'] });
    expect(hotkey.canUse(['Ctrl', 'Alt', 'K'])).toBe(false);
    expect(hotkey.canUse(['Ctrl', 'Alt', 'J'])).toBe(true);
    expect(callbacks.size).toBe(0);
  });

  it('suspend() pauses shortcuts while Settings records a new one', () => {
    const { hotkey, callbacks } = setup({ mode: 'toggle' });
    hotkey.apply();
    hotkey.suspend(true);
    expect(callbacks.size).toBe(0);
    hotkey.suspend(false);
    expect(callbacks.size).toBe(1);
  });

  it('no watcher on this OS: unsupported, toggle shortcut always on', () => {
    const { hotkey, callbacks } = setup({ listener: false });
    hotkey.apply();
    expect(hotkey.status().holdCtrl).toBe('unsupported');
    expect(callbacks.size).toBe(1);
  });

  it('accelerator names', () => {
    expect(toAccelerator(['Ctrl', 'Alt', 'F9'])).toBe('Control+Alt+F9');
    expect(toAccelerator(['Meta', 'Shift', 'K'])).toBe('Super+Shift+K');
  });
});
