import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, Redactor, scrubPatterns } from './redact';

describe('scrubPatterns', () => {
  it.each([
    ['Authorization: Bearer abc.def-123', 'Authorization: Bearer [redacted]'],
    ['key sk-proj-AbCdEf123456789 used', 'key [redacted] used'],
    [
      'GET https://llm/v1/models?api_key=s3cr3t&x=1',
      'GET https://llm/v1/models?api_key=[redacted]&x=1',
    ],
    ['db key ' + 'ab'.repeat(32), 'db key [redacted]'],
    ['token QWxhZGRpbjpvcGVuIHNlc2FtZQ9876543210xYzAbCdEf', 'token [redacted]'],
  ])('%s', (input, expected) => {
    expect(scrubPatterns(input)).toBe(expected);
  });

  it('leaves ordinary text, paths, ids and versions alone', () => {
    const plain =
      'Opened /Users/someone/Library/Application Support/AI Workflow/data/app.db ' +
      'schema 3 id 550e8400-e29b-41d4-a716-446655440000 version 0.1.0';
    expect(scrubPatterns(plain)).toBe(plain);
  });
});

describe('Redactor', () => {
  it('replaces registered secret values anywhere, longest first', () => {
    const r = new Redactor();
    r.addSecret('my-company-key');
    r.addSecret('my-company-key-long');
    r.addSecret('abc'); // too short to register
    expect(r.text('a my-company-key-long b my-company-key c abc')).toBe(
      'a [secret] b [secret] c abc',
    );
  });

  it('messages: one line, capped', () => {
    const r = new Redactor();
    expect(r.message('line one\nline two\r\n  three')).toBe('line one line two three');
    const long = r.message('x'.repeat(MAX_MESSAGE_LENGTH + 50));
    expect(long.startsWith('x'.repeat(MAX_MESSAGE_LENGTH) + '…')).toBe(true);
    expect(long).toContain('[50 more chars]');
  });

  it('fields: content-like names are redacted, non-primitive values omitted', () => {
    const r = new Redactor();
    const out = r.fields({
      count: 3,
      ok: true,
      service: 'llm',
      transcript: 'hello this is private',
      text: 'private',
      apiKey: 'x',
      audioBytes: 5,
      prompt: 'p',
      authorization: 'Bearer x',
      missing: undefined,
      nothing: null,
      blob: Buffer.from('raw audio') as unknown as string,
      'bad name!': 1,
    });
    expect(out).toBe(
      'count=3 ok=true service=llm transcript=[redacted] text=[redacted] apiKey=[redacted] ' +
        'audioBytes=[redacted] prompt=[redacted] authorization=[redacted] nothing=null blob=[omitted]',
    );
    expect(out).not.toContain('private');
  });

  it('fields: strings are quoted when needed and scrubbed', () => {
    const r = new Redactor();
    r.addSecret('topsecretvalue');
    expect(
      r.fields({ host: 'llm.company.internal', note: 'has spaces', url: 'x?token=topsecretvalue' }),
    ).toBe('host=llm.company.internal note="has spaces" url="x?token=[redacted]"');
  });

  it('errors: name and scrubbed message; stack without the message line', () => {
    const r = new Redactor();
    const e = new Error('failed with Bearer abc123');
    expect(r.fields({ error: e })).toBe('error="Error: failed with Bearer [redacted]"');
    expect(r.stack(e)).toMatch(/^at /);
    expect(r.stack(e)).not.toContain('failed with');
  });
});
