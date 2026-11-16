/**
 * Settings shape shared by main and renderer. Types only.
 * Defaults, validation and migrations live in electron/settings/.
 */

export interface AiEndpointSettings {
  /** e.g. https://asr.ai.company.internal — empty string means "not configured yet". */
  baseUrl: string;
  model: string;
}

export interface Settings {
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
