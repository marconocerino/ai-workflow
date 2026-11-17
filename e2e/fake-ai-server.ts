import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeAiServer {
  /** Base URL including /v1, e.g. http://127.0.0.1:53111/v1 */
  baseUrl: string;
  /** Authorization headers received, in order. */
  authHeaders: (string | undefined)[];
  close(): Promise<void>;
}

/** Minimal OpenAI-compatible server: GET /v1/models, protected by one API key. */
export async function startFakeAiServer(apiKey: string, models: string[]): Promise<FakeAiServer> {
  const authHeaders: (string | undefined)[] = [];
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      authHeaders.push(req.headers.authorization);
      if (req.headers.authorization !== `Bearer ${apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ object: 'list', data: models.map((id) => ({ id, object: 'model' })) }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    authHeaders,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
