import type { AiEndpointSettings, Settings, SettingsPatch } from '../../shared/settings';

/** Bump when the stored shape changes, and add a migration in migrations.ts. */
export const SETTINGS_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    ai: {
      asr: { baseUrl: '', model: 'qwen3-asr' },
      llm: { baseUrl: '', model: '' },
      timeoutMs: 30_000,
      retries: 2,
    },
  };
}

export const LIMITS = {
  timeoutMs: { min: 1_000, max: 600_000 },
  retries: { min: 0, max: 10 },
  modelLength: 200,
  urlLength: 2_000,
} as const;

export interface SettingsIssue {
  /** Dotted path, e.g. "ai.llm.baseUrl". */
  path: string;
  message: string;
}

export class SettingsValidationError extends Error {
  constructor(readonly issues: SettingsIssue[]) {
    super(`Invalid settings: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    this.name = 'SettingsValidationError';
  }
}

type Obj = Record<string, unknown>;
export const isObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** '' (not configured) or an http(s) URL without credentials, query or fragment. Trailing / removed. */
function readUrl(raw: unknown, fallback: string, path: string, issues: SettingsIssue[]): string {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') {
    issues.push({ path, message: 'must be a string' });
    return fallback;
  }
  const value = raw.trim();
  if (value === '') return '';
  if (value.length > LIMITS.urlLength) {
    issues.push({ path, message: 'is too long' });
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({ path, message: 'must be a valid URL' });
    return fallback;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    issues.push({ path, message: 'must start with http:// or https://' });
    return fallback;
  }
  if (url.username || url.password) {
    issues.push({ path, message: 'must not contain a user name or password' });
    return fallback;
  }
  if (url.search || url.hash) {
    issues.push({ path, message: 'must not contain ? or #' });
    return fallback;
  }
  return url.toString().replace(/\/+$/, '');
}

function readText(raw: unknown, fallback: string, path: string, issues: SettingsIssue[]): string {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') {
    issues.push({ path, message: 'must be a string' });
    return fallback;
  }
  const value = raw.trim();
  if (value.length > LIMITS.modelLength) {
    issues.push({ path, message: 'is too long' });
    return fallback;
  }
  return value;
}

function readInt(
  raw: unknown,
  fallback: number,
  { min, max }: { min: number; max: number },
  path: string,
  issues: SettingsIssue[],
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    issues.push({ path, message: 'must be a whole number' });
    return fallback;
  }
  if (raw < min || raw > max) {
    issues.push({ path, message: `must be between ${min} and ${max}` });
    return fallback;
  }
  return raw;
}

function readEndpoint(
  raw: unknown,
  fallback: AiEndpointSettings,
  path: string,
  issues: SettingsIssue[],
): AiEndpointSettings {
  if (raw === undefined) return { ...fallback };
  if (!isObject(raw)) {
    issues.push({ path, message: 'must be an object' });
    return { ...fallback };
  }
  return {
    baseUrl: readUrl(raw['baseUrl'], fallback.baseUrl, `${path}.baseUrl`, issues),
    model: readText(raw['model'], fallback.model, `${path}.model`, issues),
  };
}

/**
 * Turn untrusted data into valid Settings. Every bad or missing field falls back to `base`
 * (defaults when loading from disk) and is reported in `issues`. Unknown keys are dropped.
 */
export function sanitizeSettings(
  raw: unknown,
  base: Settings = defaultSettings(),
): { settings: Settings; issues: SettingsIssue[] } {
  const issues: SettingsIssue[] = [];
  if (!isObject(raw)) {
    issues.push({ path: '', message: 'must be an object' });
    return { settings: structuredClone(base), issues };
  }
  const ai = raw['ai'];
  if (ai !== undefined && !isObject(ai)) {
    issues.push({ path: 'ai', message: 'must be an object' });
    return { settings: structuredClone(base), issues };
  }
  const a: Obj = ai ?? {};
  return {
    settings: {
      ai: {
        asr: readEndpoint(a['asr'], base.ai.asr, 'ai.asr', issues),
        llm: readEndpoint(a['llm'], base.ai.llm, 'ai.llm', issues),
        timeoutMs: readInt(
          a['timeoutMs'],
          base.ai.timeoutMs,
          LIMITS.timeoutMs,
          'ai.timeoutMs',
          issues,
        ),
        retries: readInt(a['retries'], base.ai.retries, LIMITS.retries, 'ai.retries', issues),
      },
    },
    issues,
  };
}

/** Apply a patch from the renderer. Strict: any invalid field rejects the whole update. */
export function applyPatch(current: Settings, patch: SettingsPatch | unknown): Settings {
  const { settings, issues } = sanitizeSettings(patch, current);
  if (issues.length > 0) throw new SettingsValidationError(issues);
  return settings;
}
