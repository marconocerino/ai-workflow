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
}

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
