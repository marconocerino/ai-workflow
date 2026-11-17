import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ElectronApi } from '../../core/electron-api';

/** Settings shell: sidebar with sections (more arrive with VAI-204) + the selected page. */
@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-layout.html',
  styleUrl: './settings-layout.scss',
})
export class SettingsLayout {
  protected readonly version = signal<string | null>(null);

  constructor() {
    inject(ElectronApi)
      .getAppInfo()
      .then((info) => this.version.set(info.version))
      .catch(() => this.version.set(null));
  }
}
