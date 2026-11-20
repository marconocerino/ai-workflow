import { concat, Downsampler, peakOf, RingBuffer, toInt16 } from './pcm';

const tone = (rate: number, hz: number, seconds: number, amp = 0.5) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate),
  );

describe('Downsampler', () => {
  it.each([48_000, 44_100])('%i Hz in chunks → the right number of 16 kHz samples', (rate) => {
    const d = new Downsampler(rate);
    const input = tone(rate, 440, 1.5);
    let out = 0;
    const chunk = Math.round(rate / 50);
    for (let i = 0; i < input.length; i += chunk)
      out += d.push(input.subarray(i, i + chunk)).length;
    expect(Math.abs(out - 1.5 * 16_000)).toBeLessThanOrEqual(1);
  });

  it('keeps a speech-band tone at its level', () => {
    const d = new Downsampler(48_000);
    const out = d.push(tone(48_000, 440, 0.5));
    expect(peakOf(out)).toBeGreaterThan(0.45);
    expect(peakOf(out)).toBeLessThan(0.55);
  });

  it('damps frequencies above 8 kHz (no fold-back noise)', () => {
    const d = new Downsampler(48_000);
    expect(peakOf(d.push(tone(48_000, 15_000, 0.2)))).toBeLessThan(0.25);
  });

  it('refuses rates below 16 kHz', () => {
    expect(() => new Downsampler(8_000)).toThrow(/too low/);
  });
});

describe('toInt16 / peakOf / concat', () => {
  it('clips and scales', () => {
    expect([...toInt16([0, 1, -1, 2, -2, 0.5])]).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
    expect(peakOf(Int16Array.from([0, -16384, 8192]))).toBe(0.5);
    expect([...concat([Int16Array.of(1, 2), Int16Array.of(3)])]).toEqual([1, 2, 3]);
  });
});

describe('RingBuffer (pre-roll)', () => {
  it('keeps only the newest samples, oldest first', () => {
    const r = new RingBuffer(4);
    r.write(Int16Array.of(1, 2, 3));
    r.write(Int16Array.of(4, 5, 6));
    expect([...r.read()]).toEqual([3, 4, 5, 6]);
    r.write(Int16Array.of(7, 8, 9, 10, 11));
    expect([...r.read()]).toEqual([8, 9, 10, 11]);
  });

  it('clear() empties and zeroes it', () => {
    const r = new RingBuffer(3);
    r.write(Int16Array.of(5, 6, 7));
    r.clear();
    expect(r.size).toBe(0);
    expect([...r.read()]).toEqual([]);
    r.write(Int16Array.of(1));
    expect([...r.read()]).toEqual([1]);
  });
});
