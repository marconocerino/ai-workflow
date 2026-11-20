import {
  type AudioCommand,
  type AudioEvent,
  MAX_RECORDING_MS,
  type MicProblem,
  SAMPLE_RATE,
} from '../../../shared/audio';
import { concat, Downsampler, peakOf, RingBuffer } from './pcm';

export interface CaptureSource {
  readonly sampleRate: number;
  close(): void;
}

/** Opens the microphone and calls `onFrames` with float samples until closed. */
export type OpenSource = (
  deviceId: string,
  onFrames: (frames: Float32Array) => void,
) => Promise<{ source: CaptureSource; fellBack: boolean }>;

export interface EngineOutput {
  event(event: AudioEvent): void;
  recording(recording: { pcm: ArrayBuffer; durationMs: number; peak: number }): void;
}

const MAX_SAMPLES = (MAX_RECORDING_MS / 1000) * SAMPLE_RATE;

/**
 * The microphone inside the hidden audio window (VAI-302). While open but not recording it
 * keeps only a short rolling pre-roll; a recording starts with that pre-roll. close() releases
 * the mic and zeroes every buffer. Nothing is stored anywhere else.
 */
export class AudioEngine {
  private source: CaptureSource | null = null;
  private opening: Promise<void> | null = null;
  private generation = 0;
  private downsampler: Downsampler | null = null;
  private preRoll = new RingBuffer(0);
  private recording: Int16Array[] | null = null;
  private recorded = 0;

  constructor(
    private readonly openSource: OpenSource,
    private readonly out: EngineOutput,
  ) {}

  get state(): 'closed' | 'opening' | 'open' | 'recording' {
    if (this.recording) return 'recording';
    if (this.source) return 'open';
    return this.opening ? 'opening' : 'closed';
  }

  handle(command: AudioCommand): void {
    switch (command.type) {
      case 'open':
        void this.open(command.deviceId, command.preRollMs);
        break;
      case 'start':
        this.recording = [this.preRoll.read()];
        this.recorded = this.recording[0]!.length;
        this.preRoll.clear();
        break;
      case 'stop':
        this.finish(true);
        break;
      case 'cancel':
        this.finish(false);
        break;
      case 'close':
        this.close();
        break;
    }
  }

  private async open(deviceId: string, preRollMs: number): Promise<void> {
    if (this.source || this.opening) return;
    const generation = ++this.generation;
    this.preRoll = new RingBuffer(Math.round((preRollMs / 1000) * SAMPLE_RATE));
    this.opening = (async () => {
      const began = performance.now();
      try {
        const { source, fellBack } = await this.openSource(deviceId, (f) => this.onFrames(f));
        if (generation !== this.generation) {
          source.close(); // closed while opening
          return;
        }
        this.source = source;
        this.downsampler = new Downsampler(source.sampleRate);
        this.out.event({ type: 'opened', fellBack, openMs: Math.round(performance.now() - began) });
      } catch (e) {
        if (generation === this.generation) {
          this.recording = null;
          this.out.event({ type: 'error', reason: problemOf(e) });
        }
      } finally {
        if (generation === this.generation) this.opening = null;
      }
    })();
    await this.opening;
  }

  private onFrames(frames: Float32Array): void {
    if (!this.downsampler) return;
    const pcm = this.downsampler.push(frames);
    if (this.recording) {
      if (this.recorded >= MAX_SAMPLES) return; // cap reached: keep the first 10 minutes
      const room = MAX_SAMPLES - this.recorded;
      const chunk = pcm.length > room ? pcm.subarray(0, room) : pcm;
      this.recording.push(chunk);
      this.recorded += chunk.length;
    } else {
      this.preRoll.write(pcm);
    }
  }

  private finish(deliver: boolean): void {
    const chunks = this.recording;
    this.recording = null;
    this.recorded = 0;
    if (!chunks || !deliver) return;
    const pcm = concat(chunks);
    for (const c of chunks) c.fill(0);
    this.out.recording({
      pcm: pcm.buffer as ArrayBuffer,
      durationMs: Math.round((pcm.length / SAMPLE_RATE) * 1000),
      peak: peakOf(pcm),
    });
  }

  private close(): void {
    this.generation++;
    this.opening = null;
    this.source?.close();
    this.source = null;
    this.downsampler = null;
    this.recording?.forEach((c) => c.fill(0));
    this.recording = null;
    this.recorded = 0;
    this.preRoll.clear();
    this.out.event({ type: 'closed' });
  }
}

function problemOf(e: unknown): MicProblem {
  const name = e instanceof Error || e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'blocked';
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  ) {
    return 'no-device';
  }
  return 'failed';
}
