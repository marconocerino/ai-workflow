import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi, AppInfo } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError, ElectronApi } from './electron-api';

const info: AppInfo = {
  name: 'AI Workflow',
  version: '0.1.0',
  platform: 'win32',
  electron: '45.3.3',
  chrome: '142.0.0',
  database: { status: 'ok', schemaVersion: 1, encrypted: true },
};

function setup(bridge: Pick<AiWorkflowApi, 'app'> | null): ElectronApi {
  TestBed.configureTestingModule({
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge }],
  });
  return TestBed.inject(ElectronApi);
}

describe('ElectronApi', () => {
  it('calls the preload bridge', async () => {
    const getInfo = vi.fn().mockResolvedValue(info);
    const api = setup({ app: { getInfo } });
    expect(api.isDesktop).toBe(true);
    await expect(api.getAppInfo()).resolves.toEqual(info);
    expect(getInfo).toHaveBeenCalledOnce();
  });

  it('rejects clearly when running outside Electron', async () => {
    const api = setup(null);
    expect(api.isDesktop).toBe(false);
    await expect(api.getAppInfo()).rejects.toBeInstanceOf(DesktopBridgeUnavailableError);
  });

  it('defaults to null when window.aiWorkflow is missing', () => {
    expect(TestBed.inject(AI_WORKFLOW_BRIDGE)).toBeNull();
  });
});
