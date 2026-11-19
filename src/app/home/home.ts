import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import type { AppInfo } from '../../../shared/ipc-contract';
import { ElectronApi } from '../core/electron-api';
import { FeatureFlags } from '../core/feature-flags';
import { Chip } from '../ui';

/** Placeholder start page (VAI-101): proves Material and the typed IPC round trip work. */
@Component({
  selector: 'app-home',
  imports: [MatButtonModule, RouterLink, Chip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly api = inject(ElectronApi);
  protected readonly features = inject(FeatureFlags);

  protected readonly info = signal<AppInfo | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.info.set(await this.api.getAppInfo());
    } catch (e) {
      this.info.set(null);
      this.error.set(e instanceof Error ? e.message : 'Could not reach the desktop app.');
    } finally {
      this.loading.set(false);
    }
  }
}
