import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import type { Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { EndpointCard, type SaveState } from './endpoint-card';

function settings(llm: Partial<Settings['ai']['llm']> = {}): Settings {
  return {
    dictation: {
      mode: 'hold',
      toggleShortcut: ['Ctrl', 'Shift', 'Space'],
      micDeviceId: '',
      keepMicReadySeconds: 10,
    },
    ai: {
      asr: { baseUrl: '', model: 'qwen3-asr' },
      llm: { baseUrl: '', model: '', ...llm },
      timeoutMs: 30000,
      retries: 2,
    },
  };
}

function fakeBridge() {
  return {
    app: { getInfo: vi.fn() },
    settings: {
      get: vi.fn(),
      update: vi.fn(async (patch: { ai?: { llm?: Partial<Settings['ai']['llm']> } }) => {
        const url = patch.ai?.llm?.baseUrl;
        if (url === 'https://forbidden.example') {
          throw new Error(
            "Error invoking remote method 'settings:update': SettingsValidationError: Invalid settings: ai.llm.baseUrl must not be this host",
          );
        }
        return settings({ ...patch.ai?.llm, baseUrl: (url ?? '').replace(/\/+$/, '') });
      }),
    },
    secrets: {
      set: vi.fn().mockResolvedValue(undefined),
      has: vi.fn(),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    ai: {
      testConnection: vi
        .fn()
        .mockResolvedValue({ ok: true, code: 'ok', message: 'Connected (12 ms).', latencyMs: 12 }),
    },
    features: { get: vi.fn() },
    hotkey: {
      status: vi.fn(),
      setToggleShortcut: vi.fn(),
      suspend: vi.fn(),
      recheck: vi.fn(),
      openPermissionSettings: vi.fn(),
    },
    audio: { status: vi.fn() },
    audioEngine: { onCommand: vi.fn(), event: vi.fn(), recording: vi.fn() },
    startup: { get: vi.fn(), set: vi.fn() },
    log: { rendererError: vi.fn().mockResolvedValue(undefined) },
    diagnostics: { export: vi.fn(), openLogs: vi.fn() },
  } satisfies AiWorkflowApi;
}

async function render(hasKey = false) {
  const bridge = fakeBridge();
  TestBed.configureTestingModule({
    imports: [EndpointCard],
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }],
  });
  const fixture = TestBed.createComponent(EndpointCard);
  fixture.componentRef.setInput('service', 'llm');
  fixture.componentRef.setInput('heading', 'Language model');
  fixture.componentRef.setInput('initial', { baseUrl: 'https://old.company/v1', model: 'm1' });
  fixture.componentRef.setInput('initialHasKey', hasKey);
  const states: SaveState[] = [];
  fixture.componentInstance.saveState.subscribe((s) => states.push(s));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const type = async (id: string, value: string) => {
    const input = q<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  return { fixture, bridge, el, q, type, states };
}

describe('EndpointCard', () => {
  it('shows the saved values and key status', async () => {
    const { q } = await render(true);
    expect(q<HTMLInputElement>('llm-base-url')!.value).toBe('https://old.company/v1');
    expect(q<HTMLInputElement>('llm-model')!.value).toBe('m1');
    expect(q('llm-key-status')!.textContent!.trim()).toBe('Saved');
    expect(q('llm-key')).toBeNull(); // no key input while a key is saved
  });

  it('saves a changed field on blur and shows the normalised value', async () => {
    const { bridge, q, type, states } = await render();
    await type('llm-base-url', 'https://llm.company/v1/');
    expect(bridge.settings.update).toHaveBeenCalledWith({
      ai: { llm: { baseUrl: 'https://llm.company/v1/' } },
    });
    expect(q<HTMLInputElement>('llm-base-url')!.value).toBe('https://llm.company/v1');
    expect(states).toEqual(['saving', 'saved']);
  });

  it('does not save unchanged or locally invalid values', async () => {
    const { bridge, q, type, fixture } = await render();
    q('llm-base-url')!.dispatchEvent(new Event('blur'));
    await type('llm-base-url', 'ftp://nope');
    fixture.detectChanges();
    expect(bridge.settings.update).not.toHaveBeenCalled();
    expect(q('llm-base-url-error')!.textContent).toContain('http:// or https://');
  });

  it('shows the error main returns for a field', async () => {
    const { q, type, fixture, states } = await render();
    await type('llm-base-url', 'https://forbidden.example');
    fixture.detectChanges();
    expect(q('llm-base-url-error')!.textContent!.trim()).toBe('Must not be this host.');
    expect(states).toEqual(['saving', 'error']);
  });

  it('saves the key, clears the input and only shows "Saved"', async () => {
    const { bridge, q, fixture } = await render(false);
    expect(q('llm-key-status')!.textContent!.trim()).toBe('Not set');
    const input = q<HTMLInputElement>('llm-key')!;
    input.value = 'sk-123';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    q<HTMLButtonElement>('llm-save-key')!.click();
    await fixture.whenStable();
    expect(bridge.secrets.set).toHaveBeenCalledWith('ai.llm.apiKey', 'sk-123');
    expect(q('llm-key-status')!.textContent!.trim()).toBe('Saved');
    expect(q('llm-key')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('sk-123');
  });

  it('removes the key', async () => {
    const { bridge, q, fixture } = await render(true);
    q<HTMLButtonElement>('llm-remove-key')!.click();
    await fixture.whenStable();
    expect(bridge.secrets.clear).toHaveBeenCalledWith('ai.llm.apiKey');
    expect(q('llm-key-status')!.textContent!.trim()).toBe('Not set');
  });

  it('replace shows an empty key input again', async () => {
    const { q, fixture } = await render(true);
    q<HTMLButtonElement>('llm-replace-key')!.click();
    await fixture.whenStable();
    expect(q<HTMLInputElement>('llm-key')!.value).toBe('');
  });

  it('saves pending edits before testing and shows the result', async () => {
    const { bridge, q, fixture } = await render();
    const input = q<HTMLInputElement>('llm-model')!;
    input.value = 'qwen3-32b';
    input.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('llm-test')!.click();
    await fixture.whenStable();
    expect(bridge.settings.update).toHaveBeenCalledWith({ ai: { llm: { model: 'qwen3-32b' } } });
    expect(bridge.ai.testConnection).toHaveBeenCalledWith('llm');
    expect(q('llm-test-result')!.textContent).toContain('Connected (12 ms).');
  });

  it('shows failed test results', async () => {
    const { bridge, q, fixture } = await render();
    bridge.ai.testConnection.mockResolvedValueOnce({
      ok: false,
      code: 'unauthorized',
      message: 'The server rejected the API key.',
    });
    q<HTMLButtonElement>('llm-test')!.click();
    await fixture.whenStable();
    const result = q('llm-test-result')!;
    expect(result.textContent).toContain('rejected');
    expect(result.classList).toContain('error');
  });
});
