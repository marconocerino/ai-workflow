// Shared helpers for database tests (not shipped: imported only from *.spec.ts).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AnySecretName } from '../settings/secret-store';
import type { KeyStore } from './app-database';
import { openEncrypted } from './open';
import type { Db, DbLogger } from './types';

export function tempDir(prefix = 'aiw-db-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function memoryKeys(
  available = true,
): KeyStore & { values: Map<string, string>; available: boolean } {
  const values = new Map<string, string>();
  return {
    values,
    available,
    async isAvailable() {
      return this.available;
    },
    has: (name: AnySecretName) => values.has(name),
    async get(name: AnySecretName) {
      return this.available ? (values.get(name) ?? null) : null;
    },
    async set(name: AnySecretName, value: string) {
      if (!this.available) throw new Error('unavailable');
      values.set(name, value);
    },
  };
}

export function recordingLogger(): DbLogger & { lines: string[] } {
  const lines: string[] = [];
  return { lines, warn: (m) => lines.push(`warn: ${m}`), error: (m) => lines.push(`error: ${m}`) };
}

/** A fresh encrypted in-temp-dir database with a fixed key. */
export function scratchDb(): { db: Db; file: string; dir: string } {
  const dir = tempDir();
  const file = path.join(dir, 'test.db');
  return { db: openEncrypted(file, 'ab'.repeat(32)), file, dir };
}

export function tables(db: Db): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}
