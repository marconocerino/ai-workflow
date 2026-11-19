import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import type { Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { DictationSettings } from './dictation';

const stored: Settings = {
  dictation: { mode: 'hold', toggleShortcut: ['Ctrl', 'Alt', 'F9'] },
  ai: {
    asr: { baseUrl: '', model: 'qwen3-asr' },
    llm: { baseUrl: '', model: '' },
    timeoutMs: 30000,
    retries: 2,
  },
};

async function render(update = vi.fn().mockResolvedValue(stored)) {
  const bridge = { settings: { get: vi.fn().mockResolvedValue(stored), update } };
  TestBed.configureTestingModule({
    imports: [DictationSettings],
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
      SaveStatus,
    ],
  });
  const fixture = TestBed.createComponent(DictationSettings);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  return { fixture, el, update, settle, status: TestBed.inject(SaveStatus) };
}

describe('DictationSettings', () => {
  it('shows the saved mode and toggle shortcut', async () => {
    const { el } = await render();
    expect(el.querySelector<HTMLInputElement>('[data-option="hold"] input')!.checked).toBe(true);
    expect(el.querySelector('[data-testid="toggle-shortcut"]')!.textContent).toContain(
      'Ctrl plus Alt plus F9',
    );
    expect(el.textContent).toContain('1. Hold');
  });

  it('choosing Toggle saves it and updates the how-it-works card', async () => {
    const { el, update, settle, status } = await render();
    el.querySelector<HTMLInputElement>('[data-option="toggle"] input')!.click();
    await settle();
    expect(update).toHaveBeenCalledWith({ dictation: { mode: 'toggle' } });
    expect(status.state()).toBe('saved');
    expect(el.textContent).toContain('1. Press');
    expect(el.textContent).toContain('3. Press again');
  });

  it('shows a save error', async () => {
    const { el, settle, status } = await render(
      vi
        .fn()
        .mockRejectedValue(
          new Error("Error invoking remote method 'settings:update': Error: EACCES"),
        ),
    );
    el.querySelector<HTMLInputElement>('[data-option="toggle"] input')!.click();
    await settle();
    expect(status.state()).toBe('error');
    expect(el.querySelector('[data-testid="dictation-error"]')!.textContent).toContain('EACCES');
  });
});
