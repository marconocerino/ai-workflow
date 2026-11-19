/**
 * Features that IT can switch on per user or per machine (VAI-109, D-016). Types and the list
 * only. All are off unless a managed policy turns them on. Dictation and Settings have no flag.
 */
export const FEATURES = ['meetings', 'agents', 'voiceprints'] as const;
export type Feature = (typeof FEATURES)[number];
export type FeatureFlags = Readonly<Record<Feature, boolean>>;

/** Where the flags came from, for support and diagnostics. */
export type PolicySource = 'defaults' | 'registry' | 'file';

export interface FeatureState {
  flags: FeatureFlags;
  sources: PolicySource[];
}
