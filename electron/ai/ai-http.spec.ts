import { describe, expect, it, vi } from 'vitest';
import type { SecretName, Settings } from '../../shared/settings';
import { defaultSettings } from '../settings/schema';
import {
  AiHttpClient,
  AiNotConfiguredError,
  AiTimeoutError,
  type FetchFn,
  HostNotAllowedError,
} from './ai-http';
import { testConnection } from './connection-test';

const KEY = 'sk-super-secret-key-42';

function settingsWith(patch: Partial<Settings['ai']['llm']> = {}): Settings {
  const s = defaultSettings();
  s.ai.llm = { baseUrl: 'https://llm.company.internal/v1', model: 'qwen3-32b', ...patch };
  s.ai.timeoutMs = 1000;
  return s;
}

function setup(
  respond: FetchFn,
  opts: { key?: string | null; settings?: Settings; allow?: string[] } = {},
) {
  const settings = opts.settings ?? settingsWith();
  const key = opts.key === undefined ? KEY : opts.key;
  const secrets = { get: (name: SecretName) => (name === 'ai.llm.apiKey' ? key : null) };
  const fetchFn = vi.fn(respond);
  const client = new AiHttpClient(
    () => settings,
    secrets,
    fetchFn,
    () => opts.allow ?? [],
  );
  const test = () => testConnection('llm', client, () => settings, secrets, fakeClock());
  return { client, fetchFn, test };
}

function fakeClock() {
  let t = 0;
  return () => (t += 25);
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const models = (...ids: string[]) => json({ object: 'list', data: ids.map((id) => ({ id })) });

describe('AiHttpClient', () => {
  it('calls {baseUrl}/models with the key, no redirects, no cookies', async () => {
    const { client, fetchFn } = setup(() => models('x'));
    await client.request('llm', '/models');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://llm.company.internal/v1/models');
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
  });

  it('sends no Authorization header when no key is saved', async () => {
    const { client, fetchFn } = setup(() => models(), { key: null });
    await client.request('llm', '/models');
    expect((fetchFn.mock.calls[0]![1].headers as Record<string, string>)['Authorization']).toBe(
      undefined,
    );
  });

  it('refuses paths that would leave the configured host', async () => {
    const { client, fetchFn } = setup(() => models());
    for (const path of ['//evil.com/models', 'models', '@evil.com/x']) {
      await expect(client.request('llm', path)).rejects.toBeInstanceOf(HostNotAllowedError);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('enforces the optional IT allowlist', async () => {
    const { client, fetchFn } = setup(() => models(), { allow: ['https://approved.company'] });
    await expect(client.request('llm', '/models')).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(fetchFn).not.toHaveBeenCalled();

    const ok = setup(() => models(), { allow: ['https://llm.company.internal'] });
    await expect(ok.client.request('llm', '/models')).resolves.toBeInstanceOf(Response);
  });

  it('throws when the server URL is not set', async () => {
    const { client } = setup(() => models(), { settings: settingsWith({ baseUrl: '' }) });
    await expect(client.request('llm', '/models')).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it('times out using the configured timeout', async () => {
    vi.useFakeTimers();
    const { client } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    const pending = client.request('llm', '/models');
    const assertion = expect(pending).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('testConnection', () => {
  it('ok when the server lists the configured model', async () => {
    const { test } = setup(() => models('qwen3-32b', 'other'));
    expect(await test()).toEqual({
      ok: true,
      code: 'ok',
      message: 'Connected (25 ms).',
      latencyMs: 25,
    });
  });

  it('ok when no model is configured yet', async () => {
    const { test } = setup(() => models('a'), { settings: settingsWith({ model: '' }) });
    expect((await test()).code).toBe('ok');
  });

  it.each([
    [401, true, 'unauthorized', 'The server rejected the API key.'],
    [403, false, 'unauthorized', 'This server needs an API key.'],
    [404, true, 'not-found', 'No /models endpoint at this URL. The base URL usually ends in /v1.'],
    [500, true, 'bad-response', 'The server answered with an error (HTTP 500).'],
  ])('maps HTTP %i (key saved: %s) to %s', async (status, withKey, code, message) => {
    const { test } = setup(() => json({ error: 'x' }, status), { key: withKey ? KEY : null });
    expect(await test()).toMatchObject({ ok: false, code, message });
  });

  it('reports a missing model with the available ones', async () => {
    const { test } = setup(() => models('qwen3-8b', 'qwen3-asr'));
    expect(await test()).toMatchObject({
      ok: false,
      code: 'model-missing',
      message: 'Connected, but model "qwen3-32b" isn\'t available. Available: qwen3-8b, qwen3-asr.',
    });
  });

  it('reports a server that is not OpenAI-compatible', async () => {
    for (const respond of [
      () => Promise.resolve(new Response('<html>hi</html>')),
      () => json({ models: [] }),
    ]) {
      const { test } = setup(respond);
      expect((await test()).code).toBe('bad-response');
    }
  });

  it('reports network errors (incl. refused redirects) without leaking details', async () => {
    const { test } = setup(() => Promise.reject(new Error(`net::ERR_FAILED ${KEY}`)));
    const result = await test();
    expect(result.code).toBe('unreachable');
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('reports not configured, blocked hosts and unknown services', async () => {
    const notSet = setup(() => models(), { settings: settingsWith({ baseUrl: '' }) });
    expect((await notSet.test()).code).toBe('not-configured');

    const blocked = setup(() => models(), { allow: ['https://other.company'] });
    expect((await blocked.test()).code).toBe('blocked');

    expect(
      (await testConnection('evil', blocked.client, defaultSettings, { get: () => null })).ok,
    ).toBe(false);
  });

  it('never includes the key in any result', async () => {
    const responses: FetchFn[] = [
      () => models('qwen3-32b'),
      () => models('nope'),
      () => json({}, 401),
      () => json({}, 500),
      () => Promise.reject(new Error(KEY)),
    ];
    for (const respond of responses) {
      const { test } = setup(respond);
      expect(JSON.stringify(await test())).not.toContain(KEY);
    }
  });
});
