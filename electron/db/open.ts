import Database from 'better-sqlite3-multiple-ciphers';
import type { Db } from './types';

/** 32 random bytes as hex — the raw SQLCipher key. */
export const KEY_PATTERN = /^[0-9a-f]{64}$/;

export class WrongKeyError extends Error {
  constructor() {
    super('The database could not be decrypted with the stored key.');
    this.name = 'WrongKeyError';
  }
}

/**
 * Open (or create) an encrypted database: SQLCipher v4 format (AES-256, HMAC-SHA512) via
 * SQLite3 Multiple Ciphers. Throws WrongKeyError if the file isn't readable with `keyHex`.
 */
export function openEncrypted(file: string, keyHex: string): Db {
  if (!KEY_PATTERN.test(keyHex)) throw new Error('Database key must be 64 hex characters.');
  const db = new Database(file);
  try {
    db.pragma(`cipher = 'sqlcipher'`);
    db.pragma('legacy = 4');
    db.pragma(`key = "x'${keyHex}'"`);
    // Reading the schema fails with SQLITE_NOTADB if the key is wrong or the file isn't ours.
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (e) {
    db.close();
    if ((e as { code?: string }).code === 'SQLITE_NOTADB') throw new WrongKeyError();
    throw e;
  }
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}
