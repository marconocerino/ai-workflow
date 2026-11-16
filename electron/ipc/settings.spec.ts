import type { IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretStore } from '../settings/secret-store';
import { SettingsStore } from '../settings/settings-store';
import { createIpcRegistrar } from './handle';
import { registerSettingsIpc } from './settings';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

let dir: string;
let call: (channel: string, ...args: unknown[]) => unknown;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-ipc-'));
  const listeners = new Map<string, Listener>();
  const handle = createIpcRegistrar({ handle: (c, l) => void listeners.set(c, l) }, () => true);
  const settings = new SettingsStore(dir, { logger: { warn: () => undefined } });
  settings.load();
  const secrets = new SecretStore(dir, {
    isEncryptionAvailable: () => true,
    encryptString: (t) => Buffer.from(t).reverse(),
    decryptString: (b) => Buffer.from(b).reverse().toString(),
  });
  registerSettingsIpc(handle, settings, secrets);
  const event = { senderFrame: { url: 'app://renderer/' } } as unknown as IpcMainInvokeEvent;
  call = (channel, ...args) => listeners.get(channel)!(event, ...args);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('settings IPC', () => {
  it('gets and updates settings', () => {
    expect(call('settings:update', { ai: { llm: { model: 'm' } } })).toMatchObject({
      ai: { llm: { model: 'm' } },
    });
    expect(call('settings:get')).toMatchObject({ ai: { llm: { model: 'm' } } });
  });

  it('rejects invalid updates from the renderer', () => {
    expect(() =>
      call('settings:update', { ai: { llm: { baseUrl: 'javascript:alert(1)' } } }),
    ).toThrow(/ai\.llm\.baseUrl/);
    expect(() => call('settings:update', 'not an object')).toThrow();
  });

  it('sets, checks and clears secrets but never returns the value', () => {
    expect(call('secrets:set', { name: 'ai.llm.apiKey', value: 'k-123' })).toBeUndefined();
    expect(call('secrets:has', 'ai.llm.apiKey')).toBe(true);
    expect(call('secrets:clear', 'ai.llm.apiKey')).toBeUndefined();
    expect(call('secrets:has', 'ai.llm.apiKey')).toBe(false);
  });

  it('rejects malformed secret payloads', () => {
    expect(() => call('secrets:set', null)).toThrow();
    expect(() => call('secrets:set', { name: 'other', value: 'x' })).toThrow();
    expect(() => call('secrets:has', { toString: () => 'ai.llm.apiKey' })).toThrow();
  });

  it('exposes no channel that reads a secret back', () => {
    const channels = ['secrets:get', 'secrets:read', 'secrets:list'];
    for (const c of channels) expect(() => call(c)).toThrow();
  });
});
