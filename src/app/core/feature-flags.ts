import { Injectable, inject, signal } from '@angular/core';
import type { CanMatchFn } from '@angular/router';
import { FEATURES, type Feature, type FeatureFlags as Flags } from '../../../shared/features';
import { AI_WORKFLOW_BRIDGE } from './electron-api';

const ALL_OFF: Flags = Object.freeze(
  Object.fromEntries(FEATURES.map((f) => [f, false])) as Record<Feature, boolean>,
);

/**
 * Feature flags from IT policy (VAI-109, D-016). Loaded once before the first screen is drawn
 * (app initializer), so hidden features never flash on screen. Read-only.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);
  private readonly flags = signal<Flags>(ALL_OFF);

  /** Everything off until loaded, and when the policy can't be read. */
  async load(): Promise<void> {
    if (!this.bridge) return;
    try {
      const state = await this.bridge.features.get();
      this.flags.set(Object.freeze({ ...ALL_OFF, ...pickBooleans(state.flags) }));
    } catch {
      this.flags.set(ALL_OFF);
    }
  }

  enabled(feature: Feature): boolean {
    return this.flags()[feature] === true;
  }
}

/** Route guard: the route doesn't exist (and its code isn't loaded) unless the flag is on. */
export function feature(name: Feature): CanMatchFn {
  return () => inject(FeatureFlags).enabled(name);
}

function pickBooleans(flags: unknown): Partial<Record<Feature, boolean>> {
  const out: Partial<Record<Feature, boolean>> = {};
  if (typeof flags !== 'object' || flags === null) return out;
  for (const f of FEATURES) {
    if ((flags as Record<string, unknown>)[f] === true) out[f] = true;
  }
  return out;
}
