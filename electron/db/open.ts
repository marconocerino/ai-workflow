import Database from 'libsql';
import type { Db } from './types';

/** 32 random bytes as hex — the database encryption key. */
export const KEY_PATTERN = /^[0-9a-f]{64}$/;

/** libsql's at-rest encryption (SQLite3 Multiple Ciphers inside libsql). */
export const CIPHER = 'aes256cbc';

export class WrongKeyError extends Error {
  constructor() {
    super('The database could not be decrypted with the stored key.');
    this.name = 'WrongKeyError';
  }
}

/**
 * The only options we ever pass to libsql. Local files only: libsql can also sync to Turso's
 * cloud (sync URL, auth token, remote keys) — we never use that (no external services);
 * a test enforces it. libsql's typings don't list the encryption options, hence this type.
 */
export interface LocalEncryptedOptions {
  encryptionCipher: typeof CIPHER;
  encryptionKey: string;
  timeout: number;
}

type LocalDatabase = new (file: string, options: LocalEncryptedOptions) => Db;

/**
 * Open (or create) an encrypted database (AES-256-CBC, whole file, via libsql).
 * Throws WrongKeyError if the file isn't readable with `keyHex`.
 */
export function openEncrypted(file: string, keyHex: string): Db {
  if (!KEY_PATTERN.test(keyHex)) throw new Error('Database key must be 64 hex characters.');
  const options: LocalEncryptedOptions = {
    encryptionCipher: CIPHER,
    encryptionKey: keyHex,
    timeout: 5000,
  };
  const db = new (Database as unknown as LocalDatabase)(file, options);
  try {
    // Reading the schema fails with SQLITE_NOTADB if the key is wrong or the file isn't ours.
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (e) {
    db.close();
    if ((e as { code?: string }).code === 'SQLITE_NOTADB') throw new WrongKeyError();
    throw e;
  }
  plainRows(db);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/**
 * libsql's `Statement.get()` differs from better-sqlite3 (whose API and typings it follows):
 * it adds an enumerable `_metadata` timing field to every row (which would leak into IPC
 * replies and JSON) and ignores `pluck()`. Fix both once here so feature code gets plain rows.
 */
function plainRows(db: Db): void {
  const prepare = db.prepare.bind(db);
  db.prepare = ((source: string) => {
    const stmt = prepare(source) as ReturnType<Db['prepare']> & { pluckMode?: boolean };
    const get = stmt.get.bind(stmt) as (...params: unknown[]) => unknown;
    stmt.get = (...params: unknown[]) => {
      const row = get(...params);
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
      const record = row as Record<string, unknown>;
      delete record['_metadata'];
      return stmt.pluckMode ? record[Object.keys(record)[0]] : record;
    };
    return stmt;
  }) as Db['prepare'];
}

/** Read a single-value PRAGMA, e.g. pragmaValue(db, 'user_version'). */
export function pragmaValue(db: Db, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).raw(true).get() as unknown[] | undefined;
  return row?.[0];
}
