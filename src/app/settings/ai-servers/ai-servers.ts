import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Settings } from '../../../../shared/settings';
import { fieldError, ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { EndpointCard, type SaveState } from '../endpoint-card/endpoint-card';
import { errorText } from '../validators';

interface Loaded {
  settings: Settings;
  hasAsrKey: boolean;
  hasLlmKey: boolean;
}

/** Settings → AI servers (VAI-113): where the app's speech-to-text and LLM servers are set. */
@Component({
  selector: 'app-ai-servers',
  imports: [EndpointCard, ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-servers.html',
  styleUrl: './ai-servers.scss',
})
export class AiServers {
  private readonly api = inject(SettingsApi);

  protected readonly loaded = signal<Loaded | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveState = signal<SaveState | null>(null);
  protected readonly errorText = errorText;

  protected readonly timeoutSeconds = new FormControl(30, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.min(1),
      Validators.max(600),
      Validators.pattern(/^\d+$/),
    ],
  });
  protected readonly retries = new FormControl(2, {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.min(0),
      Validators.max(10),
      Validators.pattern(/^\d+$/),
    ],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const [settings, hasAsrKey, hasLlmKey] = await Promise.all([
        this.api.get(),
        this.api.hasSecret('ai.asr.apiKey'),
        this.api.hasSecret('ai.llm.apiKey'),
      ]);
      this.timeoutSeconds.setValue(Math.round(settings.ai.timeoutMs / 1000));
      this.retries.setValue(settings.ai.retries);
      this.loaded.set({ settings, hasAsrKey, hasLlmKey });
    } catch (e) {
      this.loadError.set(ipcErrorMessage(e));
    }
  }

  protected onSaveState(state: SaveState): void {
    this.saveState.set(state);
  }

  async saveTimeout(): Promise<void> {
    const c = this.timeoutSeconds;
    if (!c.dirty || c.invalid) return;
    await this.saveAdvanced(c, 'ai.timeoutMs', { ai: { timeoutMs: Number(c.value) * 1000 } });
  }

  async saveRetries(): Promise<void> {
    const c = this.retries;
    if (!c.dirty || c.invalid) return;
    await this.saveAdvanced(c, 'ai.retries', { ai: { retries: Number(c.value) } });
  }

  private async saveAdvanced(
    control: FormControl<number>,
    path: string,
    patch: Parameters<SettingsApi['update']>[0],
  ): Promise<void> {
    this.saveState.set('saving');
    try {
      await this.api.update(patch);
      control.markAsPristine();
      this.saveState.set('saved');
    } catch (e) {
      control.setErrors({ server: fieldError(e, path) ?? ipcErrorMessage(e) });
      control.markAsTouched();
      this.saveState.set('error');
    }
  }
}
