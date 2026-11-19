import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import type { DictationMode } from '../../../../shared/settings';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { Icon } from '../../ui/icon/icon';
import { Keys } from '../../ui/keys/keys';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

/**
 * Settings → Dictation (VAI-204, design: Settings@1x.png). How-it-works card and the shortcut
 * mode. The Microphone (VAI-302) and Startup (VAI-205) sections are added by their stories.
 */
@Component({
  selector: 'app-dictation-settings',
  imports: [ReactiveFormsModule, MatRadioModule, SettingsHeader, Keys, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dictation.html',
  styleUrl: './dictation.scss',
})
export class DictationSettings {
  private readonly api = inject(SettingsApi);
  private readonly status = inject(SaveStatus);

  protected readonly mode = new FormControl<DictationMode>('hold', { nonNullable: true });
  /** The mode as a signal, for the "how it works" card (the form control isn't reactive). */
  protected readonly current = signal<DictationMode>('hold');
  protected readonly toggleShortcut = signal<string[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.status.reset();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.api.get();
      this.mode.setValue(settings.dictation.mode, { emitEvent: false });
      this.current.set(settings.dictation.mode);
      this.toggleShortcut.set(settings.dictation.toggleShortcut);
      this.loaded.set(true);
      this.mode.valueChanges.subscribe((mode) => {
        this.current.set(mode);
        void this.saveMode(mode);
      });
    } catch (e) {
      this.error.set(`Couldn't load settings: ${ipcErrorMessage(e)}`);
    }
  }

  private async saveMode(mode: DictationMode): Promise<void> {
    this.error.set(null);
    try {
      await this.status.track(this.api.update({ dictation: { mode } }));
    } catch (e) {
      this.error.set(ipcErrorMessage(e));
    }
  }
}
