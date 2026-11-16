import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { AiService, ConnectionResult } from '../../../../shared/ai';
import type { AiEndpointSettings, SecretName } from '../../../../shared/settings';
import { AiApi } from '../../core/ai-api';
import { fieldError, ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { errorText, serverUrlValidator } from '../validators';

export type SaveState = 'saving' | 'saved' | 'error';
type Field = keyof AiEndpointSettings;

/** One AI server: base URL, model, API key and a connection test. Fields save on blur. */
@Component({
  selector: 'app-endpoint-card',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './endpoint-card.html',
  styleUrl: './endpoint-card.scss',
})
export class EndpointCard implements OnInit {
  private readonly settingsApi = inject(SettingsApi);
  private readonly aiApi = inject(AiApi);

  readonly service = input.required<AiService>();
  readonly heading = input.required<string>();
  readonly description = input('');
  readonly urlPlaceholder = input('https://llm.company.internal/v1');
  readonly modelPlaceholder = input('');
  readonly initial = input.required<AiEndpointSettings>();
  readonly initialHasKey = input.required<boolean>();
  readonly saveState = output<SaveState>();

  protected readonly baseUrl = new FormControl('', {
    nonNullable: true,
    validators: [serverUrlValidator, Validators.maxLength(2000)],
  });
  protected readonly model = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(200)],
  });
  protected readonly key = new FormControl('', { nonNullable: true });

  protected readonly hasKey = signal(false);
  protected readonly replacingKey = signal(false);
  protected readonly keyBusy = signal(false);
  protected readonly keyError = signal<string | null>(null);
  protected readonly testing = signal(false);
  protected readonly result = signal<ConnectionResult | null>(null);
  protected readonly errorText = errorText;

  private pendingSave: Promise<void> = Promise.resolve();

  ngOnInit(): void {
    this.baseUrl.setValue(this.initial().baseUrl);
    this.model.setValue(this.initial().model);
    this.hasKey.set(this.initialHasKey());
  }

  protected get secretName(): SecretName {
    return this.service() === 'asr' ? 'ai.asr.apiKey' : 'ai.llm.apiKey';
  }

  protected id(suffix: string): string {
    return `${this.service()}-${suffix}`;
  }

  /** Save one field if it changed and passes the local checks. */
  save(field: Field): Promise<void> {
    const control = field === 'baseUrl' ? this.baseUrl : this.model;
    if (!control.dirty || control.invalid) return this.pendingSave;
    const value = control.value.trim();
    const service = this.service();
    this.saveState.emit('saving');
    this.pendingSave = this.settingsApi
      .update({ ai: { [service]: { [field]: value } } })
      .then((saved) => {
        control.setValue(saved.ai[service][field]);
        control.markAsPristine();
        this.result.set(null);
        this.saveState.emit('saved');
      })
      .catch((e: unknown) => {
        control.setErrors({
          server: fieldError(e, `ai.${service}.${field}`) ?? ipcErrorMessage(e),
        });
        control.markAsTouched();
        this.saveState.emit('error');
      });
    return this.pendingSave;
  }

  async saveKey(): Promise<void> {
    const value = this.key.value.trim();
    if (!value) return;
    this.keyBusy.set(true);
    this.keyError.set(null);
    try {
      await this.settingsApi.setSecret(this.secretName, value);
      this.key.reset();
      this.hasKey.set(true);
      this.replacingKey.set(false);
      this.result.set(null);
    } catch (e) {
      this.keyError.set(ipcErrorMessage(e));
    } finally {
      this.keyBusy.set(false);
    }
  }

  async removeKey(): Promise<void> {
    this.keyBusy.set(true);
    this.keyError.set(null);
    try {
      await this.settingsApi.clearSecret(this.secretName);
      this.hasKey.set(false);
      this.result.set(null);
    } catch (e) {
      this.keyError.set(ipcErrorMessage(e));
    } finally {
      this.keyBusy.set(false);
    }
  }

  startReplace(): void {
    this.key.reset();
    this.keyError.set(null);
    this.replacingKey.set(true);
  }

  cancelReplace(): void {
    this.key.reset();
    this.replacingKey.set(false);
  }

  async test(): Promise<void> {
    this.testing.set(true);
    this.result.set(null);
    try {
      // Save anything still being typed first, so the test uses what's on screen.
      await this.save('baseUrl');
      await this.save('model');
      if (this.baseUrl.invalid || this.model.invalid) {
        this.result.set({
          ok: false,
          code: 'bad-response',
          message: 'Fix the fields above first.',
        });
        return;
      }
      this.result.set(await this.aiApi.testConnection(this.service()));
    } catch (e) {
      this.result.set({ ok: false, code: 'unreachable', message: ipcErrorMessage(e) });
    } finally {
      this.testing.set(false);
    }
  }
}
