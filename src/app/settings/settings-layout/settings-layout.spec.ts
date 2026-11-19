import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SETTINGS_SECTIONS, SettingsLayout } from './settings-layout';

async function render(mode: 'hold' | 'toggle') {
  const bridge = {
    app: { getInfo: vi.fn().mockResolvedValue({ version: '0.1.0' }) },
    settings: {
      get: vi.fn().mockResolvedValue({
        dictation: { mode, toggleShortcut: ['Ctrl', 'Shift', 'Space'] },
      }),
    },
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

  it('status card shows the shortcut for the chosen mode', async () => {
    const hold = await render('hold');
    expect(hold.querySelector('[data-testid="dictation-status"]')!.textContent).toMatch(
      /Not active yet\s+Hold.*to dictate/,
    );
    TestBed.resetTestingModule();
    const toggle = await render('toggle');
    expect(toggle.querySelector('[data-testid="dictation-status"]')!.textContent).toContain(
      'Ctrl plus Shift plus Space',
    );
  });
});
