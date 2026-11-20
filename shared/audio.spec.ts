import { describe, expect, it } from 'vitest';
import { levelOf } from './audio';

describe('levelOf', () => {
  it('maps RMS to 0..1 on a −60…0 dBFS scale', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(32768)).toBe(1);
    expect(levelOf(32768 / 10)).toBeCloseTo(40 / 60, 5); // −20 dBFS
    expect(levelOf(32768 / 1000)).toBeCloseTo(0, 5); // −60 dBFS
    expect(levelOf(1)).toBe(0); // below −60 dB
    expect(levelOf(1e9)).toBe(1);
  });
});
