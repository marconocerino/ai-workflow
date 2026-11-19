import { ErrorHandler, Injectable, inject } from '@angular/core';
import { AI_WORKFLOW_BRIDGE } from './electron-api';

/**
 * Angular's error handler plus a copy to the app log (VAI-107). Sends only the error's name,
 * message and stack frames; main caps, scrubs and rate-limits them. Never throws.
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  override handleError(error: unknown): void {
    super.handleError(error);
    if (!this.bridge) return;
    const e = error instanceof Error ? error : new Error(String(error));
    try {
      void this.bridge.log
        .rendererError({
          name: e.name,
          message: e.message,
          ...(e.stack ? { stack: e.stack } : {}),
        })
        .catch(() => undefined);
    } catch {
      // Reporting must never cause another error.
    }
  }
}
