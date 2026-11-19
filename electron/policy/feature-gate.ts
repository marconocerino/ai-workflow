import type { Feature, FeatureFlags } from '../../shared/features';
import type { ScopedLogger } from '../logging/logger';

/**
 * Registers a feature's main-process parts (IPC handlers, background work) only when its flag
 * is on — a hidden feature has nothing to call, not just nothing to click (D-016).
 *
 *   const registerIf = featureGate(flags, logger);
 *   registerIf('meetings', () => registerMeetingsIpc(handle, …));
 */
export function featureGate(flags: FeatureFlags, logger?: ScopedLogger) {
  return function registerIf(feature: Feature, register: () => void): boolean {
    if (!flags[feature]) {
      logger?.debug('Feature off; not registered', { feature });
      return false;
    }
    register();
    return true;
  };
}
