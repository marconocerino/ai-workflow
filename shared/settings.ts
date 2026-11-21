/**
 * Settings shape shared by main and renderer. Types only.
 * Defaults, validation and migrations live in electron/settings/.
 */

export interface AiEndpointSettings {
  /** e.g. https://asr.ai.company.internal — empty string means "not configured yet". */
  baseUrl: string;
  model: string;
}

/** hold: hold Ctrl to talk, release to stop · toggle: press once to start, again to stop. */
export type DictationMode = 'hold' | 'toggle';

export interface DictationSettings {
  mode: DictationMode;
  /** Keys of the toggle shortcut, e.g. ['Ctrl', 'Shift', 'Space']. Changeable from VAI-301. */
  toggleShortcut: string[];
  /** Microphone device id from the OS; '' = System default (VAI-302). */
  micDeviceId: string;
  /** Keep the mic open this long after dictating (0 = off). */
  keepMicReadySeconds: KeepMicReadySeconds;
  /** AI cleanup of dictated text before pasting (VAI-307). */
  cleanup: CleanupLevel;
  /** Writing style per app (VAI-308); apps without a rule use Neutral. */
  styles: StyleRule[];
  /** Names, products and acronyms to spell right (VAI-309), oldest first. */
  vocabulary: string[];
}

export const MAX_VOCABULARY = 200;
export const MAX_VOCABULARY_WORD = 40;

/**
 * Split typed or pasted text into vocabulary entries (VAI-309): commas, semicolons and new lines
 * separate; spaces inside an entry are kept ("Visual Studio"). Trimmed, empties dropped.
 */
export function splitVocabulary(text: string): string[] {
  return text
    .split(/[,;\r\n\t]+/)
    .map((w) => w.trim().replace(/\s+/g, ' '))
    .filter((w) => w.length > 0);
}

/** How cleanup writes for an app (VAI-308). Neutral: nothing beyond the cleanup level. */
export const STYLES = ['neutral', 'professional', 'email', 'casual', 'code'] as const;
export type StyleName = (typeof STYLES)[number];

export const STYLE_LABELS: Record<StyleName, string> = {
  neutral: 'Neutral',
  professional: 'Professional',
  email: 'Email',
  casual: 'Casual',
  code: 'Code',
};

/** `app` is the short app name shown in the overlay, e.g. "Outlook" (never a window title). */
export interface StyleRule {
  app: string;
  style: StyleName;
}

export const MAX_STYLE_RULES = 50;
export const MAX_APP_NAME = 40;

export const DEFAULT_STYLE_RULES: readonly StyleRule[] = [
  { app: 'Outlook', style: 'email' },
  { app: 'Word', style: 'professional' },
  { app: 'Teams', style: 'casual' },
  { app: 'Slack', style: 'casual' },
  { app: 'VS Code', style: 'code' },
  { app: 'Terminal', style: 'code' },
  { app: 'Command Prompt', style: 'code' },
];

/** The style for an app: its rule (case-insensitive), else Neutral. */
export function styleFor(rules: readonly StyleRule[], app: string | null): StyleName {
  if (!app) return 'neutral';
  const key = app.trim().toLowerCase();
  return rules.find((r) => r.app.trim().toLowerCase() === key)?.style ?? 'neutral';
}

/** off: paste what was heard · light: punctuation, capitals, fillers · polished: also false starts, paragraphs */
export const CLEANUP_LEVELS = ['off', 'light', 'polished'] as const;
export type CleanupLevel = (typeof CLEANUP_LEVELS)[number];

export const KEEP_MIC_READY_OPTIONS = [0, 5, 10, 30] as const;
export type KeepMicReadySeconds = (typeof KEEP_MIC_READY_OPTIONS)[number];

export interface Settings {
  dictation: DictationSettings;
  ai: {
    asr: AiEndpointSettings;
    llm: AiEndpointSettings;
    /** Per-request timeout in milliseconds. */
    timeoutMs: number;
    /** Retries after a failed request. */
    retries: number;
  };
}

/** Recursive partial, used for `settings:update`. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type SettingsPatch = DeepPartial<Settings>;

/**
 * Secrets the app may store. They are encrypted on disk and can be set, checked or cleared from
 * the renderer, but never read back by it.
 */
export const SECRET_NAMES = ['ai.asr.apiKey', 'ai.llm.apiKey'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
