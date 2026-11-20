import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { KNOWN_APPS } from '../../../../shared/apps';
import {
  DEFAULT_STYLE_RULES,
  MAX_APP_NAME,
  MAX_STYLE_RULES,
  STYLE_LABELS,
  STYLES,
  type StyleName,
  type StyleRule,
} from '../../../../shared/settings';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { Icon } from '../../ui';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

export const STYLE_HELP: Record<StyleName, string> = {
  professional: 'Careful punctuation and capitals, slang written out.',
  email: 'Your greeting, paragraphs and sign-off on their own lines. Adds none you didn’t say.',
  casual: 'Keeps contractions and a relaxed tone; light punctuation.',
  code: 'File names, commands and identifiers written as code.',
  neutral: 'Just the cleanup level, nothing extra.',
};

/**
 * Settings → Style per app (VAI-308): which cleanup style each app gets. Apps are matched by the
 * short name shown in the dictation bar ("Outlook"); apps without a rule use Neutral.
 */
@Component({
  selector: 'app-style-settings',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SettingsHeader,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './style.html',
  styleUrl: './style.scss',
})
export class StyleSettings {
  private readonly api = inject(SettingsApi);
  private readonly status = inject(SaveStatus);
  protected readonly styles = STYLES;
  protected readonly labels = STYLE_LABELS;
  protected readonly help = STYLE_HELP;
  protected readonly knownApps = KNOWN_APPS;
  protected readonly maxName = MAX_APP_NAME;
  protected readonly rules = signal<StyleRule[]>([]);
  protected readonly cleanupOff = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly addError = signal<string | null>(null);
  protected readonly newApp = new FormControl('', { nonNullable: true });
  protected readonly newStyle = new FormControl<StyleName>('professional', { nonNullable: true });

  constructor() {
    void this.load();
  }

  protected add(): void {
    const app = this.newApp.value.trim();
    this.addError.set(null);
    if (!app) {
      this.addError.set('Type an app name, e.g. Notion.');
      return;
    }
    if (app.length > MAX_APP_NAME) {
      this.addError.set(`Keep it under ${MAX_APP_NAME + 1} characters.`);
      return;
    }
    if (this.rules().some((r) => r.app.toLowerCase() === app.toLowerCase())) {
      this.addError.set(`${app} already has a style. Change it in the list.`);
      return;
    }
    if (this.rules().length >= MAX_STYLE_RULES) {
      this.addError.set(`Up to ${MAX_STYLE_RULES} apps.`);
      return;
    }
    void this.save([...this.rules(), { app, style: this.newStyle.value }]).then((ok) => {
      if (ok) this.newApp.setValue('');
    });
  }

  protected setStyle(index: number, style: StyleName): void {
    void this.save(this.rules().map((r, i) => (i === index ? { ...r, style } : r)));
  }

  protected remove(index: number): void {
    void this.save(this.rules().filter((_, i) => i !== index));
  }

  protected restoreDefaults(): void {
    void this.save(DEFAULT_STYLE_RULES.map((r) => ({ ...r })));
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.api.get();
      this.rules.set(settings.dictation.styles);
      this.cleanupOff.set(settings.dictation.cleanup === 'off');
      this.loaded.set(true);
    } catch (e) {
      this.error.set(`Couldn't load settings: ${ipcErrorMessage(e)}`);
    }
  }

  /** Saves the whole list; shows what was actually saved (or the old list on failure). */
  private async save(rules: StyleRule[]): Promise<boolean> {
    this.error.set(null);
    const before = this.rules();
    this.rules.set(rules);
    try {
      const saved = await this.status.track(this.api.update({ dictation: { styles: rules } }));
      this.rules.set(saved.dictation.styles);
      return true;
    } catch (e) {
      this.rules.set(before);
      this.error.set(ipcErrorMessage(e));
      return false;
    }
  }
}
