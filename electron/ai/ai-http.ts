import type { AiService } from '../../shared/ai';
import type { SecretName, Settings } from '../../shared/settings';
import { originOf } from '../security';

/** fetch-compatible function: Electron's net.fetch in the app, a fake in tests. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface SecretReader {
  get(name: SecretName): Promise<string | null>;
}

export class AiNotConfiguredError extends Error {
  constructor(service: AiService) {
    super(`No server URL set for ${service}.`);
    this.name = 'AiNotConfiguredError';
  }
}

export class HostNotAllowedError extends Error {
  constructor() {
    super('Request blocked: not the configured AI server.');
    this.name = 'HostNotAllowedError';
  }
}

export class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`No answer within ${Math.round(ms / 1000)} s.`);
    this.name = 'AiTimeoutError';
  }
}

export const SECRET_FOR: Record<AiService, SecretName> = {
  asr: 'ai.asr.apiKey',
  llm: 'ai.llm.apiKey',
};

export interface AiRequest {
  method?: 'GET' | 'POST';
  body?: RequestInit['body'];
  headers?: Record<string, string>;
  /** Defaults to settings.ai.timeoutMs. */
  timeoutMs?: number;
}

/**
 * The only way the app talks to AI servers (D-002, D-009).
 * - Requests go only to the origin of the configured base URL (+ optional IT allowlist).
 * - Redirects are refused, so the key can't be bounced to another host.
 * - The API key is attached here and never appears in errors or logs.
 */
export class AiHttpClient {
  constructor(
    private readonly settings: () => Settings,
    private readonly secrets: SecretReader,
    private readonly fetchFn: FetchFn,
    /** Optional IT allowlist of origins (D-009). Empty = any configured host. */
    private readonly allowedOrigins: () => readonly string[] = () => [],
  ) {}

  /** `path` is relative to the base URL, e.g. '/models'. */
  async request(service: AiService, path: string, req: AiRequest = {}): Promise<Response> {
    const current = this.settings();
    const baseUrl = current.ai[service].baseUrl;
    if (!baseUrl) throw new AiNotConfiguredError(service);

    const url = this.buildUrl(baseUrl, path);
    const allowlist = this.allowedOrigins();
    if (allowlist.length > 0 && !allowlist.includes(originOf(url) ?? '')) {
      throw new HostNotAllowedError();
    }

    const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };
    const key = await this.secrets.get(SECRET_FOR[service]);
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const timeoutMs = req.timeoutMs ?? current.ai.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchFn(url, {
        method: req.method ?? 'GET',
        headers,
        body: req.body,
        redirect: 'error',
        signal: controller.signal,
        credentials: 'omit',
      });
    } catch (e) {
      if (controller.signal.aborted) throw new AiTimeoutError(timeoutMs);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Join base URL + path and make sure the result stays on the base URL's origin. */
  buildUrl(baseUrl: string, path: string): string {
    if (!path.startsWith('/') || path.startsWith('//')) throw new HostNotAllowedError();
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
    if (originOf(url) !== originOf(baseUrl)) throw new HostNotAllowedError();
    return url;
  }
}
