import type { SecretStore } from '../settings/secret-store';
import type { SettingsStore } from '../settings/settings-store';
import type { createIpcRegistrar } from './handle';

type Handle = ReturnType<typeof createIpcRegistrar>;

/**
 * Settings + secrets channels. Payloads come from the renderer, so the stores validate them at
 * runtime as well (types alone don't protect against a compromised renderer).
 * Secret values are accepted but never returned.
 */
export function registerSettingsIpc(
  handle: Handle,
  settings: SettingsStore,
  secrets: SecretStore,
): void {
  handle('settings:get', () => settings.get());
  handle('settings:update', (_event, patch) => settings.update(patch));
  handle('secrets:set', (_event, payload) => {
    const p = payload as { name?: unknown; value?: unknown } | null | undefined;
    secrets.set(p?.name, p?.value);
  });
  handle('secrets:has', (_event, name) => secrets.has(name));
  handle('secrets:clear', (_event, name) => secrets.clear(name));
}
