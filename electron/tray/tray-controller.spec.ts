import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { DictationStatus } from './dictation-status';
import { TrayController, type TrayLike } from './tray-controller';

function setup(platform: NodeJS.Platform = 'win32', available = false) {
  const calls: { image: string[]; tooltip: string[]; menus: MenuItemConstructorOptions[][] } = {
    image: [],
    tooltip: [],
    menus: [],
  };
  let onClick: (() => void) | null = null;
  const fake: TrayLike = {
    setImage: (i) => calls.image.push(i),
    setToolTip: (t) => calls.tooltip.push(t),
    setContextMenu: (m) => calls.menus.push(m as MenuItemConstructorOptions[]),
    on: (_e, l) => (onClick = l),
    destroy: vi.fn(),
  };
  const status = new DictationStatus();
  const deps = {
    createTray: vi.fn((icon: string) => {
      calls.image.push(icon);
      return fake;
    }),
    buildMenu: (t: MenuItemConstructorOptions[]) => t,
    iconPath: (s: string) => `/icons/${s}.png`,
    status,
    platform,
    dictationAvailable: () => available,
    showWindow: vi.fn(),
    openSettings: vi.fn(),
    quit: vi.fn(),
  };
  const tray = new TrayController(deps);
  tray.create();
  return { tray, deps, status, calls, fake, click: () => onClick?.() };
}

describe('TrayController', () => {
  it('starts idle: idle icon, tooltip and menu', () => {
    const { tray, calls } = setup();
    expect(calls.image.at(-1)).toBe('/icons/idle.png');
    expect(calls.tooltip.at(-1)).toBe('AI Workflow — Idle');
    expect(tray.describe().menu).toEqual([
      'Dictation: not active yet',
      '---',
      'Open AI Workflow',
      'Settings',
      '---',
      'Quit AI Workflow',
    ]);
  });

  it('follows listening and recording', () => {
    const { status, calls, tray } = setup('win32', true);
    status.set('listening');
    expect(calls.image.at(-1)).toBe('/icons/listening.png');
    expect(calls.tooltip.at(-1)).toBe('AI Workflow — Listening');
    status.set('recording');
    expect(calls.image.at(-1)).toBe('/icons/recording.png');
    expect(calls.tooltip.at(-1)).toBe('AI Workflow — Recording');
    expect(tray.describe().menu[0]).toBe('Dictation: Recording');
    status.set('idle');
    expect(calls.image.at(-1)).toBe('/icons/idle.png');
  });

  it('menu items call the app; the status line is not clickable', () => {
    const { tray, deps } = setup();
    tray.click('Open AI Workflow');
    tray.click('Settings');
    tray.click('Quit AI Workflow');
    expect(deps.showWindow).toHaveBeenCalledOnce();
    expect(deps.openSettings).toHaveBeenCalledOnce();
    expect(deps.quit).toHaveBeenCalledOnce();
    expect(() => tray.click('Dictation: not active yet')).toThrow();
  });

  it('clicking the icon opens the window on Windows, not on macOS', () => {
    const win = setup('win32');
    win.click();
    expect(win.deps.showWindow).toHaveBeenCalledOnce();
    const mac = setup('darwin');
    mac.click();
    expect(mac.deps.showWindow).not.toHaveBeenCalled();
  });

  it('destroy removes the icon and stops following the status', () => {
    const { tray, status, calls, fake } = setup();
    tray.destroy();
    const before = calls.image.length;
    status.set('recording');
    expect(calls.image.length).toBe(before);
    expect(fake.destroy).toHaveBeenCalled();
  });
});

describe('DictationStatus', () => {
  it('notifies only on change', () => {
    const status = new DictationStatus();
    const seen: string[] = [];
    const off = status.onChange((s) => seen.push(s));
    status.set('idle');
    status.set('listening');
    status.set('listening');
    off();
    status.set('recording');
    expect(seen).toEqual(['listening']);
    expect(status.get()).toBe('recording');
  });
});
