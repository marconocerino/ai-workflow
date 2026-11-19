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
 * Diagnostics export card (VAI-107): one-click export of logs and non-secret settings for
 * support. Shown on Settings → About & diagnostics (VAI-204).
 */
@Component({
  selector: 'app-diagnostics-card',
  imports: [MatButtonModule, Chip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagnostics.html',
  styleUrl: './diagnostics.scss',
})
export class DiagnosticsCard {
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
