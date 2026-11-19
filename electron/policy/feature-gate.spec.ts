import { describe, expect, it, vi } from 'vitest';
import { featureGate } from './feature-gate';

describe('featureGate', () => {
  it('registers only features that are on', () => {
    const registerIf = featureGate({ meetings: true, agents: false, voiceprints: false });
    const meetings = vi.fn();
    const agents = vi.fn();
    expect(registerIf('meetings', meetings)).toBe(true);
    expect(registerIf('agents', agents)).toBe(false);
    expect(meetings).toHaveBeenCalledOnce();
    expect(agents).not.toHaveBeenCalled();
  });
});
