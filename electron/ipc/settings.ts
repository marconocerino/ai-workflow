import { InvalidSecretError, type SecretStore, isSecretName } from '../settings/secret-store';
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
  // Only renderer-settable names; main-only secrets (e.g. the database key) are refused here.
  const rendererName = (name: unknown) => {
    if (!isSecretName(name)) throw new InvalidSecretError('Unknown secret name.');
    return name;
  };
  handle('secrets:set', async (_event, payload) => {
    const p = payload as { name?: unknown; value?: unknown } | null | undefined;
    await secrets.set(rendererName(p?.name), p?.value);
  });
  handle('secrets:has', (_event, name) => secrets.has(rendererName(name)));
  handle('secrets:clear', (_event, name) => secrets.clear(rendererName(name)));
}
