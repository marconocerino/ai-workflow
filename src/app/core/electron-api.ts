import { Injectable, InjectionToken, inject } from '@angular/core';
import type { AiWorkflowApi, AppInfo } from '../../../shared/ipc-contract';

/**
 * The bridge the preload puts on `window.aiWorkflow`, or null when the renderer runs
 * outside Electron (plain `ng serve` in a browser, unit tests).
 */
export const AI_WORKFLOW_BRIDGE = new InjectionToken<AiWorkflowApi | null>('AI_WORKFLOW_BRIDGE', {
  providedIn: 'root',
  factory: () => (globalThis as { aiWorkflow?: AiWorkflowApi }).aiWorkflow ?? null,
});

export class DesktopBridgeUnavailableError extends Error {
  constructor() {
    super('The desktop bridge is not available. Run the app with `npm start`.');
    this.name = 'DesktopBridgeUnavailableError';
  }
}

/** The only place Angular code talks to the main process. */
@Injectable({ providedIn: 'root' })
export class ElectronApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  /** False when running in a normal browser. */
  readonly isDesktop = this.bridge !== null;

  getAppInfo(): Promise<AppInfo> {
    if (!this.bridge) return Promise.reject(new DesktopBridgeUnavailableError());
    return this.bridge.app.getInfo();
  }
}
