import { describe, expect, it } from 'vitest';
import { pcmToWav } from './wav';

describe('pcmToWav', () => {
  it('writes a 44-byte PCM header for 16 kHz mono 16-bit, then the samples', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767]).buffer;
    const wav = pcmToWav(pcm);
    const view = new DataView(wav.buffer);
    const ascii = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));

    expect(wav.byteLength).toBe(44 + 8);
    expect(ascii(0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(ascii(8)).toBe('WAVE');
    expect(ascii(12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
    expect([...new Int16Array(wav.buffer, 44)]).toEqual([0, 1000, -1000, 32767]);
  });

  it('handles an empty recording', () => {
    expect(pcmToWav(new ArrayBuffer(0)).byteLength).toBe(44);
  });
});
