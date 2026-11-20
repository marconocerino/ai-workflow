import { describe, expect, it } from 'vitest';
import { SettingsValidationError, applyPatch, defaultSettings, sanitizeSettings } from './schema';

describe('sanitizeSettings', () => {
  it('returns defaults for an empty object', () => {
    expect(sanitizeSettings({})).toEqual({ settings: defaultSettings(), issues: [] });
  });

  it('keeps valid values and normalises URLs', () => {
    const { settings, issues } = sanitizeSettings({
      ai: {
        asr: { baseUrl: ' https://asr.ai.company.internal/ ', model: ' qwen3-asr ' },
        llm: { baseUrl: 'http://10.0.0.5:8000/v1', model: 'qwen3-32b' },
        timeoutMs: 5000,
        retries: 0,
      },
    });
    expect(issues).toEqual([]);
    expect(settings.ai.asr).toEqual({
      baseUrl: 'https://asr.ai.company.internal',
      model: 'qwen3-asr',
    });
    expect(settings.ai.llm).toEqual({ baseUrl: 'http://10.0.0.5:8000/v1', model: 'qwen3-32b' });
    expect(settings.ai.timeoutMs).toBe(5000);
    expect(settings.ai.retries).toBe(0);
  });

  it('allows an empty URL (not configured yet)', () => {
    expect(sanitizeSettings({ ai: { llm: { baseUrl: '' } } }).issues).toEqual([]);
  });

  it.each([
    ['not a url', 'must be a valid URL'],
    ['ftp://files.company', 'must start with http:// or https://'],
    ['file:///etc/passwd', 'must start with http:// or https://'],
    ['https://user:pw@host', 'must not contain a user name or password'],
    ['https://host/?key=abc', 'must not contain ? or #'],
    [42, 'must be a string'],
  ])('rejects bad URL %j', (baseUrl, message) => {
    const { settings, issues } = sanitizeSettings({ ai: { llm: { baseUrl } } });
    expect(issues).toEqual([{ path: 'ai.llm.baseUrl', message }]);
    expect(settings.ai.llm.baseUrl).toBe('');
  });

  it.each([
    ['timeoutMs', 10, 'must be between 1000 and 600000'],
    ['timeoutMs', 1.5, 'must be a whole number'],
    ['retries', 11, 'must be between 0 and 10'],
    ['retries', '2', 'must be a whole number'],
  ])('rejects bad %s = %j', (key, value, message) => {
    const { settings, issues } = sanitizeSettings({ ai: { [key]: value } });
    expect(issues).toEqual([{ path: `ai.${key}`, message }]);
    expect(settings.ai).toEqual(defaultSettings().ai);
  });

  it('rejects a too-long model name', () => {
    const { issues } = sanitizeSettings({ ai: { asr: { model: 'x'.repeat(201) } } });
    expect(issues).toEqual([{ path: 'ai.asr.model', message: 'is too long' }]);
  });

  it('drops unknown keys', () => {
    const { settings } = sanitizeSettings({
      ai: { llm: { model: 'm', extra: 1 }, other: true },
      x: 1,
    });
    expect(settings).toEqual({
      ...defaultSettings(),
      ai: { ...defaultSettings().ai, llm: { baseUrl: '', model: 'm' } },
    });
  });

  it('falls back to defaults for non-objects', () => {
    for (const raw of [null, 'x', 3, [], { ai: 'x' }, { ai: { asr: [] } }]) {
      const { settings, issues } = sanitizeSettings(raw);
      expect(issues.length).toBeGreaterThan(0);
      expect(settings).toEqual(defaultSettings());
    }
  });
});

describe('dictation settings (v2)', () => {
  it('defaults: hold Ctrl, Ctrl+Shift+Space, system default mic, mic ready for 10 s', () => {
    expect(defaultSettings().dictation).toEqual({
      mode: 'hold',
      toggleShortcut: ['Ctrl', 'Shift', 'Space'],
      micDeviceId: '',
      keepMicReadySeconds: 10,
    });
  });

  it('accepts a device id and the keep-ready options', () => {
    for (const seconds of [0, 5, 10, 30] as const) {
      const next = applyPatch(defaultSettings(), {
        dictation: { micDeviceId: 'a1B2c3d4e5f6+/=', keepMicReadySeconds: seconds },
      });
      expect(next.dictation).toMatchObject({
        micDeviceId: 'a1B2c3d4e5f6+/=',
        keepMicReadySeconds: seconds,
      });
    }
  });

  it('accepts toggle mode and a valid shortcut', () => {
    const next = applyPatch(defaultSettings(), {
      dictation: { mode: 'toggle', toggleShortcut: ['Ctrl', 'Alt', 'F9'] },
    });
    expect(next.dictation).toMatchObject({ mode: 'toggle', toggleShortcut: ['Ctrl', 'Alt', 'F9'] });
    expect(next.ai).toEqual(defaultSettings().ai);
  });

  it.each([
    [{ mode: 'push' }, 'dictation.mode'],
    [{ toggleShortcut: ['Ctrl'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: ['Ctrl', 'Ctrl'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: ['Ctrl', '<script>'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: ['Shift', 'A'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: ['Ctrl', 'Shift'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: ['Space', 'Ctrl'] }, 'dictation.toggleShortcut'],
    [{ toggleShortcut: 'Ctrl+Space' }, 'dictation.toggleShortcut'],
    ['hold', 'dictation'],
    [{ keepMicReadySeconds: 7 }, 'dictation.keepMicReadySeconds'],
    [{ keepMicReadySeconds: '10' }, 'dictation.keepMicReadySeconds'],
    [{ micDeviceId: '"><script>' }, 'dictation.micDeviceId'],
  ])('rejects %j', (dictation, path) => {
    expect(() => applyPatch(defaultSettings(), { dictation })).toThrow(path);
  });
});

describe('applyPatch', () => {
  it('merges a partial patch over the current settings', () => {
    const current = applyPatch(defaultSettings(), { ai: { llm: { model: 'a' } } });
    const next = applyPatch(current, { ai: { llm: { baseUrl: 'https://llm.company' } } });
    expect(next.ai.llm).toEqual({ baseUrl: 'https://llm.company', model: 'a' });
  });

  it('rejects the whole patch if any field is invalid', () => {
    const current = defaultSettings();
    expect(() =>
      applyPatch(current, { ai: { llm: { model: 'ok', baseUrl: 'nope' }, retries: 99 } }),
    ).toThrow(SettingsValidationError);
    try {
      applyPatch(current, { ai: { retries: 99 } });
    } catch (e) {
      expect((e as SettingsValidationError).issues[0]?.path).toBe('ai.retries');
      expect((e as Error).message).toContain('ai.retries must be between 0 and 10');
    }
  });

  it('does not mutate the current settings', () => {
    const current = defaultSettings();
    applyPatch(current, { ai: { retries: 5 } });
    expect(current).toEqual(defaultSettings());
  });
});
