import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type Encryptor,
  InvalidSecretError,
  SecretEncryptionUnavailableError,
  SecretStore,
} from './secret-store';

/** Fake OS encryption: reversible but clearly not plain text. */
function fakeEncryptor(available = true): Encryptor & { available: boolean } {
  return {
    available,
    async isEncryptionAvailable() {
      return this.available;
    },
    encryptString: async (t) => Buffer.from(`enc:${[...t].reverse().join('')}`),
    decryptString: async (b) => {
      const s = b.toString();
      if (!s.startsWith('enc:')) throw new Error('bad ciphertext');
      return { value: [...s.slice(4)].reverse().join(''), shouldReEncrypt: false };
    },
  };
}

let dir: string;
let warnings: string[];
const KEY = 'sk-live-very-secret-123';
const file = () => path.join(dir, 'secrets.json');
const make = (enc = fakeEncryptor()) =>
  new SecretStore(dir, enc, {
    logger: { warn: (m) => warnings.push(m) },
    now: () => new Date('2026-11-16T12:00:00.000Z'),
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-secrets-'));
  warnings = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('SecretStore', () => {
  it('stores, checks, reads (main only) and clears a secret', async () => {
    const s = make();
    expect(s.has('ai.llm.apiKey')).toBe(false);
    await s.set('ai.llm.apiKey', KEY);
    expect(s.has('ai.llm.apiKey')).toBe(true);
    expect(s.has('ai.asr.apiKey')).toBe(false);
    expect(await make().get('ai.llm.apiKey')).toBe(KEY);
    s.clear('ai.llm.apiKey');
    expect(s.has('ai.llm.apiKey')).toBe(false);
    expect(await s.get('ai.llm.apiKey')).toBeNull();
  });

  it('reports every saved or read value so logs can scrub it', async () => {
    const seen: string[] = [];
    const withHook = () => new SecretStore(dir, fakeEncryptor(), { onSecret: (v) => seen.push(v) });
    await withHook().set('ai.llm.apiKey', `  ${KEY}  `);
    expect(seen).toEqual([KEY]);
    await withHook().get('ai.llm.apiKey');
    expect(seen).toEqual([KEY, KEY]);
  });

  it('re-encrypts when the OS says the key was rotated, keeping the value', async () => {
    await make().set('ai.llm.apiKey', KEY);
    const before = fs.readFileSync(file(), 'utf8');
    const rotated = fakeEncryptor();
    let calls = 0;
    const decrypt = rotated.decryptString;
    rotated.decryptString = async (b) => ({
      ...(await decrypt(b)),
      shouldReEncrypt: calls++ === 0,
    });
    rotated.encryptString = async (t) => Buffer.from(`enc:${[...t].reverse().join('')}#v2`);
    const s = make(rotated);
    expect(await s.get('ai.llm.apiKey')).toBe(KEY);
    const after = fs.readFileSync(file(), 'utf8');
    expect(after).not.toBe(before);
    expect(after).not.toContain(KEY);
  });

  it('never writes the plain text to disk', async () => {
    await make().set('ai.llm.apiKey', KEY);
    const text = fs.readFileSync(file(), 'utf8');
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text)).toEqual({
      version: 1,
      secrets: { 'ai.llm.apiKey': expect.any(String) },
    });
  });

  it('writes the file readable by the current user only', async () => {
    await make().set('ai.llm.apiKey', KEY);
    if (process.platform !== 'win32') {
      expect(fs.statSync(file()).mode & 0o777).toBe(0o600);
    }
  });

  it('refuses to store when OS encryption is unavailable (no plain-text fallback)', async () => {
    await expect(make(fakeEncryptor(false)).set('ai.llm.apiKey', KEY)).rejects.toThrow(
      SecretEncryptionUnavailableError,
    );
    expect(fs.existsSync(file())).toBe(false);
  });

  it.each([
    ['unknown name', 'evil.key', KEY],
    ['non-string name', 42, KEY],
    ['empty value', 'ai.llm.apiKey', '   '],
    ['non-string value', 'ai.llm.apiKey', { k: 1 }],
    ['too long value', 'ai.llm.apiKey', 'x'.repeat(4097)],
  ])('rejects %s', async (_label, name, value) => {
    await expect(make().set(name, value)).rejects.toThrow(InvalidSecretError);
  });

  it('rejects unknown names for has/clear', () => {
    expect(() => make().has('__proto__')).toThrow(InvalidSecretError);
    expect(() => make().clear('constructor')).toThrow(InvalidSecretError);
  });

  it('moves a corrupt secrets file aside and starts empty, without logging contents', async () => {
    fs.writeFileSync(file(), `{"oops": "${KEY}"`);
    const s = make();
    expect(s.has('ai.llm.apiKey')).toBe(false);
    expect(fs.readdirSync(dir)).toEqual(['secrets.corrupt-2026-11-16T12-00-00-000Z.json']);
    await s.set('ai.llm.apiKey', 'new');
    expect(await s.get('ai.llm.apiKey')).toBe('new');
    expect(warnings.join()).not.toContain(KEY);
  });

  it('returns null (and warns without the value) when decryption fails', async () => {
    fs.writeFileSync(
      file(),
      JSON.stringify({
        version: 1,
        secrets: { 'ai.llm.apiKey': Buffer.from('junk').toString('base64') },
      }),
    );
    expect(await make().get('ai.llm.apiKey')).toBeNull();
    expect(warnings).toEqual([
      'Secrets: could not decrypt ai.llm.apiKey; it needs to be entered again.',
    ]);
  });
});
