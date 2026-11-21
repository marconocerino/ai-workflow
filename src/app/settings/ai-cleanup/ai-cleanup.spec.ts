import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import type { Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { AiCleanupSettings } from './ai-cleanup';

function stored(llmBaseUrl = 'https://llm.company.internal/v1'): Settings {
  return {
    dictation: {
      mode: 'hold',
      toggleShortcut: ['Ctrl', 'Shift', 'Space'],
      micDeviceId: '',
      keepMicReadySeconds: 10,
      cleanup: 'light',
      styles: [],
    },
    ai: {
      asr: { baseUrl: '', model: 'qwen3-asr' },
      llm: { baseUrl: llmBaseUrl, model: 'qwen3-32b' },
      timeoutMs: 30000,
      retries: 2,
    },
  };
}

async function render(settings = stored(), update = vi.fn((p) => Promise.resolve(p))) {
  const bridge = { settings: { get: vi.fn().mockResolvedValue(settings), update } };
  TestBed.configureTestingModule({
    imports: [AiCleanupSettings],
    providers: [
      provideRouter([]),
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
      SaveStatus,
    ],
  });
  const fixture = TestBed.createComponent(AiCleanupSettings);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  await settle();
  return { el: fixture.nativeElement as HTMLElement, update, settle };
}

describe('Settings → AI cleanup (VAI-307)', () => {
  it('shows Off, Light and Polished with examples; Light is selected', async () => {
    const { el } = await render();
    const options = Array.from(el.querySelectorAll('[data-option]'));
    expect(options.map((o) => o.getAttribute('data-option'))).toEqual(['off', 'light', 'polished']);
    const light = el.querySelector('[data-option="light"] input') as HTMLInputElement;
    expect(light.checked).toBe(true);
    expect(el.querySelector('[data-option="light"]')!.textContent).toContain(
      'So can we move the call to Friday?',
    );
    expect(el.textContent).toContain('never adds anything you didn');
    expect(el.querySelector('[data-testid="llm-missing"]')).toBeNull();
  });

  it('choosing a level saves it', async () => {
    const { el, update, settle } = await render();
    (el.querySelector('[data-option="polished"] input') as HTMLInputElement).click();
    await settle();
    expect(update).toHaveBeenCalledWith({ dictation: { cleanup: 'polished' } });
  });

  it('without an LLM server: says so and links to AI servers', async () => {
    const { el } = await render(stored(''));
    const note = el.querySelector('[data-testid="llm-missing"]')!;
    expect(note.textContent).toContain('needs an LLM server');
    expect(note.querySelector('a')!.getAttribute('href')).toBe('/settings/ai-servers');
  });

  it('a failed save is shown', async () => {
    const { el, settle } = await render(
      stored(),
      vi.fn(() => Promise.reject(new Error('disk full'))),
    );
    (el.querySelector('[data-option="off"] input') as HTMLInputElement).click();
    await settle();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});
