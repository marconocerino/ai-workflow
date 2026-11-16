import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import type { AppInfo } from '../../shared/ipc-contract';
import { getAppInfo } from './app-info';
import { createIpcRegistrar, type IpcMainLike, UntrustedSenderError } from './handle';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain() {
  const listeners = new Map<string, Listener>();
  const ipcMain: IpcMainLike = { handle: (channel, l) => void listeners.set(channel, l) };
  return { ipcMain, listeners };
}

const eventFrom = (url: string) => ({ senderFrame: { url } }) as unknown as IpcMainInvokeEvent;
const isTrusted = (e: IpcMainInvokeEvent) =>
  e.senderFrame?.url.startsWith('app://renderer/') ?? false;

const info: AppInfo = {
  name: 'AI Workflow',
  version: '0.1.0',
  platform: 'win32',
  electron: '45.0.0',
  chrome: '140.0.0',
};

describe('createIpcRegistrar', () => {
  it('registers the channel and answers trusted senders', async () => {
    const { ipcMain, listeners } = fakeIpcMain();
    const handle = createIpcRegistrar(ipcMain, isTrusted);
    handle('app:get-info', () => info);

    const listener = listeners.get('app:get-info');
    expect(listener).toBeDefined();
    await expect(Promise.resolve(listener!(eventFrom('app://renderer/')))).resolves.toEqual(info);
  });

  it('rejects untrusted senders without running the handler', () => {
    const { ipcMain, listeners } = fakeIpcMain();
    let ran = false;
    createIpcRegistrar(ipcMain, isTrusted)('app:get-info', () => {
      ran = true;
      return info;
    });
    expect(() => listeners.get('app:get-info')!(eventFrom('https://evil.example/'))).toThrow(
      UntrustedSenderError,
    );
    expect(ran).toBe(false);
  });

  it('is type-checked against the contract', () => {
    const handle = createIpcRegistrar(fakeIpcMain().ipcMain, isTrusted);
    // @ts-expect-error unknown channel
    handle('app:does-not-exist', () => info);
    // @ts-expect-error wrong response type
    handle('app:get-info', () => 42);
    expect(true).toBe(true);
  });
});

describe('getAppInfo', () => {
  it('maps process data to AppInfo', () => {
    expect(
      getAppInfo({
        name: 'AI Workflow',
        version: '0.1.0',
        platform: 'darwin',
        versions: { electron: '45.3.3', chrome: '142.0.0' },
      }),
    ).toEqual({
      name: 'AI Workflow',
      version: '0.1.0',
      platform: 'darwin',
      electron: '45.3.3',
      chrome: '142.0.0',
    });
  });
  it('falls back when versions are missing', () => {
    const r = getAppInfo({ name: 'x', version: '1', platform: 'linux', versions: {} });
    expect(r.electron).toBe('unknown');
    expect(r.chrome).toBe('unknown');
  });
});
