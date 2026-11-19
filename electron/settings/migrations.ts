import { isObject } from './schema';

/**
 * Migrations upgrade stored settings one version at a time.
 * `migrations[n]` turns version n data into version n + 1 data.
 * To change the shape: bump SETTINGS_VERSION, add `migrations[old]`, add a test.
 * Never edit a migration that has shipped.
 */
export const migrations: Record<number, (data: unknown) => unknown> = {
  // v0: a plain settings object without the { version, data } envelope (pre-release builds).
  // Same field names, so the data carries over as-is; validation drops anything unknown.
  0: (data) => data,
  // v1 → v2 (VAI-204): adds `dictation` (mode, toggle shortcut). Everything in v1 is kept as-is;
  // the new section gets its defaults from validation.
  1: (data) => data,
};

export class SettingsMigrationError extends Error {
  constructor(from: number) {
    super(`No settings migration from version ${from}`);
    this.name = 'SettingsMigrationError';
  }
}

/** Run every migration from `fromVersion` up to `toVersion`. */
export function migrate(
  data: unknown,
  fromVersion: number,
  toVersion: number,
  steps: Record<number, (data: unknown) => unknown> = migrations,
): unknown {
  let current = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = steps[v];
    if (!step) throw new SettingsMigrationError(v);
    current = step(current);
  }
  return current;
}

/** Split a stored file into version + data. Files without an envelope are version 0. */
export function readEnvelope(parsed: unknown): { version: number; data: unknown } | null {
  if (!isObject(parsed)) return null;
  if (!('version' in parsed)) return { version: 0, data: parsed };
  const version = parsed['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return null;
  return { version, data: parsed['data'] };
}
