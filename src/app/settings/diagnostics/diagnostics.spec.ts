import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi, DiagnosticsExportResult } from '../../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { Diagnostics } from './diagnostics';

async function render(exportResult: () => Promise<DiagnosticsExportResult>) {
  const bridge = {
    diagnostics: {
      export: vi.fn().mockImplementation(exportResult),
      openLogs: vi.fn().mockResolvedValue(undefined),
    },
  } satisfies Pick<AiWorkflowApi, 'diagnostics'>;
  TestBed.configureTestingModule({
    imports: [Diagnostics],
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }],
  });
  const fixture = TestBed.createComponent(Diagnostics);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const click = async (id: string) => {
    q(id).click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  return { bridge, q, click };
}

describe('Diagnostics', () => {
  it('says what is and is not included', async () => {
    const { q } = await render(() => Promise.resolve({ saved: false }));
    expect(q('diagnostics-included').textContent).toContain('log files');
    expect(q('diagnostics-excluded').textContent).toContain('API keys');
    expect(q('diagnostics-excluded').textContent).toContain('transcripts');
  });

  it('exports and shows the saved file name', async () => {
    const { q, click, bridge } = await render(() =>
      Promise.resolve({ saved: true, fileName: 'AI-Workflow-diagnostics-x.zip' }),
    );
    await click('export-diagnostics');
    expect(bridge.diagnostics.export).toHaveBeenCalledTimes(1);
    expect(q('export-status').textContent).toContain('Saved');
    expect(q('export-status').textContent).toContain('AI-Workflow-diagnostics-x.zip');
  });

  it('cancelled save dialog shows nothing', async () => {
    const { q, click } = await render(() => Promise.resolve({ saved: false }));
    await click('export-diagnostics');
    expect(q('export-status').textContent!.trim()).toBe('');
  });

  it('shows a plain error when saving fails', async () => {
    const { q, click } = await render(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'diagnostics:export': Error: The diagnostics file could not be saved. Try another folder.",
        ),
      ),
    );
    await click('export-diagnostics');
    expect(q('export-status').textContent).toContain('Not saved');
    expect(q('export-status').textContent).toContain(
      'The diagnostics file could not be saved. Try another folder.',
    );
  });

  it('opens the logs folder', async () => {
    const { click, bridge } = await render(() => Promise.resolve({ saved: false }));
    await click('open-logs');
    expect(bridge.diagnostics.openLogs).toHaveBeenCalled();
  });
});
