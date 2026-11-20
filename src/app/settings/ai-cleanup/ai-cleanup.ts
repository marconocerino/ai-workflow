import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import type { CleanupLevel } from '../../../../shared/settings';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

interface LevelOption {
  value: CleanupLevel;
  title: string;
  desc: string;
  /** What you said → what gets pasted. */
  before: string;
  after: string;
}

export const CLEANUP_OPTIONS: readonly LevelOption[] = [
  {
    value: 'off',
    title: 'Off',
    desc: 'Pastes exactly what was heard.',
    before: 'um so can we uh move the call to friday',
    after: 'um so can we uh move the call to friday',
  },
  {
    value: 'light',
    title: 'Light',
    desc: 'Punctuation, capitals, and filler words removed. Nothing else changes.',
    before: 'um so can we uh move the call to friday',
    after: 'So can we move the call to Friday?',
  },
  {
    value: 'polished',
    title: 'Polished',
    desc: 'Also drops false starts and repeats, keeps your corrections, adds paragraphs.',
    before: 'can we move the the call to thursday no friday',
    after: 'Can we move the call to Friday?',
  },
];

/**
 * Settings → AI cleanup (VAI-307): how much the LLM tidies dictated text before it's pasted.
 * Cleanup only removes words and adds punctuation; if it fails or takes over 3 s, the raw text
 * is pasted (D-024).
 */
@Component({
  selector: 'app-ai-cleanup-settings',
  imports: [ReactiveFormsModule, MatRadioModule, RouterLink, SettingsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-cleanup.html',
  styleUrl: './ai-cleanup.scss',
})
export class AiCleanupSettings {
  private readonly api = inject(SettingsApi);
  private readonly status = inject(SaveStatus);
  protected readonly options = CLEANUP_OPTIONS;
  protected readonly level = new FormControl<CleanupLevel>('light', { nonNullable: true });
  protected readonly loaded = signal(false);
  protected readonly llmReady = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.api.get();
      this.level.setValue(settings.dictation.cleanup, { emitEvent: false });
      this.llmReady.set(!!settings.ai.llm.baseUrl && !!settings.ai.llm.model);
      this.loaded.set(true);
      this.level.valueChanges.subscribe((cleanup) => void this.save(cleanup));
    } catch (e) {
      this.error.set(`Couldn't load settings: ${ipcErrorMessage(e)}`);
    }
  }

  private async save(cleanup: CleanupLevel): Promise<void> {
    this.error.set(null);
    try {
      await this.status.track(this.api.update({ dictation: { cleanup } }));
    } catch (e) {
      this.error.set(ipcErrorMessage(e));
    }
  }
}
