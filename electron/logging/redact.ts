/**
 * Keeps transcripts, audio and keys out of logs and diagnostics (VAI-107, D-014).
 * Layers: field allow-list by name and type, pattern scrubbing, exact registered secrets, caps.
 */

/** Values a log field may hold. Anything else (objects, buffers, arrays) is omitted. */
export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Record<string, LogValue | Error>;

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_FIELD_LENGTH = 200;
export const MAX_STACK_LENGTH = 2_000;

/** Field names whose values are never logged, whatever they hold. */
export const SENSITIVE_FIELD =
  /text|transcript|audio|content|prompt|key|token|secret|password|passphrase|authorization|cookie|body|speech|utterance/i;

const MIN_SECRET_LENGTH = 6;

export class Redactor {
  private secrets: string[] = [];

  /** Exact values (API keys, the database key) to replace wherever they appear. */
  addSecret(value: string | null | undefined): void {
    if (!value || value.length < MIN_SECRET_LENGTH || this.secrets.includes(value)) return;
    this.secrets = [...this.secrets, value].sort((a, b) => b.length - a.length);
  }

  /** Scrub free text: registered secrets first, then known key/token shapes. */
  text(input: string): string {
    let out = input;
    for (const s of this.secrets) out = out.split(s).join('[secret]');
    return scrubPatterns(out);
  }

  /** Scrub and cap a log message; newlines become spaces so one entry stays one line. */
  message(input: string): string {
    return cap(this.text(input).replace(/\s*[\r\n]+\s*/g, ' '), MAX_MESSAGE_LENGTH);
  }

  /** Format fields as `name=value …`, dropping or redacting anything that could carry content. */
  fields(fields: LogFields | undefined): string {
    if (!fields) return '';
    const parts: string[] = [];
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(name)) continue;
      parts.push(`${name}=${this.value(name, value)}`);
    }
    return parts.join(' ');
  }

  /** Error stack (without the first line, which is the message), scrubbed and capped. */
  stack(error: Error): string | null {
    const lines = (error.stack ?? '').split('\n').slice(1);
    if (lines.length === 0) return null;
    return cap(this.text(lines.map((l) => l.trim()).join('\n')), MAX_STACK_LENGTH);
  }

  private value(name: string, value: LogValue | Error): string {
    if (value instanceof Error) {
      return quote(`${value.name}: ${this.message(value.message)}`);
    }
    if (SENSITIVE_FIELD.test(name)) return '[redacted]';
    if (value === null) return 'null';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return quote(cap(this.message(value), MAX_FIELD_LENGTH));
    return '[omitted]';
  }
}

/** Known secret shapes. Exported for the diagnostics export (scrubs whole files). */
export function scrubPatterns(input: string): string {
  return (
    input
      // Authorization headers.
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
      // OpenAI-style keys (sk-…, sk-proj-…).
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
      // Secrets in URLs: ?api_key=…, &token=…, ?sig=…
      .replace(
        /([?&](?:api[_-]?key|apikey|key|token|access_token|auth|sig|signature|password)=)[^&\s"']+/gi,
        '$1[redacted]',
      )
      // Long hex strings (our 64-hex database key, other raw keys).
      .replace(/\b[0-9a-fA-F]{32,}\b/g, '[redacted]')
      // Long base64 / base64url runs with mixed case and digits (tokens, encoded audio).
      .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, (run) =>
        /[a-z]/.test(run) && /[A-Z]/.test(run) && /[0-9]/.test(run) ? '[redacted]' : run,
      )
  );
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [${text.length - max} more chars]` : text;
}

function quote(text: string): string {
  return /^[A-Za-z0-9_.:/@+-]+$/.test(text) ? text : JSON.stringify(text);
}
