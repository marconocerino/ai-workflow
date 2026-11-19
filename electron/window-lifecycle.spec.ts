import { describe, expect, it, vi } from 'vitest';
import { HIDDEN_ARG, startHidden, WindowLifecycle, type WindowLike } from './window-lifecycle';

function fakeWindow(minimized = false) {
  let onClose: ((e: { preventDefault(): void }) => void) | null = null;
  const win = {
    on: (_e: 'close', l: (e: { preventDefault(): void }) => void) => (onClose = l),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isMinimized: () => minimized,
    isDestroyed: () => false,
  } satisfies WindowLike;
  const close = () => {
    const event = { preventDefault: vi.fn() };
    onClose!(event);
    return event;
  };
  return { win, close };
}

describe('WindowLifecycle', () => {
  it('closing the window hides it and keeps the app running', () => {
    const lifecycle = new WindowLifecycle();
    const { win, close } = fakeWindow();
    lifecycle.attach(win);
    const event = close();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it('a real quit lets the close through', () => {
    const lifecycle = new WindowLifecycle();
    const { win, close } = fakeWindow();
    lifecycle.attach(win);
    lifecycle.quitting();
    const event = close();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
    expect(lifecycle.quittingNow).toBe(true);
  });

  it('show() restores a minimized window and focuses it', () => {
    const lifecycle = new WindowLifecycle();
    const { win } = fakeWindow(true);
    lifecycle.attach(win);
    lifecycle.show();
    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('--hidden means "started at sign-in"', () => {
    expect(startHidden(['app.exe', HIDDEN_ARG])).toBe(true);
    expect(startHidden(['app.exe'])).toBe(false);
  });
});
