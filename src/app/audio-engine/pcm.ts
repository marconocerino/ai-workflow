import { SAMPLE_RATE } from '../../../shared/audio';

/**
 * Turns microphone audio (usually 48 kHz float) into 16 kHz mono 16-bit, the format speech-to-text
 * wants. Averages the input samples that fall under each output sample (a simple low-pass, so
 * high frequencies don't fold back as noise). Keeps state between chunks.
 */
export class Downsampler {
  private readonly ratio: number;
  private pending = new Float32Array(0);
  private pos = 0;

  constructor(inputRate: number, outputRate = SAMPLE_RATE) {
    if (inputRate < outputRate) throw new Error(`Microphone rate ${inputRate} Hz is too low.`);
    this.ratio = inputRate / outputRate;
  }

  push(input: Float32Array): Int16Array {
    const buf = new Float32Array(this.pending.length + input.length);
    buf.set(this.pending);
    buf.set(input, this.pending.length);
    const out: number[] = [];
    while (this.pos + this.ratio <= buf.length) {
      const from = Math.floor(this.pos);
      const to = Math.floor(this.pos + this.ratio);
      let sum = 0;
      for (let i = from; i < to; i++) sum += buf[i]!;
      out.push(sum / Math.max(1, to - from));
      this.pos += this.ratio;
    }
    const consumed = Math.floor(this.pos);
    this.pending = buf.slice(consumed);
    this.pos -= consumed;
    return toInt16(out);
  }
}

export function toInt16(samples: ArrayLike<number>): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Loudest sample, 0..1. */
export function peakOf(samples: Int16Array): number {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return max / 0x8000;
}

/**
 * Fixed-size rolling buffer (the pre-roll). Writing past the end overwrites the oldest audio,
 * so only the last few hundred ms are ever kept. clear() zeroes it.
 */
export class RingBuffer {
  private readonly data: Int16Array;
  private length = 0;
  private start = 0;

  constructor(readonly capacity: number) {
    this.data = new Int16Array(Math.max(0, capacity));
  }

  write(chunk: Int16Array): void {
    if (this.capacity === 0) return;
    for (const s of chunk.length > this.capacity ? chunk.subarray(-this.capacity) : chunk) {
      const end = (this.start + this.length) % this.capacity;
      this.data[end] = s;
      if (this.length < this.capacity) this.length++;
      else this.start = (this.start + 1) % this.capacity;
    }
  }

  /** Oldest to newest. */
  read(): Int16Array {
    const out = new Int16Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.data[(this.start + i) % this.capacity]!;
    return out;
  }

  get size(): number {
    return this.length;
  }

  clear(): void {
    this.data.fill(0);
    this.length = 0;
    this.start = 0;
  }
}

export function concat(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
