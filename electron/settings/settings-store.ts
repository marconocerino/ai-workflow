import * as path from 'node:path';
import type { Settings, SettingsPatch } from '../../shared/settings';
import { moveAside, readFileOrNull, writeFileAtomic } from './files';
import { migrate, readEnvelope } from './migrations';
import { SETTINGS_VERSION, applyPatch, defaultSettings, sanitizeSettings } from './schema';

export interface StoreLogger {
  warn(message: string): void;
}

export interface SettingsStoreOptions {
  logger?: StoreLogger;
  now?: () => Date;
}

export class SettingsReadOnlyError extends Error {
  constructor() {
    super(
      'Settings were saved by a newer version of AI Workflow. Update the app to change settings.',
    );
    this.name = 'SettingsReadOnlyError';
  }
}

/**
 * Versioned JSON settings in `<dir>/settings.json`: `{ "version": 1, "data": { … } }`.
 *
 * - Missing file → defaults (written on first change).
 * - Older version → migrated, validated and written back.
 * - Corrupt file (bad JSON / bad envelope / failed migration) → moved aside, defaults used.
 * - Bad individual fields → that field falls back to its default.
 * - Newer version → defaults in memory, file left untouched, updates refused.
 *
 * Never throws on load: the app always starts. Never logs setting values.
 */
export class SettingsStore {
  readonly file: string;
  private settings: Settings = defaultSettings();
  private readOnly = false;
  private readonly logger: StoreLogger;
  private readonly now: () => Date;

  constructor(dir: string, options: SettingsStoreOptions = {}) {
    this.file = path.join(dir, 'settings.json');
    this.logger = options.logger ?? console;
    this.now = options.now ?? (() => new Date());
  }

  load(): Settings {
    this.readOnly = false;
    this.settings = defaultSettings();

    let text: string | null;
    try {
      text = readFileOrNull(this.file);
    } catch {
      this.logger.warn('Settings: could not read settings file; using defaults.');
      return this.get();
    }
    if (text === null) return this.get();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return this.recoverFromCorruptFile('not valid JSON');
    }

    const envelope = readEnvelope(parsed);
    if (!envelope) return this.recoverFromCorruptFile('unexpected format');

    if (envelope.version > SETTINGS_VERSION) {
      this.readOnly = true;
      this.logger.warn(
        `Settings: file is version ${envelope.version}, this app supports ${SETTINGS_VERSION}; using defaults and leaving the file untouched.`,
      );
      return this.get();
    }

    let data: unknown;
    try {
      data = migrate(envelope.data, envelope.version, SETTINGS_VERSION);
    } catch {
      return this.recoverFromCorruptFile(`migration from version ${envelope.version} failed`);
    }

    const { settings, issues } = sanitizeSettings(data);
    this.settings = settings;
    if (issues.length > 0) {
      // Paths only, never values.
      this.logger.warn(
        `Settings: reset invalid fields to defaults: ${issues.map((i) => i.path || '(root)').join(', ')}`,
      );
    }
    if (envelope.version < SETTINGS_VERSION || issues.length > 0) this.save();
    return this.get();
  }

  get(): Settings {
    return structuredClone(this.settings);
  }

  /** Validate (strictly) and save. Throws SettingsValidationError naming the bad fields. */
  update(patch: SettingsPatch | unknown): Settings {
    if (this.readOnly) throw new SettingsReadOnlyError();
    this.settings = applyPatch(this.settings, patch);
    this.save();
    return this.get();
  }

  private save(): void {
    if (this.readOnly) return;
    writeFileAtomic(
      this.file,
      JSON.stringify({ version: SETTINGS_VERSION, data: this.settings }, null, 2) + '\n',
    );
  }

  private recoverFromCorruptFile(reason: string): Settings {
    let backup = '(could not move it aside)';
    try {
      backup = path.basename(moveAside(this.file, 'corrupt', this.now()));
    } catch {
      // keep going with defaults
    }
    this.logger.warn(`Settings: file was ${reason}; saved a copy as ${backup} and using defaults.`);
    this.settings = defaultSettings();
    return this.get();
  }
}
