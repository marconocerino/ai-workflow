import { describe, expect, it, vi } from 'vitest';
import { Startup, type LoginItemApi } from './startup';

function fakeApp(isPackaged: boolean, wasOpenedAtLogin = false) {
  let openAtLogin = false;
  const app: LoginItemApi = {
    isPackaged,
    getLoginItemSettings: vi.fn(() => ({ openAtLogin, wasOpenedAtLogin })),
    setLoginItemSettings: vi.fn((s) => {
      openAtLogin = s.openAtLogin;
    }),
  };
  return app;
}

describe('Startup (start at sign-in)', () => {
  it('not available when running from source; refuses to register', () => {
    const app = fakeApp(false);
    const startup = new Startup(app, 'win32');
    expect(startup.get()).toEqual({ available: false, openAtLogin: false });
    expect(() => startup.set(true)).toThrow(/installed app/);
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('Windows: turns the login entry on and off, starting hidden in the tray', () => {
    const app = fakeApp(true);
    const startup = new Startup(app, 'win32');
    expect(startup.set(true)).toEqual({ available: true, openAtLogin: true });
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--hidden'],
    });
    expect(app.getLoginItemSettings).toHaveBeenCalledWith({ args: ['--hidden'] });
    expect(startup.set(false)).toEqual({ available: true, openAtLogin: false });
  });

  it('rejects non-boolean values from the renderer', () => {
    expect(() => new Startup(fakeApp(true), 'win32').set('yes')).toThrow(/true or false/);
  });

  it('knows when it was started at sign-in', () => {
    expect(new Startup(fakeApp(true), 'win32').openedAtLogin(['app.exe', '--hidden'])).toBe(true);
    expect(new Startup(fakeApp(true), 'win32').openedAtLogin(['app.exe'])).toBe(false);
    expect(new Startup(fakeApp(true, true), 'darwin').openedAtLogin(['app'])).toBe(true);
    expect(new Startup(fakeApp(false, true), 'darwin').openedAtLogin(['app'])).toBe(false);
  });

  it('Linux: not available', () => {
    expect(new Startup(fakeApp(true), 'linux').get().available).toBe(false);
  });
});
