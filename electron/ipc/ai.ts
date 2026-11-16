import type { AiHttpClient } from '../ai/ai-http';
import { testConnection } from '../ai/connection-test';
import type { SecretStore } from '../settings/secret-store';
import type { SettingsStore } from '../settings/settings-store';
import type { createIpcRegistrar } from './handle';

type Handle = ReturnType<typeof createIpcRegistrar>;

export function registerAiIpc(
  handle: Handle,
  client: AiHttpClient,
  settings: SettingsStore,
  secrets: SecretStore,
): void {
  handle('ai:test-connection', (_event, service) =>
    testConnection(service, client, () => settings.get(), secrets),
  );
}
