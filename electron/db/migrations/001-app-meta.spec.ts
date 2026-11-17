import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../migrator';
import { recordingLogger, scratchDb, tables } from '../test-helpers';
import type { Db } from '../types';
import { migration001 } from './001-app-meta';

let db: Db;
afterEach(() => db?.close());

describe('migration 001 app-meta', () => {
  it('creates app_meta with created_at', () => {
    ({ db } = scratchDb());
    runMigrations(db, [migration001], recordingLogger());
    expect(tables(db)).toEqual(['app_meta', 'schema_migrations']);
    const row = db.prepare("SELECT value FROM app_meta WHERE key = 'created_at'").get() as {
      value: string;
    };
    expect(new Date(row.value).toString()).not.toBe('Invalid Date');
  });

  it('app_meta keys are unique and values required', () => {
    ({ db } = scratchDb());
    runMigrations(db, [migration001], recordingLogger());
    expect(() =>
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('created_at', 'x')").run(),
    ).toThrow();
    expect(() =>
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('k', NULL)").run(),
    ).toThrow();
  });
});
