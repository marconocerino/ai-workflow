import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatabaseStatus } from '../../shared/ipc-contract';
import type { AnySecretName } from '../settings/secret-store';
import { MIGRATIONS } from './migrations';
import { MigrationFailedError, currentVersion, runMigrations } from './migrator';
import { KEY_PATTERN, WrongKeyError, openEncrypted } from './open';
import type { Db, DbLogger, Migration } from './types';

/** The parts of SecretStore the database needs (main-only key). */
export interface KeyStore {
  isAvailable(): boolean;
  has(name: AnySecretName): boolean;
  get(name: AnySecretName): string | null;
  set(name: AnySecretName, value: string): void;
}

export interface AppDatabaseOptions {
  logger?: DbLogger;
  now?: () => Date;
  migrations?: readonly Migration[];
}

const KEY_NAME = 'db.key';

/**
 * The app's local, encrypted SQLite database (`<dir>/app.db`).
 *
 * - First run: creates a random key (stored encrypted by the OS via the secret store), creates
 *   the file and applies all migrations.
 * - No OS encryption: stays closed (status "unavailable"); nothing is written unencrypted.
 * - Key lost or wrong: moves the unreadable file aside and starts a new database.
 * - Migration fails: that migration is rolled back and logged; status "error".
 *
 * Never throws from open(): the app always starts. Main process only.
 */
export class AppDatabase {
  readonly file: string;
  private db: Db | null = null;
  private state: DatabaseStatus = { status: 'error', schemaVersion: 0, encrypted: true };
  private readonly logger: DbLogger;
  private readonly now: () => Date;
  private readonly migrations: readonly Migration[];

  constructor(
    dir: string,
    private readonly keys: KeyStore,
    options: AppDatabaseOptions = {},
  ) {
    this.file = path.join(dir, 'app.db');
    this.logger = options.logger ?? console;
    this.now = options.now ?? (() => new Date());
    this.migrations = options.migrations ?? MIGRATIONS;
  }

  open(): DatabaseStatus {
    this.close();

    if (!this.keys.isAvailable()) {
      this.logger.warn('Database: OS encryption is not available; local storage is disabled.');
      return this.set('unavailable', 0, 'Secure storage is not available on this computer.');
    }

    let db: Db;
    try {
      db = this.openWithKey();
    } catch (e) {
      this.logger.error(`Database: could not open (${e instanceof Error ? e.name : 'error'}).`);
      return this.set('error', 0, 'The local database could not be opened.');
    }

    try {
      if (currentVersion(db) > 0 && currentVersion(db) < this.migrations.length) this.backup(db);
      const result = runMigrations(db, this.migrations, this.logger, this.now);
      this.db = db;
      return this.set('ok', result.to);
    } catch (e) {
      const version = safeVersion(db);
      db.close();
      if (e instanceof MigrationFailedError) {
        return this.set('error', version, `Database update ${e.version} failed.`);
      }
      this.logger.error(`Database: ${e instanceof Error ? e.message : 'migration error'}`);
      return this.set('error', version, 'The local database could not be updated.');
    }
  }

  status(): DatabaseStatus {
    return { ...this.state };
  }

  /** The open connection for feature stores (main process only). Null unless status is ok. */
  connection(): Db | null {
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /** Read the stored key, or create one on first run. Recovers from a lost or wrong key. */
  private openWithKey(): Db {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const exists = fs.existsSync(this.file);
    const stored = this.keys.has(KEY_NAME) ? this.keys.get(KEY_NAME) : null;
    const usable = stored !== null && KEY_PATTERN.test(stored);

    if (exists && !usable) {
      this.moveAside('the key is missing or unreadable');
    }
    const key = usable ? stored : this.newKey();
    try {
      return openEncrypted(this.file, key);
    } catch (e) {
      if (!(e instanceof WrongKeyError)) throw e;
      this.moveAside('it could not be decrypted with the stored key');
      return openEncrypted(this.file, this.newKey());
    }
  }

  private newKey(): string {
    const key = randomBytes(32).toString('hex');
    this.keys.set(KEY_NAME, key);
    return key;
  }

  private moveAside(reason: string): void {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const target = path.join(path.dirname(this.file), `app.unreadable-${stamp}.db`);
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(this.file + suffix)) fs.renameSync(this.file + suffix, target + suffix);
    }
    this.logger.warn(
      `Database: ${reason}; moved the old file to ${path.basename(target)} and started a new one.`,
    );
  }

  /** One copy of the database before applying new migrations (still encrypted). */
  private backup(db: Db): void {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(this.file, `${this.file}.bak`);
    } catch {
      this.logger.warn('Database: could not write a backup before updating.');
    }
  }

  private set(status: DatabaseStatus['status'], schemaVersion: number, message?: string) {
    this.state = { status, schemaVersion, encrypted: true, ...(message ? { message } : {}) };
    return this.status();
  }
}

function safeVersion(db: Db): number {
  try {
    return currentVersion(db);
  } catch {
    return 0;
  }
}
