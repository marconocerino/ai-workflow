import { Injectable, inject } from '@angular/core';
import type { DiagnosticsExportResult } from '../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';

/** Diagnostics export and the logs folder (VAI-107). Files are written by the main process. */
@Injectable({ providedIn: 'root' })
export class DiagnosticsApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  export(): Promise<DiagnosticsExportResult> {
    return this.bridge
      ? this.bridge.diagnostics.export()
      : Promise.reject(new DesktopBridgeUnavailableError());
  }

  openLogs(): Promise<void> {
    return this.bridge
      ? this.bridge.diagnostics.openLogs()
      : Promise.reject(new DesktopBridgeUnavailableError());
  }
}
