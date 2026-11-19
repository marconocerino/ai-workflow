import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CIPHER, openEncrypted, pragmaValue, WrongKeyError } from './open';
import { tempDir } from './test-helpers';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function file() {
  const dir = tempDir();
  dirs.push(dir);
  return path.join(dir, 'x.db');
}

describe('openEncrypted', () => {
  it('opens with WAL, foreign keys and the AES-256 cipher', () => {
    const db = openEncrypted(file(), 'ab'.repeat(32));
    expect(CIPHER).toBe('aes256cbc');
    expect(pragmaValue(db, 'journal_mode')).toBe('wal');
    expect(pragmaValue(db, 'foreign_keys')).toBe(1);
    expect(pragmaValue(db, 'user_version')).toBe(0);
    db.close();
  });

  it('rows are plain: no libsql _metadata field, pluck works with get()', () => {
    const db = openEncrypted(file(), 'ab'.repeat(32));
    db.exec("CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, 'x'), (2, 'y')");
    const row = db.prepare('SELECT a, b FROM t ORDER BY a').get();
    expect(row).toEqual({ a: 1, b: 'x' });
    expect(JSON.stringify(row)).toBe('{"a":1,"b":"x"}');
    expect(db.prepare('SELECT a, b FROM t ORDER BY a').all()).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ]);
    expect(db.prepare('SELECT b FROM t WHERE a = ?').pluck().get(2)).toBe('y');
    expect(db.prepare('SELECT a FROM t ORDER BY a').pluck().all()).toEqual([1, 2]);
    expect(db.prepare('SELECT a, b FROM t ORDER BY a').raw(true).get()).toEqual([1, 'x']);
    expect(db.prepare('SELECT a FROM t WHERE a = 9').get()).toBeUndefined();
    db.close();
  });

  it('rejects malformed keys and wrong keys', () => {
    const f = file();
    expect(() => openEncrypted(f, 'short')).toThrow(/64 hex/);
    openEncrypted(f, 'ab'.repeat(32)).close();
    expect(() => openEncrypted(f, 'cd'.repeat(32))).toThrow(WrongKeyError);
  });

  it('local files only: no code passes libsql cloud-sync or remote options', () => {
    // libsql can sync to Turso's cloud; we must never use it (all data stays local).
    const root = path.resolve(__dirname, '..');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) sources.push(p);
      }
    };
    walk(root);
    expect(sources.length).toBeGreaterThan(10);
    const offenders = sources.filter((p) =>
      /\b(syncUrl|syncPeriod|authToken|remoteEncryptionKey|readYourWrites)\b|\.sync\(\)|libsql\/promise|@libsql\/client/.test(
        fs.readFileSync(p, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
