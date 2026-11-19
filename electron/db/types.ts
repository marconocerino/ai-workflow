import type Libsql from 'libsql';

export type Db = Libsql.Database;

/**
 * One schema change. `up` runs inside a transaction; throwing rolls it back.
 * Rules: never edit a migration that has shipped; add a new one instead.
 * Every migration needs a test file next to it: NNN-name.spec.ts.
 */
export interface Migration {
  version: number;
  name: string;
  up(db: Db): void;
}

export interface DbLogger {
  warn(message: string): void;
  error(message: string): void;
}
