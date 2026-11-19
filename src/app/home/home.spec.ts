import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AiWorkflowApi, AppInfo } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE } from '../core/electron-api';
import { Home } from './home';

const info: AppInfo = {
  name: 'AI Workflow',
  version: '0.1.0',
  platform: 'darwin',
  electron: '45.3.3',
  chrome: '142.0.0',
  database: { status: 'ok', schemaVersion: 1, encrypted: true },
};

async function render(bridge: Pick<AiWorkflowApi, 'app'> | null) {
  TestBed.configureTestingModule({
    imports: [Home],
    providers: [provideRouter([]), { provide: AI_WORKFLOW_BRIDGE, useValue: bridge }],
  });
  const fixture = TestBed.createComponent(Home);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Home', () => {
  it('shows app info from the main process', async () => {
    const el = await render({ app: { getInfo: () => Promise.resolve(info) } });
    expect(el.querySelector('h1')?.textContent).toContain('AI Workflow');
    expect(el.querySelector('[data-testid="app-version"]')?.textContent?.trim()).toBe('0.1.0');
    expect(el.querySelector('[data-testid="app-platform"]')?.textContent?.trim()).toBe('darwin');
    expect(el.querySelector('[data-testid="db-status"]')?.textContent).toContain(
      'Encrypted · schema v1',
    );
  });

  it('shows an error when the bridge is missing', async () => {
    const el = await render(null);
    expect(el.querySelector('[data-testid="app-info-error"]')?.textContent).toContain(
      'desktop bridge is not available',
    );
  });

  it('shows an error when the IPC call fails', async () => {
    const el = await render({ app: { getInfo: () => Promise.reject(new Error('boom')) } });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('boom');
  });
});
