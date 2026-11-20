import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import type { SecretName, Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { FeatureFlags } from '../../core/feature-flags';
import { SaveStatus } from '../shared/save-status';
import { AiServers } from './ai-servers';

const stored: Settings = {
  dictation: {
    mode: 'hold',
    toggleShortcut: ['Ctrl', 'Shift', 'Space'],
    micDeviceId: '',
    keepMicReadySeconds: 10,
    cleanup: 'light',
  },
  ai: {
    asr: { baseUrl: 'https://asr.company/v1', model: 'qwen3-asr' },
    llm: { baseUrl: '', model: '' },
    timeoutMs: 45000,
    retries: 3,
  },
};

function fakeBridge() {
  return {
    app: { getInfo: vi.fn() },
    settings: {
      get: vi.fn().mockResolvedValue(stored),
      update: vi.fn().mockResolvedValue(stored),
    },
    secrets: {
      set: vi.fn(),
      has: vi.fn(async (name: SecretName) => name === 'ai.asr.apiKey'),
      clear: vi.fn(),
    },
    ai: { testConnection: vi.fn() },
    features: {
      get: vi.fn().mockResolvedValue({
        flags: { meetings: false, agents: false, voiceprints: false },
        sources: ['defaults'],
      }),
    },
    hotkey: {
      status: vi.fn(),
      setToggleShortcut: vi.fn(),
      suspend: vi.fn(),
      recheck: vi.fn(),
      openPermissionSettings: vi.fn(),
    },
    audio: { status: vi.fn() },
    overlay: { getState: vi.fn(), onState: vi.fn() },
    audioEngine: { onCommand: vi.fn(), event: vi.fn(), recording: vi.fn() },
    startup: { get: vi.fn(), set: vi.fn() },
    log: { rendererError: vi.fn().mockResolvedValue(undefined) },
    diagnostics: { export: vi.fn(), openLogs: vi.fn() },
  } satisfies AiWorkflowApi;
}

async function render(bridge = fakeBridge()) {
  TestBed.configureTestingModule({
    imports: [AiServers],
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }, SaveStatus],
  });
  await TestBed.inject(FeatureFlags).load();
  const fixture = TestBed.createComponent(AiServers);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  return { fixture, bridge, el, q };
}

describe('AiServers', () => {
  it('descriptions mention meetings and agents only when those features are on', async () => {
    const off = await render();
    expect(off.el.textContent).not.toMatch(/meeting|agent/i);
    TestBed.resetTestingModule();
    const bridge = fakeBridge();
    bridge.features.get.mockResolvedValue({
      flags: { meetings: true, agents: true, voiceprints: false },
      sources: ['registry'],
    });
    const on = await render(bridge);
    expect(on.el.textContent).toContain('dictation and meetings');
    expect(on.el.textContent).toContain('Writes meeting summaries.');
    expect(on.el.textContent).toContain('Powers the agents.');
  });

  it('loads both servers, key status and advanced values', async () => {
    const { q } = await render();
    expect(q<HTMLInputElement>('asr-base-url')!.value).toBe('https://asr.company/v1');
    expect(q('asr-key-status')!.textContent!.trim()).toBe('Saved');
    expect(q('llm-key-status')!.textContent!.trim()).toBe('Not set');
    expect(q<HTMLInputElement>('timeout-seconds')!.value).toBe('45');
    expect(q<HTMLInputElement>('retries')!.value).toBe('3');
    expect(q('save-status')!.textContent).toContain('Changes save automatically');
  });

  it('saves the timeout in milliseconds', async () => {
    const { bridge, q, fixture } = await render();
    const input = q<HTMLInputElement>('timeout-seconds')!;
    input.value = '60';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(bridge.settings.update).toHaveBeenCalledWith({ ai: { timeoutMs: 60000 } });
  });

  it('does not save out-of-range values', async () => {
    const { bridge, q, fixture } = await render();
    const input = q<HTMLInputElement>('retries')!;
    input.value = '99';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(bridge.settings.update).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Must be at most 10.');
  });

  it('shows a load error', async () => {
    const bridge = fakeBridge();
    bridge.settings.get.mockRejectedValueOnce(new Error('boom'));
    const { el } = await render(bridge);
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('boom');
  });
});
