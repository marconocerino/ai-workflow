import type { Recording } from '../../shared/audio';
import type { Settings } from '../../shared/settings';
import type { ScopedLogger } from '../logging/logger';
import {
  AiNotConfiguredError,
  type AiHttpClient,
  AiTimeoutError,
  HostNotAllowedError,
} from './ai-http';
import { pcmToWav } from './wav';

/** Shorter than this is an accidental press: not sent, no message. */
export const MIN_DURATION_MS = 300;
/** Quieter than this (about −40 dBFS peak) is silence: not sent (Whisper invents text for it). */
export const SILENCE_PEAK = 0.01;
/** Longest Retry-After we'll wait for on HTTP 429. */
const MAX_RETRY_AFTER_MS = 5_000;

export type TranscriptionProblem =
  | 'not-configured'
  | 'blocked'
  | 'timeout'
  | 'unreachable'
  | 'unauthorized'
  | 'not-found'
  | 'too-large'
  | 'rejected'
  | 'rate-limited'
  | 'server-error'
  | 'bad-response'
  | 'silent';

export type TranscriptionResult =
  | { kind: 'text'; text: string; latencyMs: number; attempts: number }
  /** Not sent on purpose (too short). Nothing to tell the user. */
  | { kind: 'skipped' }
  /** Something the user should know, with a short message. Never contains audio, text or keys. */
  | { kind: 'problem'; code: TranscriptionProblem; message: string; attempts: number };

export interface TranscriberDeps {
  client: AiHttpClient;
  settings(): Settings;
  logger?: ScopedLogger;
  now?(): number;
  sleep?(ms: number): Promise<void>;
}

const MESSAGES: Record<TranscriptionProblem, string> = {
  'not-configured': 'Set up the speech-to-text server in Settings → AI servers.',
  blocked: 'The speech-to-text server is not on the approved list.',
  timeout: 'The speech-to-text server did not answer in time. Try again, or raise the timeout.',
  unreachable: 'Could not reach the speech-to-text server. Check your network or VPN.',
  unauthorized:
    'The speech-to-text server rejected the API key. Check it in Settings → AI servers.',
  'not-found':
    'The speech-to-text server has no transcription endpoint or model at this address. Check the URL and model.',
  'too-large': 'The recording is too long for the speech-to-text server.',
  rejected: 'The speech-to-text server refused the recording.',
  'rate-limited': 'The speech-to-text server is busy (too many requests). Try again shortly.',
  'server-error': 'The speech-to-text server had an error. Try again.',
  'bad-response': 'The speech-to-text server answered in an unexpected format.',
  silent: 'Nothing was heard. Check your microphone.',
};

/** What went wrong with one attempt, and whether another attempt may help. */
interface Failure {
  code: TranscriptionProblem;
  retry: boolean;
  status?: number;
  waitMs?: number;
}

/**
 * Speech-to-text (VAI-303) through an OpenAI-compatible `POST {baseUrl}/audio/transcriptions`
 * (Qwen3-ASR on the company server; any compatible server works, D-009/D-021).
 * The audio goes as an in-memory WAV only to the configured server; text and audio are never
 * logged — only length, size, timing and error codes. Retries `settings.ai.retries` times after
 * network errors, HTTP 429 and 5xx; never after a timeout or a 4xx (the same answer would come).
 */
export class Transcriber {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly d: TranscriberDeps) {
    this.now = d.now ?? (() => performance.now());
    this.sleep = d.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async transcribe(recording: Recording): Promise<TranscriptionResult> {
    const log = this.d.logger;
    if (recording.durationMs < MIN_DURATION_MS) {
      log?.info('Recording not sent', { reason: 'too-short', durationMs: recording.durationMs });
      return { kind: 'skipped' };
    }
    if (recording.peak < SILENCE_PEAK) {
      log?.info('Recording not sent', { reason: 'silent', durationMs: recording.durationMs });
      return { kind: 'problem', code: 'silent', message: MESSAGES.silent, attempts: 0 };
    }

    const { model } = this.d.settings().ai.asr;
    if (!model) return this.problem({ code: 'not-configured', retry: false }, 0);
    const wav = pcmToWav(recording.pcm);
    const maxAttempts = 1 + this.d.settings().ai.retries;
    const started = this.now();

    for (let attempt = 1; ; attempt++) {
      const outcome = await this.attempt(wav, model);
      if (outcome === '') return this.problem({ code: 'silent', retry: false }, attempt);
      if (typeof outcome === 'string') {
        const latencyMs = Math.round(this.now() - started);
        log?.info('Transcribed', {
          durationMs: recording.durationMs,
          bytes: wav.byteLength,
          latencyMs,
          attempts: attempt,
        });
        return { kind: 'text', text: outcome, latencyMs, attempts: attempt };
      }
      if (!outcome.retry || attempt >= maxAttempts) return this.problem(outcome, attempt);
      log?.warn('Transcription failed; retrying', {
        code: outcome.code,
        status: outcome.status,
        attempt,
      });
      await this.sleep(outcome.waitMs ?? 500 * attempt);
    }
  }

  private problem(f: Failure, attempts: number): TranscriptionResult {
    this.d.logger?.warn('Transcription failed', { code: f.code, status: f.status, attempts });
    return { kind: 'problem', code: f.code, message: MESSAGES[f.code], attempts };
  }

  /** One request: the text, or why it failed. */
  private async attempt(wav: Uint8Array<ArrayBuffer>, model: string): Promise<string | Failure> {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'dictation.wav');
    form.append('model', model);
    form.append('response_format', 'json');

    let res: Response;
    try {
      res = await this.d.client.request('asr', '/audio/transcriptions', {
        method: 'POST',
        body: form,
      });
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return { code: 'not-configured', retry: false };
      if (e instanceof HostNotAllowedError) return { code: 'blocked', retry: false };
      if (e instanceof AiTimeoutError) return { code: 'timeout', retry: false };
      return { code: 'unreachable', retry: true }; // DNS, TLS, refused, redirect
    }

    const status = res.status;
    if (!res.ok) {
      // Drain the body so the connection can be reused; its content may echo the request.
      await res.body?.cancel().catch(() => undefined);
      if (status === 401 || status === 403) return { code: 'unauthorized', retry: false, status };
      if (status === 404) return { code: 'not-found', retry: false, status };
      if (status === 413) return { code: 'too-large', retry: false, status };
      if (status === 429) {
        const waitMs = retryAfterMs(res.headers.get('retry-after'));
        return { code: 'rate-limited', retry: waitMs <= MAX_RETRY_AFTER_MS, status, waitMs };
      }
      if (status >= 500) return { code: 'server-error', retry: true, status };
      return { code: 'rejected', retry: false, status };
    }

    try {
      const body = (await res.json()) as { text?: unknown };
      if (typeof body.text !== 'string') throw new Error('no text');
      return body.text.trim();
    } catch {
      return { code: 'bad-response', retry: false, status };
    }
  }
}

/** Retry-After in seconds (dates are treated as "too long"); default 1 s. */
function retryAfterMs(header: string | null): number {
  if (header === null) return 1_000;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Infinity;
}
