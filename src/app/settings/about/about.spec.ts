import { TestBed } from '@angular/core/testing';
import type { FeatureState } from '../../../../shared/features';
import type { AiWorkflowApi, AppInfo } from '../../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { About } from './about';

const info: AppInfo = {
  name: 'AI Workflow',
  version: '0.2.0',
  platform: 'win32',
  electron: '45.3.3',
  chrome: '156',
  database: { status: 'ok', schemaVersion: 1, encrypted: true },
};

async function render(features: FeatureState) {
  const bridge = {
    app: { getInfo: () => Promise.resolve(info) },
    features: { get: () => Promise.resolve(features) },
    diagnostics: { export: vi.fn(), openLogs: vi.fn() },
  } satisfies Pick<AiWorkflowApi, 'app' | 'features' | 'diagnostics'>;
  TestBed.configureTestingModule({
    imports: [About],
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }, SaveStatus],
  });
  const fixture = TestBed.createComponent(About);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) =>
    el.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
  return { el, q };
}

describe('About', () => {
  it('shows version, database and the diagnostics export', async () => {
    const { el, q } = await render({
      flags: { meetings: false, agents: false, voiceprints: false },
      sources: ['defaults'],
    });
    expect(q('about-version')).toBe('0.2.0');
    expect(q('about-database')).toContain('Encrypted · schema v1');
    expect(q('about-features')).toMatch(/^None\s*\(default\)$/);
    expect(el.querySelector('[data-testid="export-diagnostics"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="save-status"]')).toBeNull();
  });

  it('names only the features that are on, and where the policy came from', async () => {
    const { q } = await render({
      flags: { meetings: true, agents: false, voiceprints: false },
      sources: ['registry'],
    });
    expect(q('about-features')).toMatch(/^Meetings\s*\(IT policy\)$/);
  });
});
