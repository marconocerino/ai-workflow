import Database from 'better-sqlite3-multiple-ciphers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretStore } from '../settings/secret-store';
import { AppDatabase } from './app-database';
import { MIGRATIONS } from './migrations';
import { openEncrypted, WrongKeyError } from './open';
import { memoryKeys, recordingLogger, tables, tempDir } from './test-helpers';
import type { KeyStore } from './app-database';
import type { Migration } from './types';

const open: AppDatabase[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const d of open.splice(0)) d.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function make<K extends KeyStore = ReturnType<typeof memoryKeys>>(
  maybeKeys?: K,
  migrations?: readonly Migration[],
  dir = tempDir(),
) {
  const keys = (maybeKeys ?? memoryKeys()) as K;
  dirs.push(dir);
  const logger = recordingLogger();
  const database = new AppDatabase(dir, keys, {
    logger,
    now: () => new Date('2026-11-17T10:00:00.000Z'),
    ...(migrations ? { migrations } : {}),
  });
  open.push(database);
  return { database, keys, logger, dir };
}

describe('AppDatabase', () => {
  it('first run: creates a key, an encrypted file and applies all migrations', () => {
    const { database, keys, dir } = make();
    expect(database.open()).toEqual({
      status: 'ok',
      schemaVersion: MIGRATIONS.length,
      encrypted: true,
    });
    expect(keys.values.get('db.key')).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(dir, 'app.db'))).toBe(true);
    expect(tables(database.connection()!)).toContain('app_meta');
  });

  it('second run: same key, nothing re-applied, data kept', () => {
    const { database, keys, dir } = make();
    database.open();
    database
      .connection()!
      .prepare("INSERT INTO app_meta (key, value) VALUES ('probe', 'kept')")
      .run();
    database.close();
    const key = keys.values.get('db.key');

    const again = make(keys, undefined, dir).database;
    expect(again.open().status).toBe('ok');
    expect(keys.values.get('db.key')).toBe(key);
    expect(
      again.connection()!.prepare("SELECT value FROM app_meta WHERE key='probe'").get(),
    ).toEqual({
      value: 'kept',
    });
    expect(again.connection()!.prepare('SELECT count(*) n FROM schema_migrations').get()).toEqual({
      n: MIGRATIONS.length,
    });
  });

  it('file is encrypted: no SQLite header, unreadable without the key or with a wrong key', () => {
    const { database, keys, dir } = make();
    database.open();
    database
      .connection()!
      .prepare("INSERT INTO app_meta (key, value) VALUES ('secret', 'top-secret-text')")
      .run();
    database.connection()!.pragma('wal_checkpoint(TRUNCATE)');
    database.close();
    const file = path.join(dir, 'app.db');
    const bytes = fs.readFileSync(file);

    expect(bytes.subarray(0, 16).toString('latin1')).not.toBe('SQLite format 3\0');
    expect(bytes.includes(Buffer.from('top-secret-text'))).toBe(false);
    expect(bytes.includes(Buffer.from('app_meta'))).toBe(false);

    const plain = new Database(file);
    expect(() => plain.prepare('SELECT * FROM sqlite_master').all()).toThrow(/not a database/);
    plain.close();
    expect(() => openEncrypted(file, 'cd'.repeat(32))).toThrow(WrongKeyError);
    const right = openEncrypted(file, keys.values.get('db.key')!);
    expect(right.prepare("SELECT value FROM app_meta WHERE key='secret'").get()).toEqual({
      value: 'top-secret-text',
    });
    right.close();
  });

  it('no OS encryption: stays closed and writes nothing', () => {
    const { database, dir, logger } = make(memoryKeys(false));
    expect(database.open()).toMatchObject({ status: 'unavailable', schemaVersion: 0 });
    expect(database.connection()).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(logger.lines[0]).toContain('OS encryption is not available');
  });

  it('OS encryption temporarily unavailable: existing data is left alone', () => {
    const keys = memoryKeys();
    const { database, dir } = make(keys);
    database.open();
    database.close();
    keys.available = false;
    const again = make(keys, undefined, dir).database;
    expect(again.open().status).toBe('unavailable');
    expect(fs.readdirSync(dir).filter((f) => f.includes('unreadable'))).toEqual([]);
  });

  it('lost key: moves the old file aside and starts a new database', () => {
    const keys = memoryKeys();
    const { database, dir } = make(keys);
    database.open();
    database.close();
    keys.values.delete('db.key');

    const again = make(keys, undefined, dir);
    expect(again.database.open().status).toBe('ok');
    expect(fs.readdirSync(dir)).toContain('app.unreadable-2026-11-17T10-00-00-000Z.db');
    expect(again.logger.lines.join()).toContain('key is missing or unreadable');
  });

  it('wrong key: moves the old file aside and starts a new database', () => {
    const keys = memoryKeys();
    const { database, dir } = make(keys);
    database.open();
    database.close();
    keys.values.set('db.key', 'ef'.repeat(32));

    const again = make(keys, undefined, dir);
    expect(again.database.open().status).toBe('ok');
    expect(fs.readdirSync(dir).some((f) => f.startsWith('app.unreadable-'))).toBe(true);
    expect(keys.values.get('db.key')).not.toBe('ef'.repeat(32));
  });

  it('failed migration: status error, rolled back, logged, older data kept', () => {
    const keys = memoryKeys();
    const { database, dir } = make(keys);
    database.open();
    database.close();

    const broken: Migration = {
      version: MIGRATIONS.length + 1,
      name: 'broken',
      up(db) {
        db.exec('CREATE TABLE should_not_exist (id INTEGER)');
        throw new Error('constraint failed');
      },
    };
    const again = make(keys, [...MIGRATIONS, broken], dir);
    expect(again.database.open()).toMatchObject({
      status: 'error',
      schemaVersion: MIGRATIONS.length,
      message: `Database update ${MIGRATIONS.length + 1} failed.`,
    });
    expect(again.logger.lines.join()).toContain(
      `Migration ${MIGRATIONS.length + 1} (broken) failed`,
    );
    expect(again.database.connection()).toBeNull();
    expect(fs.existsSync(path.join(dir, 'app.db.bak'))).toBe(true);

    const check = make(keys, undefined, dir).database;
    check.open();
    expect(tables(check.connection()!)).not.toContain('should_not_exist');
  });

  it('works with the real SecretStore: key stored encrypted, not in plain text', () => {
    const dir = tempDir();
    const secrets = new SecretStore(dir, {
      isEncryptionAvailable: () => true,
      encryptString: (t) => Buffer.from(t).reverse(),
      decryptString: (b) => Buffer.from(b).reverse().toString(),
    });
    const { database } = make(secrets, undefined, dir);
    expect(database.open().status).toBe('ok');
    const key = secrets.get('db.key')!;
    expect(fs.readFileSync(path.join(dir, 'secrets.json'), 'utf8')).not.toContain(key);
  });
});
