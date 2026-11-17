import { Injectable, inject } from '@angular/core';
import type { AiService, ConnectionResult } from '../../../shared/ai';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';

/** AI server calls. They run in the main process; the renderer never talks to servers itself. */
@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  testConnection(service: AiService): Promise<ConnectionResult> {
    return this.bridge
      ? this.bridge.ai.testConnection(service)
      : Promise.reject(new DesktopBridgeUnavailableError());
  }
}
