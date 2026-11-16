import type { AiService, ConnectionResult } from '../../shared/ai';
import type { Settings } from '../../shared/settings';
import {
  AiNotConfiguredError,
  type AiHttpClient,
  AiTimeoutError,
  HostNotAllowedError,
  SECRET_FOR,
  type SecretReader,
} from './ai-http';

const isService = (s: unknown): s is AiService => s === 'asr' || s === 'llm';

/**
 * Checks an OpenAI-compatible server: GET {baseUrl}/models with the saved key, then looks for
 * the configured model in the list. Never throws; always returns a user-facing result.
 */
export async function testConnection(
  service: unknown,
  client: AiHttpClient,
  settings: () => Settings,
  secrets: SecretReader,
  now: () => number = () => performance.now(),
): Promise<ConnectionResult> {
  if (!isService(service)) {
    return { ok: false, code: 'bad-response', message: 'Unknown server.' };
  }
  const { model } = settings().ai[service];
  const hasKey = secrets.get(SECRET_FOR[service]) !== null;

  const started = now();
  let res: Response;
  try {
    res = await client.request(service, '/models');
  } catch (e) {
    if (e instanceof AiNotConfiguredError) {
      return { ok: false, code: 'not-configured', message: 'Enter the server URL first.' };
    }
    if (e instanceof HostNotAllowedError) {
      return { ok: false, code: 'blocked', message: 'This server is not on the approved list.' };
    }
    if (e instanceof AiTimeoutError) {
      return {
        ok: false,
        code: 'timeout',
        message: `${e.message} Check the URL, VPN, or raise the timeout.`,
      };
    }
    // Network errors, TLS problems, redirects (refused on purpose), DNS failures.
    return {
      ok: false,
      code: 'unreachable',
      message: 'Could not reach the server. Check the URL and that you are on the company network.',
    };
  }
  const latencyMs = Math.round(now() - started);

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      code: 'unauthorized',
      message: hasKey ? 'The server rejected the API key.' : 'This server needs an API key.',
      latencyMs,
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      code: 'not-found',
      message: 'No /models endpoint at this URL. The base URL usually ends in /v1.',
      latencyMs,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      code: 'bad-response',
      message: `The server answered with an error (HTTP ${res.status}).`,
      latencyMs,
    };
  }

  let ids: string[];
  try {
    const body = (await res.json()) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body.data)) throw new Error('no data');
    ids = body.data.map((m) => m.id).filter((id): id is string => typeof id === 'string');
  } catch {
    return {
      ok: false,
      code: 'bad-response',
      message: 'The server answered, but not like an OpenAI-compatible API.',
      latencyMs,
    };
  }

  if (model && !ids.includes(model)) {
    const available = ids.slice(0, 5).join(', ') || 'none';
    return {
      ok: false,
      code: 'model-missing',
      message: `Connected, but model "${model}" isn't available. Available: ${available}.`,
      latencyMs,
    };
  }
  return { ok: true, code: 'ok', message: `Connected (${latencyMs} ms).`, latencyMs };
}
