import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { DictationMode } from '../../../../shared/settings';
import { ElectronApi } from '../../core/electron-api';
import { SettingsApi } from '../../core/settings-api';
import { Brand } from '../../shell/brand/brand';
import { Icon, type IconName, Keys } from '../../ui';
import { SaveStatus } from '../shared/save-status';

interface Section {
  path: string;
  label: string;
  icon: IconName;
}

/** Order of the design, plus "AI servers" (D-009) after Transcription. */
export const SETTINGS_SECTIONS: readonly Section[] = [
  { path: 'dictation', label: 'Dictation', icon: 'mic' },
  { path: 'transcription', label: 'Transcription', icon: 'waveform' },
  { path: 'ai-servers', label: 'AI servers', icon: 'server' },
  { path: 'ai-cleanup', label: 'AI cleanup', icon: 'sparkles' },
  { path: 'vocabulary', label: 'Vocabulary', icon: 'book' },
  { path: 'style', label: 'Style per app', icon: 'layout-grid' },
  { path: 'about', label: 'About & diagnostics', icon: 'activity' },
];

/** Settings shell (VAI-204, design: Settings@1x.png): status card, sections, the page. */
@Component({
  selector: 'app-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, Icon, Keys],
  // One save status for the whole Settings area; pages report to it, their header shows it.
  providers: [SaveStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-layout.html',
  styleUrl: './settings-layout.scss',
})
export class SettingsLayout {
  protected readonly sections = SETTINGS_SECTIONS;
  protected readonly version = signal<string | null>(null);
  protected readonly mode = signal<DictationMode>('hold');
  protected readonly toggleShortcut = signal<string[]>(['Ctrl', 'Shift', 'Space']);

  private readonly settings = inject(SettingsApi);
  private readonly status = inject(SaveStatus);

  constructor() {
    inject(ElectronApi)
      .getAppInfo()
      .then((info) => this.version.set(info.version))
      .catch(() => this.version.set(null));
    // Load the shortcut for the status card, and again after every save (it may have changed).
    effect(() => {
      if (this.status.state() === 'idle' || this.status.state() === 'saved')
        void this.loadShortcut();
    });
  }

  private async loadShortcut(): Promise<void> {
    try {
      const s = await this.settings.get();
      this.mode.set(s.dictation.mode);
      this.toggleShortcut.set(s.dictation.toggleShortcut);
    } catch {
      // Keep the defaults; the page itself shows load errors.
    }
  }
}
