import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ElectronApi } from '../../core/electron-api';
import { Icon } from '../../ui/icon/icon';
import { Brand } from '../../shell/brand/brand';

/** Settings shell: sidebar with sections (more arrive with VAI-204) + the selected page. */
@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Brand],
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
