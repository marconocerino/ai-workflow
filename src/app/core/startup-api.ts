import { Injectable, inject } from '@angular/core';
import type { StartupState } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';

/** Start at sign-in (VAI-205). The main process owns the OS login entry. */
@Injectable({ providedIn: 'root' })
export class StartupApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  get(): Promise<StartupState> {
    return this.bridge
      ? this.bridge.startup.get()
      : Promise.resolve({ available: false, openAtLogin: false });
  }

  set(openAtLogin: boolean): Promise<StartupState> {
    return this.bridge
      ? this.bridge.startup.set(openAtLogin)
      : Promise.reject(new DesktopBridgeUnavailableError());
  }
}
