import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import type { Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { VocabularySettings } from './vocabulary';

function stored(vocabulary: string[]): Settings {
  return {
    dictation: {
      mode: 'hold',
      toggleShortcut: ['Ctrl', 'Shift', 'Space'],
      micDeviceId: '',
      keepMicReadySeconds: 10,
      cleanup: 'light',
      styles: [],
      vocabulary,
    },
    ai: {
      asr: { baseUrl: '', model: '' },
      llm: { baseUrl: '', model: '' },
      timeoutMs: 30000,
      retries: 2,
    },
  };
}

async function render(words: string[] = ['Siobhan', 'Kubernetes']) {
  const update = vi.fn((patch: { dictation: { vocabulary: string[] } }) =>
    Promise.resolve(stored(patch.dictation.vocabulary)),
  );
  const bridge = { settings: { get: vi.fn().mockResolvedValue(stored(words)), update } };
  TestBed.configureTestingModule({
    imports: [VocabularySettings],
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
      SaveStatus,
    ],
  });
  const fixture = TestBed.createComponent(VocabularySettings);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const input = () => el.querySelector('[data-testid="vocab-input"]') as HTMLInputElement;
  const chips = () =>
    Array.from(el.querySelectorAll('[data-testid="vocab-word"]')).map((c) =>
      c.textContent!.replace(/\s+/g, ' ').trim(),
    );
  const type = async (text: string, key: 'Enter' | ',') => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key, keyCode: key === 'Enter' ? 13 : 188, bubbles: true }),
    );
    await settle();
  };
  const paste = async (text: string) => {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    input().dispatchEvent(event);
    await settle();
    return event;
  };
  return { el, update, settle, input, chips, type, paste };
}

describe('Settings → Vocabulary (VAI-309)', () => {
  it('shows the saved words, a counter, and how they are used', async () => {
    const { el, chips } = await render();
    expect(chips()).toEqual(['Siobhan', 'Kubernetes']);
    expect(el.querySelector('[data-testid="vocab-count"]')!.textContent).toContain('2 of 200');
    expect(el.textContent).toContain("They're never added to text you didn't say");
    expect(el.querySelector('button[aria-label="Remove Siobhan"]')).not.toBeNull();
  });

  it('Enter adds a word and clears the input', async () => {
    const { update, type, chips, input } = await render();
    await type('AIWF', 'Enter');
    expect(update).toHaveBeenLastCalledWith({
      dictation: { vocabulary: ['Siobhan', 'Kubernetes', 'AIWF'] },
    });
    expect(chips()).toContain('AIWF');
    expect(input().value).toBe('');
  });

  it('a comma adds a word too', async () => {
    const { update, type } = await render([]);
    await type('kubectl', ',');
    expect(update).toHaveBeenLastCalledWith({ dictation: { vocabulary: ['kubectl'] } });
  });

  it('pasting a list adds every entry; duplicates are skipped quietly', async () => {
    const { update, paste, el } = await render();
    const event = await paste('AIWF, kubernetes\nVisual Studio; Grafana');
    expect(event.defaultPrevented).toBe(true);
    expect(update).toHaveBeenLastCalledWith({
      dictation: { vocabulary: ['Siobhan', 'Kubernetes', 'AIWF', 'Visual Studio', 'Grafana'] },
    });
    expect(el.querySelector('.notice')).toBeNull();
  });

  it('pasting a single word goes into the input as usual', async () => {
    const { update, paste } = await render();
    const event = await paste('Grafana');
    expect(event.defaultPrevented).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('a word over 40 characters is not added, with a message', async () => {
    const { update, paste, el } = await render([]);
    await paste(`AIWF, ${'x'.repeat(41)}`);
    expect(update).toHaveBeenLastCalledWith({ dictation: { vocabulary: ['AIWF'] } });
    expect(el.querySelector('.notice')!.textContent).toContain('over 40 characters');
  });

  it('the list stops at 200, with a message', async () => {
    const full = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const { update, type, el } = await render(full);
    await type('one more', 'Enter');
    expect(update).not.toHaveBeenCalled();
    expect(el.querySelector('.notice')!.textContent).toContain('The list is full');
  });

  it('✕ removes a word', async () => {
    const { el, update, settle, chips } = await render();
    (el.querySelector('button[aria-label="Remove Siobhan"]') as HTMLButtonElement).click();
    await settle();
    expect(update).toHaveBeenLastCalledWith({ dictation: { vocabulary: ['Kubernetes'] } });
    expect(chips()).toEqual(['Kubernetes']);
  });
});
