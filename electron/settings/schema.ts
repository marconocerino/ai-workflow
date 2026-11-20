import type {
  AiEndpointSettings,
  DictationMode,
  DictationSettings,
  Settings,
  SettingsPatch,
} from '../../shared/settings';

/** Bump when the stored shape changes, and add a migration in migrations.ts. */
export const SETTINGS_VERSION = 2;

export function defaultSettings(): Settings {
  return {
    dictation: { mode: 'hold', toggleShortcut: ['Ctrl', 'Shift', 'Space'] },
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
  shortcutKeys: { min: 2, max: 4 },
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

const DICTATION_MODES: readonly DictationMode[] = ['hold', 'toggle'];
const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];
/** A non-modifier key: Space, Enter, Tab, F1–F24, A–Z, 0–9. */
const MAIN_KEY = /^(Space|Enter|Tab|F([1-9]|1[0-9]|2[0-4])|[A-Z0-9])$/;

/**
 * A global shortcut: modifiers first, then exactly one main key, and at least one of Ctrl, Alt
 * or Meta (Shift+letter alone would take a normal key away from typing).
 */
function isShortcut(keys: unknown): keys is string[] {
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) return false;
  const mods = keys.slice(0, -1) as string[];
  const main = keys.at(-1) as string | undefined;
  return (
    main !== undefined &&
    MAIN_KEY.test(main) &&
    mods.every((m) => MODIFIERS.includes(m)) &&
    new Set(mods).size === mods.length &&
    mods.some((m) => m !== 'Shift')
  );
}

function readDictation(
  raw: unknown,
  fallback: DictationSettings,
  issues: SettingsIssue[],
): DictationSettings {
  if (raw === undefined) return structuredClone(fallback);
  if (!isObject(raw)) {
    issues.push({ path: 'dictation', message: 'must be an object' });
    return structuredClone(fallback);
  }
  let mode = fallback.mode;
  if (raw['mode'] !== undefined) {
    if (DICTATION_MODES.includes(raw['mode'] as DictationMode)) mode = raw['mode'] as DictationMode;
    else issues.push({ path: 'dictation.mode', message: 'must be "hold" or "toggle"' });
  }
  let toggleShortcut = [...fallback.toggleShortcut];
  const keys = raw['toggleShortcut'];
  if (keys !== undefined) {
    const { min, max } = LIMITS.shortcutKeys;
    if (isShortcut(keys) && keys.length >= min && keys.length <= max) {
      toggleShortcut = [...keys];
    } else {
      issues.push({
        path: 'dictation.toggleShortcut',
        message: 'must be Ctrl, Alt or Win (plus Shift if you like) and one other key',
      });
    }
  }
  return { mode, toggleShortcut };
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
      dictation: readDictation(raw['dictation'], base.dictation, issues),
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
