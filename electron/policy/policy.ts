import * as fs from 'node:fs';
import {
  FEATURES,
  type Feature,
  type FeatureState,
  type PolicySource,
} from '../../shared/features';
import type { ScopedLogger } from '../logging/logger';
import { POLICY_KEYS, parseRegQuery, type RegQuery, type RegistryValues } from './registry';

/** Registry value names (PascalCase, as IT sees them) for each feature. */
export const FEATURE_VALUE_NAMES: Record<Feature, string> = {
  meetings: 'Meetings',
  agents: 'Agents',
  voiceprints: 'Voiceprints',
};

export const DEFAULT_FLAGS: Readonly<Record<Feature, boolean>> = Object.freeze({
  meetings: false,
  agents: false,
  voiceprints: false,
});

export interface PolicySources {
  platform: NodeJS.Platform;
  regQuery: RegQuery;
  /** macOS dev builds: root-owned JSON file. */
  macFile: string;
  /** Dev/test only (ignored when packaged): JSON file that replaces the OS sources. */
  testFile?: string;
  logger: ScopedLogger;
}

/** A partial set of flags from one source, already validated. */
type Layer = Partial<Record<Feature, boolean>>;

/**
 * Loads the managed policy once at startup (D-016). Order: defaults → per user → per machine
 * (machine wins). Invalid values are ignored and logged. Never throws.
 */
export async function loadFeaturePolicy(sources: PolicySources): Promise<FeatureState> {
  const layers: { source: PolicySource; layer: Layer }[] = [];
  const log = sources.logger;

  if (sources.testFile) {
    layers.push({ source: 'file', layer: fromJsonFile(sources.testFile, log) });
  } else if (sources.platform === 'win32') {
    for (const scope of ['user', 'machine'] as const) {
      const output = await sources.regQuery(POLICY_KEYS[scope]).catch(() => null);
      if (output !== null) {
        layers.push({ source: 'registry', layer: fromRegistry(parseRegQuery(output), scope, log) });
      }
    }
  } else if (sources.platform === 'darwin' && fs.existsSync(sources.macFile)) {
    layers.push({ source: 'file', layer: fromJsonFile(sources.macFile, log) });
  }

  const flags = { ...DEFAULT_FLAGS };
  for (const { layer } of layers) Object.assign(flags, layer);
  const used = layers.filter((l) => Object.keys(l.layer).length > 0).map((l) => l.source);
  return {
    flags: Object.freeze(flags),
    sources: used.length ? [...new Set(used)] : ['defaults'],
  };
}

function fromRegistry(values: RegistryValues, scope: string, log: ScopedLogger): Layer {
  const layer: Layer = {};
  for (const feature of FEATURES) {
    const name = FEATURE_VALUE_NAMES[feature];
    if (!(name in values)) continue;
    const v = values[name];
    if (v === 0 || v === 1) layer[feature] = v === 1;
    else log.warn('Ignored policy value (use DWORD 0 or 1)', { scope, value: name });
  }
  return layer;
}

function fromJsonFile(file: string, log: ScopedLogger): Layer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    log.warn('Policy file could not be read; using defaults');
    return {};
  }
  const features = (parsed as { features?: unknown } | null)?.features;
  if (typeof features !== 'object' || features === null) return {};
  const layer: Layer = {};
  for (const feature of FEATURES) {
    const v = (features as Record<string, unknown>)[feature];
    if (typeof v === 'boolean') layer[feature] = v;
    else if (v !== undefined)
      log.warn('Ignored policy value (use true or false)', { value: feature });
  }
  return layer;
}
