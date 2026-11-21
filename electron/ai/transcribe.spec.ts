import { describe, expect, it, vi } from 'vitest';
import type { Recording } from '../../shared/audio';
import type { SecretName, Settings } from '../../shared/settings';
import type { ScopedLogger } from '../logging/logger';
import type { LogFields } from '../logging/redact';
import { defaultSettings } from '../settings/schema';
import { AiHttpClient, type FetchFn } from './ai-http';
import { Transcriber } from './transcribe';

const KEY = 'gsk-test-key-123';
const SPOKEN = 'Meet me at the harbour at nine';

function recording(seconds = 2, peak = 0.5): Recording {
  return {
    pcm: new ArrayBuffer(seconds * 16_000 * 2),
    durationMs: seconds * 1000,
    peak,
  };
}

function setup(respond: FetchFn, patch: (s: Settings) => void = () => undefined) {
  const settings = defaultSettings();
  settings.ai.asr = { baseUrl: 'https://asr.company.internal/v1', model: 'qwen3-asr' };
  settings.ai.timeoutMs = 1000;
  settings.ai.retries = 2;
  patch(settings);
  const secrets = { get: async (n: SecretName) => (n === 'ai.asr.apiKey' ? KEY : null) };
  const fetchFn = vi.fn(respond);
  const lines: string[] = [];
  const record = (level: string) => (message: string, fields?: LogFields) =>
    lines.push(`${level} ${message} ${JSON.stringify(fields ?? {})}`);
  const logger: ScopedLogger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
  const sleeps: number[] = [];
  const transcriber = new Transcriber({
    client: new AiHttpClient(() => settings, secrets, fetchFn),
    settings: () => settings,
    logger,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { transcriber, fetchFn, lines, sleeps };
}

const ok = (text = ` ${SPOKEN} `) =>
  Promise.resolve(new Response(JSON.stringify({ text }), { status: 200 }));
const status = (code: number, headers: Record<string, string> = {}) =>
  Promise.resolve(new Response('{"error":{"message":"nope"}}', { status: code, headers }));

describe('Transcriber', () => {
  it('POSTs a WAV + model to {baseUrl}/audio/transcriptions with the key and returns the text', async () => {
    const { transcriber, fetchFn } = setup(() => ok());
    const result = await transcriber.transcribe(recording(2));

    expect(result).toMatchObject({ kind: 'text', text: SPOKEN, attempts: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://asr.company.internal/v1/audio/transcriptions');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    const form = init.body as FormData;
    expect(form.get('model')).toBe('qwen3-asr');
    expect(form.get('response_format')).toBe('json');
    expect(form.has('prompt')).toBe(false); // no vocabulary → no hint
    const file = form.get('file') as File;
    expect(file.name).toBe('dictation.wav');
    expect(file.type).toBe('audio/wav');
    expect(file.size).toBe(44 + 2 * 16_000 * 2);
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    expect(String.fromCharCode(...head)).toBe('RIFF');
  });

  it('logs length, size and timing, never the text or the key', async () => {
    const { transcriber, lines } = setup(() => ok());
    await transcriber.transcribe(recording(2));
    expect(lines.join('\n')).toMatch(/Transcribed .*"durationMs":2000.*"bytes":64044/);
    expect(lines.join('\n')).not.toContain('harbour');
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('does not send a recording shorter than 300 ms', async () => {
    const { transcriber, fetchFn } = setup(() => ok());
    const short: Recording = { pcm: new ArrayBuffer(3200), durationMs: 100, peak: 0.5 };
    expect(await transcriber.transcribe(short)).toEqual({ kind: 'skipped' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not send silence; tells the user to check the mic', async () => {
    const { transcriber, fetchFn } = setup(() => ok());
    const result = await transcriber.transcribe(recording(2, 0.001));
    expect(result).toMatchObject({ kind: 'problem', code: 'silent' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('an empty answer is "nothing heard"', async () => {
    const { transcriber } = setup(() => ok('  '));
    expect(await transcriber.transcribe(recording())).toMatchObject({
      kind: 'problem',
      code: 'silent',
    });
  });

  it('not configured: no URL or no model', async () => {
    const noUrl = setup(
      () => ok(),
      (s) => (s.ai.asr.baseUrl = ''),
    );
    expect(await noUrl.transcriber.transcribe(recording())).toMatchObject({
      code: 'not-configured',
      message: expect.stringContaining('Settings → AI servers'),
    });
    const noModel = setup(
      () => ok(),
      (s) => (s.ai.asr.model = ''),
    );
    expect(await noModel.transcriber.transcribe(recording())).toMatchObject({
      code: 'not-configured',
    });
    expect(noModel.fetchFn).not.toHaveBeenCalled();
  });

  it('timeout: clear message, not retried', async () => {
    const { transcriber, fetchFn } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const result = await transcriber.transcribe(recording());
    expect(result).toMatchObject({ kind: 'problem', code: 'timeout', attempts: 1 });
    expect(result.kind === 'problem' && result.message).toMatch(/did not answer in time/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('server error (5xx): retried settings.ai.retries times, then a clear message', async () => {
    const { transcriber, fetchFn, sleeps } = setup(() => status(500));
    const result = await transcriber.transcribe(recording());
    expect(result).toMatchObject({ kind: 'problem', code: 'server-error', attempts: 3 });
    expect(result.kind === 'problem' && result.message).toMatch(/had an error/);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('a retry that succeeds returns the text', async () => {
    let calls = 0;
    const { transcriber } = setup(() => (++calls === 1 ? status(503) : ok()));
    expect(await transcriber.transcribe(recording())).toMatchObject({
      kind: 'text',
      text: SPOKEN,
      attempts: 2,
    });
  });

  it('network errors are retried', async () => {
    let calls = 0;
    const { transcriber } = setup(() =>
      ++calls === 1 ? Promise.reject(new TypeError('net::ERR_CONNECTION_RESET')) : ok(),
    );
    expect(await transcriber.transcribe(recording())).toMatchObject({ kind: 'text', attempts: 2 });
  });

  it('unreachable after all retries', async () => {
    const { transcriber, fetchFn } = setup(() => Promise.reject(new TypeError('failed')));
    expect(await transcriber.transcribe(recording())).toMatchObject({ code: 'unreachable' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries = 0 means one attempt', async () => {
    const { transcriber, fetchFn } = setup(
      () => status(502),
      (s) => (s.ai.retries = 0),
    );
    await transcriber.transcribe(recording());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'unauthorized', /rejected the API key/],
    [403, 'unauthorized', /rejected the API key/],
    [404, 'not-found', /Check the URL and model/],
    [413, 'too-large', /too long/],
    [400, 'rejected', /refused the recording/],
  ])('HTTP %i → %s, not retried', async (code, problem, message) => {
    const { transcriber, fetchFn } = setup(() => status(code));
    const result = await transcriber.transcribe(recording());
    expect(result).toMatchObject({ kind: 'problem', code: problem });
    expect(result.kind === 'problem' && result.message).toMatch(message);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('429: waits Retry-After (if short) and retries', async () => {
    let calls = 0;
    const { transcriber, sleeps } = setup(() =>
      ++calls === 1 ? status(429, { 'retry-after': '2' }) : ok(),
    );
    expect(await transcriber.transcribe(recording())).toMatchObject({ kind: 'text' });
    expect(sleeps).toEqual([2000]);
  });

  it('429 with a long Retry-After gives up at once', async () => {
    const { transcriber, fetchFn } = setup(() => status(429, { 'retry-after': '60' }));
    expect(await transcriber.transcribe(recording())).toMatchObject({ code: 'rate-limited' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a non-JSON or text-less answer is a bad response', async () => {
    const { transcriber } = setup(() => Promise.resolve(new Response('<html>', { status: 200 })));
    expect(await transcriber.transcribe(recording())).toMatchObject({ code: 'bad-response' });
  });

  it('only talks to the configured host (IT allowlist blocks others)', async () => {
    const settings = defaultSettings();
    settings.ai.asr = { baseUrl: 'https://api.example.com/v1', model: 'm' };
    const fetchFn = vi.fn(() => ok());
    const transcriber = new Transcriber({
      client: new AiHttpClient(
        () => settings,
        { get: async () => null },
        fetchFn,
        () => ['https://asr.company.internal'],
      ),
      settings: () => settings,
    });
    expect(await transcriber.transcribe(recording())).toMatchObject({ code: 'blocked' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('vocabulary (VAI-309) goes to the server as the prompt hint; never logged', async () => {
    const { transcriber, fetchFn, lines } = setup(
      () => ok(),
      (s) => (s.dictation.vocabulary = ['Siobhan', 'Kubernetes', 'AIWF']),
    );
    await transcriber.transcribe(recording());
    const form = fetchFn.mock.calls[0]![1].body as FormData;
    expect(form.get('prompt')).toBe('Siobhan, Kubernetes, AIWF');
    expect(lines.join('\n')).not.toMatch(/Siobhan|Kubernetes/);
  });
});
