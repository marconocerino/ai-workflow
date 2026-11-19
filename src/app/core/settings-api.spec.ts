import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../shared/ipc-contract';
import type { Settings } from '../../../shared/settings';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';
import { SettingsApi } from './settings-api';

const settings: Settings = {
  dictation: { mode: 'hold', toggleShortcut: ['Ctrl', 'Shift', 'Space'] },
  ai: {
    asr: { baseUrl: '', model: 'qwen3-asr' },
    llm: { baseUrl: 'https://llm.company', model: 'm' },
    timeoutMs: 30000,
    retries: 2,
  },
};

function fakeBridge() {
  return {
    app: { getInfo: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(settings),
      update: vi.fn().mockResolvedValue(settings),
    },
    secrets: {
      set: vi.fn().mockResolvedValue(undefined),
      has: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    ai: { testConnection: vi.fn() },
    features: { get: vi.fn() },
    log: { rendererError: vi.fn().mockResolvedValue(undefined) },
    diagnostics: { export: vi.fn(), openLogs: vi.fn() },
  } satisfies AiWorkflowApi;
}

function setup(bridge: AiWorkflowApi | null) {
  TestBed.configureTestingModule({
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }],
  });
  return TestBed.inject(SettingsApi);
}

describe('SettingsApi', () => {
  it('passes calls through to the bridge', async () => {
    const bridge = fakeBridge();
    const api = setup(bridge);
    await expect(api.get()).resolves.toEqual(settings);
    await api.update({ ai: { retries: 1 } });
    expect(bridge.settings.update).toHaveBeenCalledWith({ ai: { retries: 1 } });
    await api.setSecret('ai.llm.apiKey', 'k');
    expect(bridge.secrets.set).toHaveBeenCalledWith('ai.llm.apiKey', 'k');
    await expect(api.hasSecret('ai.llm.apiKey')).resolves.toBe(true);
    await api.clearSecret('ai.llm.apiKey');
    expect(bridge.secrets.clear).toHaveBeenCalledWith('ai.llm.apiKey');
  });

  it('has no way to read a secret value', () => {
    const api = setup(fakeBridge()) as unknown as Record<string, unknown>;
    expect(api['getSecret']).toBeUndefined();
  });

  it('rejects clearly outside Electron', async () => {
    const api = setup(null);
    await expect(api.get()).rejects.toBeInstanceOf(DesktopBridgeUnavailableError);
    await expect(api.setSecret('ai.llm.apiKey', 'k')).rejects.toBeInstanceOf(
      DesktopBridgeUnavailableError,
    );
  });
});
