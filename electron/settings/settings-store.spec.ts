import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsMigrationError, migrate, readEnvelope } from './migrations';
import { SETTINGS_VERSION, SettingsValidationError, defaultSettings } from './schema';
import { SettingsReadOnlyError, SettingsStore } from './settings-store';

let dir: string;
let warnings: string[];
const now = () => new Date('2026-11-16T12:00:00.000Z');
const file = () => path.join(dir, 'settings.json');
const write = (text: string) => fs.writeFileSync(file(), text);
const readJson = () => JSON.parse(fs.readFileSync(file(), 'utf8')) as unknown;
const store = () => new SettingsStore(dir, { logger: { warn: (m) => warnings.push(m) }, now });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiw-settings-'));
  warnings = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('uses defaults when there is no file, and does not create one until a change', () => {
    expect(store().load()).toEqual(defaultSettings());
    expect(fs.existsSync(file())).toBe(false);
  });

  it('saves versioned JSON and reloads it', () => {
    const s = store();
    s.load();
    s.update({ ai: { llm: { baseUrl: 'https://llm.company', model: 'qwen3' } } });
    expect(readJson()).toEqual({
      version: SETTINGS_VERSION,
      data: {
        ...defaultSettings(),
        ai: { ...defaultSettings().ai, llm: { baseUrl: 'https://llm.company', model: 'qwen3' } },
      },
    });
    expect(store().load().ai.llm.model).toBe('qwen3');
    expect(fs.readdirSync(dir)).toEqual(['settings.json']); // no temp files left behind
  });

  it('migrates an unversioned (v0) file and writes it back as the current version', () => {
    write(JSON.stringify({ ai: { llm: { model: 'legacy' }, retries: 4 } }));
    const loaded = store().load();
    expect(loaded.ai.llm.model).toBe('legacy');
    expect(loaded.ai.retries).toBe(4);
    expect(readJson()).toMatchObject({ version: SETTINGS_VERSION });
  });

  it('v1 file from an earlier build (VAI-204): every value carries over unchanged', () => {
    const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'settings-v1.json'), 'utf8');
    write(v1);
    const loaded = store().load();
    expect(loaded.ai).toEqual(JSON.parse(v1).data.ai);
    expect(loaded.dictation).toEqual(defaultSettings().dictation);
    expect(warnings).toEqual([]);
    // Written back as the current version, old values intact.
    expect(readJson()).toEqual({ version: SETTINGS_VERSION, data: loaded });
    // And still intact after an unrelated change.
    const s = store();
    s.load();
    s.update({ dictation: { mode: 'toggle' } });
    expect((readJson() as { data: { ai: unknown } }).data.ai).toEqual(JSON.parse(v1).data.ai);
  });

  it.each([
    ['broken JSON', '{"version": 1, "data": {'],
    ['empty file', ''],
    ['not an object', '"hello"'],
    ['bad version', '{"version": "one", "data": {}}'],
  ])('falls back to defaults and keeps a copy for %s', (_label, text) => {
    write(text);
    expect(store().load()).toEqual(defaultSettings());
    expect(fs.existsSync(file())).toBe(false);
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('settings.corrupt-'));
    expect(backups).toEqual(['settings.corrupt-2026-11-16T12-00-00-000Z.json']);
    expect(fs.readFileSync(path.join(dir, backups[0]!), 'utf8')).toBe(text);
    expect(warnings).toHaveLength(1);
  });

  it('can save again after recovering from a corrupt file', () => {
    write('garbage');
    const s = store();
    s.load();
    s.update({ ai: { retries: 3 } });
    expect(store().load().ai.retries).toBe(3);
  });

  it('resets only invalid fields, and never logs their values', () => {
    write(
      JSON.stringify({
        version: 1,
        data: { ai: { llm: { baseUrl: 'ftp://secret-host', model: 'keep' }, retries: -1 } },
      }),
    );
    const loaded = store().load();
    expect(loaded.ai.llm).toEqual({ baseUrl: '', model: 'keep' });
    expect(loaded.ai.retries).toBe(defaultSettings().ai.retries);
    expect(warnings.join()).toContain('ai.llm.baseUrl');
    expect(warnings.join()).not.toContain('secret-host');
  });

  it('leaves a file from a newer app version untouched and refuses updates', () => {
    const newer = JSON.stringify({ version: SETTINGS_VERSION + 1, data: { future: true } });
    write(newer);
    const s = store();
    expect(s.load()).toEqual(defaultSettings());
    expect(() => s.update({ ai: { retries: 1 } })).toThrow(SettingsReadOnlyError);
    expect(fs.readFileSync(file(), 'utf8')).toBe(newer);
  });

  it('rejects invalid updates and keeps the previous values on disk', () => {
    const s = store();
    s.load();
    s.update({ ai: { retries: 3 } });
    expect(() => s.update({ ai: { retries: 3000 } })).toThrow(SettingsValidationError);
    expect(s.get().ai.retries).toBe(3);
    expect(store().load().ai.retries).toBe(3);
  });

  it('returns copies, so callers cannot change the stored settings', () => {
    const s = store();
    s.load();
    s.get().ai.retries = 9;
    expect(s.get().ai.retries).toBe(defaultSettings().ai.retries);
  });
});

describe('migrations', () => {
  it('runs each step in order', () => {
    const steps = {
      0: (d: unknown) => ({ ...(d as object), a: 1 }),
      1: (d: unknown) => ({ ...(d as object), b: 2 }),
    };
    expect(migrate({}, 0, 2, steps)).toEqual({ a: 1, b: 2 });
  });

  it('fails when a step is missing', () => {
    expect(() => migrate({}, 0, 2, { 0: (d) => d })).toThrow(SettingsMigrationError);
  });

  it('has a step for every version below the current one', () => {
    expect(() => migrate({}, 0, SETTINGS_VERSION)).not.toThrow();
  });

  it('reads the envelope', () => {
    expect(readEnvelope({ version: 1, data: { x: 1 } })).toEqual({ version: 1, data: { x: 1 } });
    expect(readEnvelope({ ai: {} })).toEqual({ version: 0, data: { ai: {} } });
    expect(readEnvelope({ version: -1 })).toBeNull();
    expect(readEnvelope([])).toBeNull();
  });
});
