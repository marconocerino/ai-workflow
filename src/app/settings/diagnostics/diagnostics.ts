import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DiagnosticsApi } from '../../core/diagnostics-api';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { Chip } from '../../ui/chip/chip';
import { Icon } from '../../ui/icon/icon';

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'saved'; fileName: string }
  | { kind: 'error'; message: string };

/**
 * Settings → Diagnostics (VAI-107): one-click export of logs and non-secret settings for
 * support. VAI-204 folds this into "About & diagnostics".
 */
@Component({
  selector: 'app-diagnostics',
  imports: [MatButtonModule, Chip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagnostics.html',
  styleUrl: './diagnostics.scss',
})
export class Diagnostics {
  private readonly api = inject(DiagnosticsApi);

  protected readonly state = signal<ExportState>({ kind: 'idle' });
  protected readonly logsError = signal<string | null>(null);

  protected async exportDiagnostics(): Promise<void> {
    this.state.set({ kind: 'working' });
    try {
      const result = await this.api.export();
      this.state.set(
        result.saved ? { kind: 'saved', fileName: result.fileName } : { kind: 'idle' },
      );
    } catch (e) {
      this.state.set({ kind: 'error', message: ipcErrorMessage(e) });
    }
  }

  protected async openLogs(): Promise<void> {
    this.logsError.set(null);
    try {
      await this.api.openLogs();
    } catch (e) {
      this.logsError.set(ipcErrorMessage(e));
    }
  }
}
