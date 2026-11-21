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
  // v2 → v3 (VAI-302): adds dictation.micDeviceId and keepMicReadySeconds (defaults filled in
  // by validation); everything else unchanged.
  2: (data) => data,
  // v3 → v4 (VAI-307): adds dictation.cleanup (default "light" from validation); everything else
  // unchanged.
  3: (data) => data,
  // v4 → v5 (VAI-308): adds dictation.styles (default rules from validation); everything else
  // unchanged.
  4: (data) => data,
  // v5 → v6 (VAI-308b): Outlook's default style becomes Email. Only if the rules are still exactly
  // the v5 defaults; any list the user edited is left as it is.
  5: (data) => {
    const styles = (data as { dictation?: { styles?: unknown } } | null)?.dictation?.styles;
    if (JSON.stringify(styles) !== JSON.stringify(V5_DEFAULT_STYLES)) return data;
    const d = data as { dictation: { styles: { app: string; style: string }[] } };
    return {
      ...d,
      dictation: {
        ...d.dictation,
        styles: d.dictation.styles.map((r) =>
          r.app === 'Outlook' ? { ...r, style: 'email' } : { ...r },
        ),
      },
    };
  },
  // v6 → v7 (VAI-309): adds dictation.vocabulary (empty from validation); everything else unchanged.
  6: (data) => data,
};

/** The default style rules as shipped in settings v5 (VAI-308). Frozen here; never change. */
const V5_DEFAULT_STYLES = [
  { app: 'Outlook', style: 'professional' },
  { app: 'Word', style: 'professional' },
  { app: 'Teams', style: 'casual' },
  { app: 'Slack', style: 'casual' },
  { app: 'VS Code', style: 'code' },
  { app: 'Terminal', style: 'code' },
  { app: 'Command Prompt', style: 'code' },
];

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
