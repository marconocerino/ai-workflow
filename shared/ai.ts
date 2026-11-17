/** Types for talking to the company AI servers. Types only. */

export type AiService = 'asr' | 'llm';

export type ConnectionCode =
  | 'ok'
  | 'not-configured'
  | 'unauthorized'
  | 'model-missing'
  | 'not-found'
  | 'timeout'
  | 'unreachable'
  | 'bad-response'
  | 'blocked';

export interface ConnectionResult {
  ok: boolean;
  code: ConnectionCode;
  /** Short, user-facing explanation. Never contains the API key. */
  message: string;
  latencyMs?: number;
}
