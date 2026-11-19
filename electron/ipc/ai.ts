import type { AiHttpClient } from '../ai/ai-http';
import { testConnection } from '../ai/connection-test';
import type { ScopedLogger } from '../logging/logger';
import type { SecretStore } from '../settings/secret-store';
import type { SettingsStore } from '../settings/settings-store';
import type { createIpcRegistrar } from './handle';

type Handle = ReturnType<typeof createIpcRegistrar>;

export function registerAiIpc(
  handle: Handle,
  client: AiHttpClient,
  settings: SettingsStore,
  secrets: SecretStore,
  logger: ScopedLogger,
): void {
  handle('ai:test-connection', async (_event, service) => {
    const result = await testConnection(service, client, () => settings.get(), secrets);
    const log = result.ok ? logger.info : logger.warn;
    log('Connection test', { service, result: result.code, latencyMs: result.latencyMs });
    return result;
  });
}
