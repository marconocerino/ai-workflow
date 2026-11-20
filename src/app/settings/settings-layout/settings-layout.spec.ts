import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AiWorkflowApi, HotkeyStatus } from '../../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SETTINGS_SECTIONS, SettingsLayout } from './settings-layout';

async function render(
  mode: 'hold' | 'toggle',
  holdCtrl: HotkeyStatus['holdCtrl'] = 'ready',
  extra: Partial<HotkeyStatus> = {},
) {
  const status: HotkeyStatus = {
    mode,
    holdCtrl,
    toggleShortcut: ['Ctrl', 'Shift', 'Space'],
    toggleActive: mode === 'toggle' || holdCtrl !== 'ready',
    ...extra,
  };
  const bridge = {
    app: { getInfo: vi.fn().mockResolvedValue({ version: '0.1.0' }) },
    hotkey: { status: vi.fn().mockResolvedValue(status) },
  };
  TestBed.configureTestingModule({
    imports: [SettingsLayout],
    providers: [
      provideRouter([]),
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
    ],
  });
  const fixture = TestBed.createComponent(SettingsLayout);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('SettingsLayout', () => {
  it('lists the design sections plus AI servers, in order', async () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      'Dictation',
      'Transcription',
      'AI servers',
      'AI cleanup',
      'Vocabulary',
      'Style per app',
      'About & diagnostics',
    ]);
    const el = await render('hold');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent!.trim());
    expect(links).toEqual(SETTINGS_SECTIONS.map((s) => s.label));
  });

  const card = (el: HTMLElement) =>
    el.querySelector('[data-testid="dictation-status"]')!.textContent!.replace(/\s+/g, ' ').trim();

  it('status card: Ready + Hold Ctrl when the watcher works', async () => {
    expect(card(await render('hold'))).toMatch(/^Ready Hold .*Ctrl.* to dictate$/);
  });

  it('status card: toggle mode shows the shortcut', async () => {
    const text = card(await render('toggle'));
    expect(text).toContain('Press');
    expect(text).toContain('Ctrl plus Shift plus Space');
  });

  it('status card: fallback when Hold Ctrl is unavailable', async () => {
    const text = card(await render('hold', 'unavailable'));
    expect(text).toContain('Ready (Hold Ctrl unavailable)');
    expect(text).toContain('Ctrl plus Shift plus Space');
  });

  it('status card: nothing works → Not active with the reason', async () => {
    const text = card(
      await render('toggle', 'unsupported', {
        toggleActive: false,
        toggleError: 'Ctrl+Shift+Space is already used by another app.',
      }),
    );
    expect(text).toBe('Not active Ctrl+Shift+Space is already used by another app.');
  });
});
