import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeAiServer {
  /** Base URL including /v1, e.g. http://127.0.0.1:53111/v1 */
  baseUrl: string;
  /** Authorization headers received, in order. */
  authHeaders: (string | undefined)[];
  /** Transcription requests received (VAI-303): what was sent, never kept beyond the test. */
  transcriptions: { model: string | null; wavBytes: number; contentType: string }[];
  /** How POST /v1/audio/transcriptions answers; change it during a test. */
  transcribe: { status: number; text: string; delayMs: number };
  close(): Promise<void>;
}

/**
 * Minimal OpenAI-compatible server, protected by one API key: GET /v1/models, and
 * POST /v1/audio/transcriptions (multipart: file + model) answering `{ text }`.
 */
export async function startFakeAiServer(apiKey: string, models: string[]): Promise<FakeAiServer> {
  const authHeaders: (string | undefined)[] = [];
  const transcriptions: FakeAiServer['transcriptions'] = [];
  const transcribe: FakeAiServer['transcribe'] = { status: 200, text: '', delayMs: 0 };
  const server: Server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
      authHeaders.push(req.headers.authorization);
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const text = body.toString('latin1');
        const model = /name="model"\r\n\r\n([^\r]*)\r\n/.exec(text)?.[1] ?? null;
        const riff = body.indexOf('RIFF');
        const dataLen = riff >= 0 ? body.readUInt32LE(riff + 40) : -1;
        transcriptions.push({
          model,
          wavBytes: dataLen >= 0 ? dataLen + 44 : 0,
          contentType: req.headers['content-type'] ?? '',
        });
        const answer = () => {
          if (res.destroyed) return;
          if (req.headers.authorization !== `Bearer ${apiKey}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
            return;
          }
          res.writeHead(transcribe.status, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(
              transcribe.status === 200 ? { text: transcribe.text } : { error: { message: 'x' } },
            ),
          );
        };
        setTimeout(answer, transcribe.delayMs);
      });
      return;
    }
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
    transcriptions,
    transcribe,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
