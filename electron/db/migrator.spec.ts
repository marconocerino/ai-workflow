import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations';
import {
  MigrationFailedError,
  MigrationListError,
  currentVersion,
  runMigrations,
  validateMigrations,
} from './migrator';
import { recordingLogger, scratchDb, tables } from './test-helpers';
import type { Db, Migration } from './types';

const created: Db[] = [];
afterEach(() => {
  for (const db of created.splice(0)) if (db.open) db.close();
});

function fresh() {
  const s = scratchDb();
  created.push(s.db);
  return s;
}

const m = (version: number, name: string, sql: string): Migration => ({
  version,
  name,
  up: (db) => db.exec(sql),
});

describe('validateMigrations', () => {
  it('accepts 1, 2, 3 …', () => {
    expect(() => validateMigrations([m(1, 'a', ''), m(2, 'b', '')])).not.toThrow();
  });

  it.each([
    ['a gap', [m(1, 'a', ''), m(3, 'c', '')]],
    ['a duplicate', [m(1, 'a', ''), m(1, 'b', '')]],
    ['wrong order', [m(2, 'b', ''), m(1, 'a', '')]],
    ['not starting at 1', [m(2, 'b', '')]],
    ['a bad name', [m(1, 'Bad Name!', '')]],
  ])('rejects %s', (_label, list) => {
    expect(() => validateMigrations(list)).toThrow(MigrationListError);
  });

  it('the real list is valid', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow();
  });
});

describe('runMigrations', () => {
  const list = [
    m(1, 'one', 'CREATE TABLE one (id INTEGER PRIMARY KEY)'),
    m(2, 'two', 'CREATE TABLE two (id INTEGER PRIMARY KEY)'),
    m(3, 'three', 'ALTER TABLE two ADD COLUMN label TEXT'),
  ];

  it('applies every migration in order and records them', () => {
    const { db } = fresh();
    const order: number[] = [];
    const tracked = list.map((x) => ({ ...x, up: (d: Db) => (order.push(x.version), x.up(d)) }));
    const result = runMigrations(
      db,
      tracked,
      recordingLogger(),
      () => new Date('2026-11-17T00:00:00Z'),
    );
    expect(result).toEqual({ from: 0, to: 3, applied: [1, 2, 3] });
    expect(order).toEqual([1, 2, 3]);
    expect(currentVersion(db)).toBe(3);
    expect(db.prepare('SELECT version, name, applied_at FROM schema_migrations').all()).toEqual([
      { version: 1, name: 'one', applied_at: '2026-11-17T00:00:00.000Z' },
      { version: 2, name: 'two', applied_at: '2026-11-17T00:00:00.000Z' },
      { version: 3, name: 'three', applied_at: '2026-11-17T00:00:00.000Z' },
    ]);
  });

  it('only applies what is pending', () => {
    const { db } = fresh();
    runMigrations(db, list.slice(0, 2), recordingLogger());
    expect(runMigrations(db, list, recordingLogger())).toEqual({ from: 2, to: 3, applied: [3] });
    expect(runMigrations(db, list, recordingLogger())).toEqual({ from: 3, to: 3, applied: [] });
  });

  it('rolls back a failed migration, logs it and keeps earlier ones', () => {
    const { db } = fresh();
    const logger = recordingLogger();
    const failing: Migration = {
      version: 2,
      name: 'half-done',
      up(d) {
        d.exec('CREATE TABLE half (id INTEGER PRIMARY KEY)');
        d.exec('INSERT INTO half (id) VALUES (1)');
        throw new Error('boom');
      },
    };
    expect(() => runMigrations(db, [list[0]!, failing, list[2]!], logger)).toThrow(
      MigrationFailedError,
    );
    expect(tables(db)).toEqual(['one', 'schema_migrations']); // "half" rolled back
    expect(currentVersion(db)).toBe(1);
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(logger.lines).toEqual([
      'error: Database: Migration 2 (half-done) failed: boom. Rolled back; staying at version 1.',
    ]);
    // Database still usable, and a fixed migration 2 can be applied later.
    expect(runMigrations(db, list, recordingLogger()).applied).toEqual([2, 3]);
  });

  it('rolls back SQL errors too', () => {
    const { db } = fresh();
    expect(() =>
      runMigrations(
        db,
        [m(1, 'bad-sql', 'CREATE TABLE ok (id INT); CREATE TABLE ok (id INT);')],
        recordingLogger(),
      ),
    ).toThrow(/Migration 1 \(bad-sql\) failed/);
    expect(tables(db)).toEqual(['schema_migrations']);
    expect(currentVersion(db)).toBe(0);
  });

  it('refuses a database newer than the app', () => {
    const { db } = fresh();
    runMigrations(db, list, recordingLogger());
    expect(() => runMigrations(db, list.slice(0, 1), recordingLogger())).toThrow(
      /newer than this app/,
    );
  });
});

describe('every migration has a test', () => {
  it('NNN-name.ts has NNN-name.spec.ts', () => {
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir);
    const migrations = files.filter((f) => /^\d{3}-.+\.ts$/.test(f) && !f.endsWith('.spec.ts'));
    expect(migrations.length).toBe(MIGRATIONS.length);
    for (const f of migrations) {
      expect(files, `missing test for ${f}`).toContain(f.replace(/\.ts$/, '.spec.ts'));
    }
  });

  it('file numbers match registry versions', () => {
    const files = fs
      .readdirSync(path.join(__dirname, 'migrations'))
      .filter((f) => /^\d{3}-.+\.ts$/.test(f) && !f.endsWith('.spec.ts'))
      .sort();
    expect(files.map((f) => Number(f.slice(0, 3)))).toEqual(MIGRATIONS.map((x) => x.version));
    expect(files.map((f) => f.slice(4, -3))).toEqual(MIGRATIONS.map((x) => x.name));
  });
});
