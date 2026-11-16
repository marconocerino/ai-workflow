import { Injectable, inject } from '@angular/core';
import type { SecretName, Settings, SettingsPatch } from '../../../shared/settings';
import { AI_WORKFLOW_BRIDGE, DesktopBridgeUnavailableError } from './electron-api';

/**
 * Settings and secrets from the main process. Secret values can be saved, checked or cleared,
 * but are never readable here.
 */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);

  get(): Promise<Settings> {
    return this.bridge ? this.bridge.settings.get() : unavailable();
  }

  /** Validated in main; rejects with a message naming the invalid field. */
  update(patch: SettingsPatch): Promise<Settings> {
    return this.bridge ? this.bridge.settings.update(patch) : unavailable();
  }

  setSecret(name: SecretName, value: string): Promise<void> {
    return this.bridge ? this.bridge.secrets.set(name, value) : unavailable();
  }

  hasSecret(name: SecretName): Promise<boolean> {
    return this.bridge ? this.bridge.secrets.has(name) : unavailable();
  }

  clearSecret(name: SecretName): Promise<void> {
    return this.bridge ? this.bridge.secrets.clear(name) : unavailable();
  }
}

function unavailable(): Promise<never> {
  return Promise.reject(new DesktopBridgeUnavailableError());
}
