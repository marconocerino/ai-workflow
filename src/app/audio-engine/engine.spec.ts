import type { AudioEvent } from '../../../shared/audio';
import { AudioEngine, type OpenSource } from './engine';

/** A fake mic at 48 kHz: `feed(ms, level)` pushes that much audio. */
function setup(opts: { fail?: string; fellBack?: boolean } = {}) {
  let onFrames: ((f: Float32Array) => void) | null = null;
  const closed = vi.fn();
  const open: OpenSource = vi.fn(async (_id, cb) => {
    if (opts.fail) throw Object.assign(new Error(opts.fail), { name: opts.fail });
    onFrames = cb;
    return { source: { sampleRate: 48_000, close: closed }, fellBack: !!opts.fellBack };
  });
  const events: AudioEvent[] = [];
  const recordings: { pcm: ArrayBuffer; durationMs: number; peak: number }[] = [];
  const engine = new AudioEngine(open, {
    event: (e) => events.push(e),
    recording: (r) => recordings.push(r),
  });
  const feed = (ms: number, level = 0.5) =>
    onFrames?.(new Float32Array((48_000 * ms) / 1000).fill(level));
  const flush = () => new Promise((r) => setTimeout(r));
  return { engine, open, closed, events, recordings, feed, flush };
}

const OPEN = { type: 'open', deviceId: '', preRollMs: 500 } as const;

describe('AudioEngine', () => {
  it('records from start to stop, beginning with the pre-roll', async () => {
    const { engine, events, recordings, feed, flush } = setup();
    engine.handle(OPEN);
    await flush();
    expect(events[0]).toMatchObject({ type: 'opened', fellBack: false });
    feed(800); // only the last 500 ms are kept
    engine.handle({ type: 'start' });
    feed(1000);
    engine.handle({ type: 'stop' });
    expect(recordings).toHaveLength(1);
    expect(recordings[0]!.durationMs).toBe(1500);
    expect(recordings[0]!.pcm.byteLength).toBe(1.5 * 16_000 * 2);
    expect(recordings[0]!.peak).toBeCloseTo(0.5, 2);
  });

  it('reports a loudness level 20 times a second while recording, never before', async () => {
    const { engine, events, feed, flush } = setup();
    engine.handle(OPEN);
    await flush();
    feed(500, 0.5); // pre-roll: no levels
    expect(events.filter((e) => e.type === 'level')).toEqual([]);
    engine.handle({ type: 'start' });
    feed(500, 0.5);
    const loud = events.filter((e) => e.type === 'level');
    expect(loud).toHaveLength(10);
    // 0.5 full scale ≈ −6 dBFS → 0.9 on the −60…0 dB meter
    for (const e of loud) expect(e.level).toBeCloseTo(0.9, 1);
    feed(100, 0); // silence
    expect(events.at(-1)).toEqual({ type: 'level', level: 0 });
    engine.handle({ type: 'stop' });
    const count = events.length;
    feed(500, 0.5);
    expect(events).toHaveLength(count); // no levels after stopping
  });

  it('cancel delivers nothing', async () => {
    const { engine, recordings, feed, flush } = setup();
    engine.handle(OPEN);
    await flush();
    engine.handle({ type: 'start' });
    feed(500);
    engine.handle({ type: 'cancel' });
    expect(recordings).toEqual([]);
  });

  it('close releases the mic and clears the pre-roll (warm audio is discarded)', async () => {
    const { engine, closed, events, recordings, feed, flush } = setup();
    engine.handle(OPEN);
    await flush();
    feed(500, 0.9);
    engine.handle({ type: 'close' });
    expect(closed).toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'closed' });
    // Reopen: nothing from before the close survives.
    engine.handle(OPEN);
    await flush();
    engine.handle({ type: 'start' });
    engine.handle({ type: 'stop' });
    expect(recordings[0]!.durationMs).toBe(0);
  });

  it('start while still opening records from the moment the mic is ready', async () => {
    const { engine, recordings, feed, flush } = setup();
    engine.handle(OPEN);
    engine.handle({ type: 'start' });
    await flush();
    feed(300);
    engine.handle({ type: 'stop' });
    expect(recordings[0]!.durationMs).toBe(300);
  });

  it('close while opening releases the mic as soon as it opens', async () => {
    const { engine, closed, flush } = setup();
    engine.handle(OPEN);
    engine.handle({ type: 'close' });
    await flush();
    expect(closed).toHaveBeenCalled();
    expect(engine.state).toBe('closed');
  });

  it.each([
    ['NotAllowedError', 'blocked'],
    ['NotFoundError', 'no-device'],
    ['AbortError', 'failed'],
  ])('%s → %s', async (name, reason) => {
    const { engine, events, flush } = setup({ fail: name });
    engine.handle(OPEN);
    await flush();
    expect(events).toEqual([{ type: 'error', reason }]);
    expect(engine.state).toBe('closed');
  });

  it('reports when the chosen device was missing and System default is used', async () => {
    const { engine, events, flush } = setup({ fellBack: true });
    engine.handle({ ...OPEN, deviceId: 'gone' });
    await flush();
    expect(events[0]).toMatchObject({ type: 'opened', fellBack: true });
  });
});
