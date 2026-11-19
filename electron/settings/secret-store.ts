import * as path from 'node:path';
import { SECRET_NAMES, type SecretName } from '../../shared/settings';
import { consoleLogger } from '../logging/logger';
import { moveAside, readFileOrNull, writeFileAtomic } from './files';
import { isObject } from './schema';
import type { StoreLogger } from './settings-store';

/** The parts of Electron's safeStorage we use (injectable for tests). */
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export const MAX_SECRET_LENGTH = 4_096;

export class SecretEncryptionUnavailableError extends Error {
  constructor() {
    super(
      'Secure storage is not available on this computer, so the key was not saved. ' +
        'On Linux, install and unlock a keyring (e.g. GNOME Keyring).',
    );
    this.name = 'SecretEncryptionUnavailableError';
  }
}

export class InvalidSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSecretError';
  }
}

/** Secrets only the main process may touch (never accepted over IPC). */
export const MAIN_ONLY_SECRET_NAMES = ['db.key'] as const;
export type MainOnlySecretName = (typeof MAIN_ONLY_SECRET_NAMES)[number];
export type AnySecretName = SecretName | MainOnlySecretName;

/** Names the renderer may set, check or clear. */
export function isSecretName(name: unknown): name is SecretName {
  return typeof name === 'string' && (SECRET_NAMES as readonly string[]).includes(name);
}

function isAnySecretName(name: unknown): name is AnySecretName {
  return (
    isSecretName(name) ||
    (typeof name === 'string' && (MAIN_ONLY_SECRET_NAMES as readonly string[]).includes(name))
  );
}

/**
 * Secrets encrypted with the OS (safeStorage → DPAPI on Windows, Keychain on macOS) in
 * `<dir>/secrets.json`: `{ "version": 1, "secrets": { "<name>": "<base64 ciphertext>" } }`.
 * Plain text is never written to disk or logged. Only the main process can read values.
 */
export class SecretStore {
  readonly file: string;
  private readonly logger: StoreLogger;
  private readonly now: () => Date;
  private readonly onSecret: (value: string) => void;

  constructor(
    dir: string,
    private readonly encryptor: Encryptor,
    options: {
      logger?: StoreLogger;
      now?: () => Date;
      /** Called with every secret value saved or read, so logs can scrub it (VAI-107). */
      onSecret?: (value: string) => void;
    } = {},
  ) {
    this.file = path.join(dir, 'secrets.json');
    this.logger = options.logger ?? consoleLogger;
    this.now = options.now ?? (() => new Date());
    this.onSecret = options.onSecret ?? (() => undefined);
  }

  set(name: unknown, value: unknown): void {
    this.assertName(name);
    if (typeof value !== 'string' || value.trim() === '') {
      throw new InvalidSecretError('Secret value must be a non-empty string.');
    }
    if (value.length > MAX_SECRET_LENGTH) throw new InvalidSecretError('Secret value is too long.');
    if (!this.encryptor.isEncryptionAvailable()) throw new SecretEncryptionUnavailableError();

    this.onSecret(value.trim());
    const secrets = this.readAll();
    secrets[name] = this.encryptor.encryptString(value.trim()).toString('base64');
    this.writeAll(secrets);
  }

  has(name: unknown): boolean {
    this.assertName(name);
    return name in this.readAll();
  }

  clear(name: unknown): void {
    this.assertName(name);
    const secrets = this.readAll();
    if (!(name in secrets)) return;
    delete secrets[name];
    this.writeAll(secrets);
  }

  /** Main process only — never expose over IPC. Returns null if unset or unreadable. */
  get(name: AnySecretName): string | null {
    const stored = this.readAll()[name];
    if (stored === undefined) return null;
    if (!this.encryptor.isEncryptionAvailable()) return null;
    try {
      const value = this.encryptor.decryptString(Buffer.from(stored, 'base64'));
      this.onSecret(value);
      return value;
    } catch {
      this.logger.warn(`Secrets: could not decrypt ${name}; it needs to be entered again.`);
      return null;
    }
  }

  /** True if OS encryption can be used right now. */
  isAvailable(): boolean {
    return this.encryptor.isEncryptionAvailable();
  }

  private assertName(name: unknown): asserts name is AnySecretName {
    if (!isAnySecretName(name)) throw new InvalidSecretError('Unknown secret name.');
  }

  private readAll(): Partial<Record<AnySecretName, string>> {
    let text: string | null;
    try {
      text = readFileOrNull(this.file);
    } catch {
      this.logger.warn('Secrets: could not read secrets file.');
      return {};
    }
    if (text === null) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isObject(parsed) || parsed['version'] !== 1 || !isObject(parsed['secrets'])) {
        throw new Error('bad format');
      }
      const out: Partial<Record<AnySecretName, string>> = {};
      for (const [k, v] of Object.entries(parsed['secrets'])) {
        if (isAnySecretName(k) && typeof v === 'string') out[k] = v;
      }
      return out;
    } catch {
      let backup = '(could not move it aside)';
      try {
        backup = path.basename(moveAside(this.file, 'corrupt', this.now()));
      } catch {
        // ignore
      }
      this.logger.warn(
        `Secrets: file was unreadable; saved a copy as ${backup}. Keys need to be entered again.`,
      );
      return {};
    }
  }

  private writeAll(secrets: Partial<Record<AnySecretName, string>>): void {
    writeFileAtomic(this.file, JSON.stringify({ version: 1, secrets }, null, 2) + '\n');
  }
}
