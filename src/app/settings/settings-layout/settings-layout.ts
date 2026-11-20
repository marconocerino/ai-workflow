import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { HotkeyStatus } from '../../../../shared/ipc-contract';
import { ElectronApi } from '../../core/electron-api';
import { HotkeyApi } from '../../core/hotkey-api';
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
  protected readonly hotkey = signal<HotkeyStatus | null>(null);

  private readonly hotkeyApi = inject(HotkeyApi);
  private readonly status = inject(SaveStatus);

  constructor() {
    inject(ElectronApi)
      .getAppInfo()
      .then((info) => this.version.set(info.version))
      .catch(() => this.version.set(null));
    // Hotkey status for the card, again after every save (mode or shortcut may have changed).
    effect(() => {
      const state = this.status.state();
      if (state === 'idle' || state === 'saved' || state === 'error') void this.loadHotkey();
    });
  }

  /** What the card says: is dictation ready, and how do you start it? */
  protected card(h: HotkeyStatus): {
    ready: boolean;
    title: string;
    how: 'hold' | 'toggle' | null;
  } {
    if (h.mode === 'hold' && h.holdCtrl === 'ready') {
      return { ready: true, title: 'Ready', how: 'hold' };
    }
    if (h.toggleActive) {
      return {
        ready: true,
        title: h.mode === 'hold' ? 'Ready (Hold Ctrl unavailable)' : 'Ready',
        how: 'toggle',
      };
    }
    return { ready: false, title: 'Not active', how: null };
  }

  private async loadHotkey(): Promise<void> {
    try {
      this.hotkey.set(await this.hotkeyApi.status());
    } catch {
      this.hotkey.set(null);
    }
  }
}
