import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import {
  type CleanupLevel,
  DEFAULT_STYLE_RULES,
  type Settings,
  type StyleRule,
} from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { StyleSettings } from './style';

function stored(styles: StyleRule[] = [...DEFAULT_STYLE_RULES], cleanup: CleanupLevel = 'light') {
  return {
    dictation: {
      mode: 'hold',
      toggleShortcut: ['Ctrl', 'Shift', 'Space'],
      micDeviceId: '',
      keepMicReadySeconds: 10,
      cleanup,
      styles,
    },
    ai: {
      asr: { baseUrl: '', model: '' },
      llm: { baseUrl: '', model: '' },
      timeoutMs: 30000,
      retries: 2,
    },
  } as Settings;
}

async function render(settings = stored()) {
  const update = vi.fn((patch: { dictation: { styles: StyleRule[] } }) =>
    Promise.resolve(stored(patch.dictation.styles)),
  );
  const bridge = { settings: { get: vi.fn().mockResolvedValue(settings), update } };
  TestBed.configureTestingModule({
    imports: [StyleSettings],
    providers: [
      provideRouter([]),
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
      SaveStatus,
    ],
  });
  const fixture = TestBed.createComponent(StyleSettings);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const apps = () =>
    Array.from(el.querySelectorAll('[data-testid="style-rule"] .app')).map((a) => a.textContent);
  return { el, update, settle, apps };
}

describe('Settings → Style per app (VAI-308)', () => {
  it('lists the default rules, says what happens without one', async () => {
    const { el, apps } = await render();
    expect(apps()).toEqual(DEFAULT_STYLE_RULES.map((r) => r.app));
    expect(el.textContent).toContain('Apps without a rule use Neutral');
    expect(el.querySelector('[data-testid="cleanup-off"]')).toBeNull();
    // Each select and remove button names its app for screen readers.
    expect(el.querySelector('mat-select')!.getAttribute('aria-label')).toBe('Style for Outlook');
    expect(el.querySelector('button[aria-label="Remove Outlook"]')).not.toBeNull();
  });

  it('adds a rule (trimmed) and saves the whole list', async () => {
    const { el, update, settle, apps } = await render(stored([]));
    const input = el.querySelector('[data-testid="new-app"]') as HTMLInputElement;
    input.value = '  Notion ';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('[data-testid="add-rule"]') as HTMLButtonElement).click();
    await settle();
    expect(update).toHaveBeenLastCalledWith({
      dictation: { styles: [{ app: 'Notion', style: 'professional' }] },
    });
    expect(apps()).toEqual(['Notion']);
    expect(input.value).toBe('');
  });

  it('refuses an empty name or a duplicate, with a message', async () => {
    const { el, update, settle } = await render();
    const add = el.querySelector('[data-testid="add-rule"]') as HTMLButtonElement;
    add.click();
    await settle();
    expect(el.querySelector('.add-error')!.textContent).toContain('Type an app name');
    const input = el.querySelector('[data-testid="new-app"]') as HTMLInputElement;
    input.value = 'outlook';
    input.dispatchEvent(new Event('input'));
    add.click();
    await settle();
    expect(el.querySelector('.add-error')!.textContent).toContain('already has a style');
    expect(update).not.toHaveBeenCalled();
  });

  it('removes a rule and restores defaults', async () => {
    const { el, update, settle, apps } = await render();
    (el.querySelector('button[aria-label="Remove Outlook"]') as HTMLButtonElement).click();
    await settle();
    expect(apps()).not.toContain('Outlook');
    (el.querySelector('[data-testid="restore-styles"]') as HTMLButtonElement).click();
    await settle();
    expect(update).toHaveBeenLastCalledWith({ dictation: { styles: [...DEFAULT_STYLE_RULES] } });
    expect(apps()).toEqual(DEFAULT_STYLE_RULES.map((r) => r.app));
  });

  it('with cleanup off, says styles are not used', async () => {
    const { el } = await render(stored(undefined, 'off'));
    expect(el.querySelector('[data-testid="cleanup-off"]')!.textContent).toContain(
      "styles aren't used",
    );
  });
});
