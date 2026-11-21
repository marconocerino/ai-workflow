import { describe, expect, it } from 'vitest';
import type { Recording } from '../../shared/audio';
import type { TranscriptionResult } from '../ai/transcribe';
import { DictationStatus } from '../tray/dictation-status';
import { clipboardOutput } from './clipboard-output';
import { DictationPipeline } from './dictation-pipeline';

const rec = (durationMs = 1000): Recording => ({ pcm: new ArrayBuffer(4), durationMs, peak: 1 });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(opts: { micReady?: boolean } = {}) {
  const status = new DictationStatus();
  const states: string[] = [];
  status.onChange((s) => states.push(s));
  const out: string[] = [];
  const calls: ReturnType<typeof deferred<TranscriptionResult>>[] = [];
  const pipeline = new DictationPipeline({
    transcribe: () => {
      const d = deferred<TranscriptionResult>();
      calls.push(d);
      return d.promise;
    },
    output: {
      text: (t) => {
        out.push(`text:${t}`);
      },
      problem: (m) => out.push(`problem:${m}`),
    },
    status,
    micReady: () => opts.micReady ?? false,
  });
  return { pipeline, status, states, out, calls };
}

const text = (t: string): TranscriptionResult => ({
  kind: 'text',
  text: t,
  latencyMs: 1,
  attempts: 1,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('DictationPipeline', () => {
  it('shows Transcribing, delivers the text, then back to idle', async () => {
    const { pipeline, states, out, calls } = setup();
    const done = pipeline.onRecording(rec());
    expect(states).toEqual(['transcribing']);
    await flush();
    calls[0]!.resolve(text('hello'));
    await done;
    expect(out).toEqual(['text:hello']);
    expect(states).toEqual(['transcribing', 'idle']);
  });

  it('back to Listening when the mic is still kept ready', async () => {
    const { pipeline, status, states, calls } = setup({ micReady: true });
    status.set('listening');
    const done = pipeline.onRecording(rec());
    await flush();
    calls[0]!.resolve(text('x'));
    await done;
    expect(states).toEqual(['listening', 'transcribing', 'listening']);
  });

  it('a problem is shown with its message', async () => {
    const { pipeline, out, calls } = setup();
    const done = pipeline.onRecording(rec());
    await flush();
    calls[0]!.resolve({ kind: 'problem', code: 'timeout', message: 'Too slow.', attempts: 1 });
    await done;
    expect(out).toEqual(['problem:Too slow.']);
  });

  it('a skipped recording shows nothing', async () => {
    const { pipeline, out, calls } = setup();
    const done = pipeline.onRecording(rec());
    await flush();
    calls[0]!.resolve({ kind: 'skipped' });
    await done;
    expect(out).toEqual([]);
  });

  it('a crash in transcription becomes a message, not an unhandled error', async () => {
    const status = new DictationStatus();
    const out: string[] = [];
    const pipeline = new DictationPipeline({
      transcribe: () => Promise.reject(new Error('boom')),
      output: { text: () => undefined, problem: (m) => out.push(m) },
      status,
      micReady: () => false,
    });
    await pipeline.onRecording(rec());
    expect(out).toEqual(['Transcription failed. Try again.']);
    expect(status.get()).toBe('idle');
  });

  it('two quick dictations come out in order, even if the second answers first', async () => {
    const { pipeline, out, calls, status } = setup();
    const first = pipeline.onRecording(rec());
    const second = pipeline.onRecording(rec());
    await flush();
    expect(calls).toHaveLength(1); // one at a time
    calls[0]!.resolve(text('one'));
    await first;
    expect(status.get()).toBe('transcribing'); // second still on its way
    await flush();
    calls[1]!.resolve(text('two'));
    await second;
    expect(out).toEqual(['text:one', 'text:two']);
    expect(status.get()).toBe('idle');
  });

  it('never overrides a new recording that started meanwhile', async () => {
    const { pipeline, status, calls } = setup();
    const done = pipeline.onRecording(rec());
    status.set('recording'); // user started dictating again
    await flush();
    calls[0]!.resolve(text('x'));
    await done;
    expect(status.get()).toBe('recording');
  });
});

describe('clipboardOutput (until VAI-304)', () => {
  function make(platform: NodeJS.Platform) {
    const log: string[] = [];
    const output = clipboardOutput({
      writeClipboard: (t) => {
        log.push(`clip:${t}`);
      },
      notify: (title, body) => log.push(`note:${title}|${body}`),
      platform,
    });
    return { output, log };
  }

  it('puts the text on the clipboard; the notification never shows the text', async () => {
    const { output, log } = make('win32');
    await output.text('secret plans for Friday');
    expect(log).toEqual([
      'clip:secret plans for Friday',
      'note:Dictation ready|Text copied. Press Ctrl+V to paste it.',
    ]);
  });

  it('macOS (dev) says ⌘V', async () => {
    const { output, log } = make('darwin');
    await output.text('x');
    expect(log[1]).toContain('⌘V');
  });

  it('problems become a notification', () => {
    const { output, log } = make('win32');
    output.problem('Could not reach the server.');
    expect(log).toEqual(['note:Dictation failed|Could not reach the server.']);
  });
});

describe('delivery failures', () => {
  it('a failed clipboard write is logged (no text) and the status still returns to idle', async () => {
    const status = new DictationStatus();
    const errors: string[] = [];
    const pipeline = new DictationPipeline({
      transcribe: async () => ({ kind: 'text', text: 'hi', latencyMs: 1, attempts: 1 }),
      output: {
        text: () => Promise.reject(new Error('clipboard busy')),
        problem: () => undefined,
      },
      status,
      micReady: () => false,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: (m) => errors.push(m),
      },
    });
    await pipeline.onRecording(rec());
    expect(errors).toEqual(['Could not deliver dictation result']);
    expect(status.get()).toBe('idle');
  });
});

describe('AI cleanup step (VAI-307)', () => {
  function withRefine(refine: (t: string) => Promise<string>) {
    const out: string[] = [];
    const pipeline = new DictationPipeline({
      transcribe: async () => ({ kind: 'text', text: 'um hello', latencyMs: 1, attempts: 1 }),
      refine,
      output: {
        text: (t) => {
          out.push(t);
        },
        problem: (m) => {
          out.push(`problem:${m}`);
        },
      },
      status: new DictationStatus(),
      micReady: () => false,
    });
    return { pipeline, out };
  }

  it('the cleaned text is what gets pasted', async () => {
    const { pipeline, out } = withRefine(async () => 'Hello.');
    await pipeline.onRecording(rec());
    expect(out).toEqual(['Hello.']);
  });

  it('if cleanup crashes, the raw text is pasted', async () => {
    const { pipeline, out } = withRefine(() => Promise.reject(new Error('boom')));
    await pipeline.onRecording(rec());
    expect(out).toEqual(['um hello']);
  });

  it('problems skip cleanup', async () => {
    let called = false;
    const out: string[] = [];
    const pipeline = new DictationPipeline({
      transcribe: async () => ({ kind: 'problem', code: 'timeout', message: 'Slow.', attempts: 1 }),
      refine: async (t) => {
        called = true;
        return t;
      },
      output: { text: () => undefined, problem: (m) => void out.push(m) },
      status: new DictationStatus(),
      micReady: () => false,
    });
    await pipeline.onRecording(rec());
    expect(called).toBe(false);
    expect(out).toEqual(['Slow.']);
  });
});

describe('line breaks', () => {
  it('Windows gets CRLF (Polished paragraphs), elsewhere unchanged', async () => {
    const clip: string[] = [];
    const make = (platform: NodeJS.Platform) =>
      clipboardOutput({
        writeClipboard: (t) => void clip.push(t),
        notify: () => undefined,
        platform,
      });
    await make('win32').text('One.\n\nTwo.\r\nThree.');
    await make('darwin').text('One.\n\nTwo.');
    expect(clip).toEqual(['One.\r\n\r\nTwo.\r\nThree.', 'One.\n\nTwo.']);
  });
});

describe('style per app (VAI-308)', () => {
  it('cleanup gets the app captured when the recording arrived, even if a newer one started', async () => {
    let app = 'Outlook';
    const seen: (string | null)[] = [];
    const pipeline = new DictationPipeline({
      transcribe: async () => ({ kind: 'text', text: 'hi', latencyMs: 1, attempts: 1 }),
      refine: async (t, a) => {
        seen.push(a);
        return t;
      },
      targetApp: () => Promise.resolve(app),
      output: { text: () => undefined, problem: () => undefined },
      status: new DictationStatus(),
      micReady: () => false,
    });
    const first = pipeline.onRecording(rec());
    app = 'Teams'; // the next dictation started in Teams before the first was cleaned up
    const second = pipeline.onRecording(rec());
    await Promise.all([first, second]);
    expect(seen).toEqual(['Outlook', 'Teams']);
  });
});
