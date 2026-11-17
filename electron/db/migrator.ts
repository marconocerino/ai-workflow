import type { Db, DbLogger, Migration } from './types';

export class MigrationListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationListError';
  }
}

export class MigrationFailedError extends Error {
  constructor(
    readonly version: number,
    readonly migrationName: string,
    cause: unknown,
  ) {
    super(
      `Migration ${version} (${migrationName}) failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'MigrationFailedError';
  }
}

/** Versions must be 1, 2, 3, … in order, with unique non-empty names. */
export function validateMigrations(list: readonly Migration[]): void {
  list.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationListError(
        `Migration at position ${i + 1} has version ${m.version}; expected ${i + 1}.`,
      );
    }
    if (!/^[a-z0-9-]+$/.test(m.name)) {
      throw new MigrationListError(`Migration ${m.version} has an invalid name "${m.name}".`);
    }
  });
}

export function currentVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: number[];
}

/**
 * Apply every pending migration in order, each in its own transaction, recording it in
 * `schema_migrations` and `PRAGMA user_version`. On failure that migration is rolled back,
 * the error is logged (number, name, message — never row data) and MigrationFailedError thrown;
 * earlier migrations stay applied.
 */
export function runMigrations(
  db: Db,
  list: readonly Migration[],
  logger: DbLogger,
  now: () => Date = () => new Date(),
): MigrationResult {
  validateMigrations(list);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY NOT NULL,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const from = currentVersion(db);
  if (from > list.length) {
    throw new MigrationListError(
      `Database is at version ${from}, newer than this app (${list.length}). Update the app.`,
    );
  }

  const applied: number[] = [];
  for (const migration of list.slice(from)) {
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        now().toISOString(),
      );
      db.pragma(`user_version = ${migration.version}`);
    });
    try {
      apply();
      applied.push(migration.version);
    } catch (e) {
      const error = new MigrationFailedError(migration.version, migration.name, e);
      logger.error(
        `Database: ${error.message}. Rolled back; staying at version ${currentVersion(db)}.`,
      );
      throw error;
    }
  }
  return { from, to: currentVersion(db), applied };
}
