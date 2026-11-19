import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { FeatureState } from '../../../../shared/features';
import type { AppInfo } from '../../../../shared/ipc-contract';
import { AI_WORKFLOW_BRIDGE, ElectronApi } from '../../core/electron-api';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { Chip } from '../../ui/chip/chip';
import { DiagnosticsCard } from '../diagnostics/diagnostics';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

const SOURCE_LABEL: Record<string, string> = {
  defaults: 'default',
  registry: 'IT policy',
  file: 'policy file',
};

/** Settings → About & diagnostics (VAI-204): app facts for support + diagnostics export. */
@Component({
  selector: 'app-about',
  imports: [SettingsHeader, Chip, DiagnosticsCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  private readonly api = inject(ElectronApi);
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  protected readonly info = signal<AppInfo | null>(null);
  protected readonly features = signal<FeatureState | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(SaveStatus).reset();
    void this.load();
  }

  protected featureList(state: FeatureState): { name: string; on: boolean }[] {
    // Only switched-on features are named, so hidden ones leave no trace (VAI-109).
    return Object.entries(state.flags)
      .filter(([, on]) => on)
      .map(([name, on]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), on }));
  }

  protected sourceLabel(state: FeatureState): string {
    return state.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ');
  }

  private async load(): Promise<void> {
    try {
      const [info, features] = await Promise.all([
        this.api.getAppInfo(),
        this.bridge ? this.bridge.features.get() : Promise.resolve(null),
      ]);
      this.info.set(info);
      this.features.set(features);
    } catch (e) {
      this.error.set(ipcErrorMessage(e));
    }
  }
}
