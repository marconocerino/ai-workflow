import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../db/test-helpers';
import { Logger } from '../logging/logger';
import { loadFeaturePolicy, type PolicySources } from './policy';
import { POLICY_KEYS } from './registry';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function reg(values: Record<string, string>) {
  return [
    '',
    'HKEY\\Software\\Policies\\AI Workflow',
    ...Object.entries(values).map(([k, v]) => `    ${k}    REG_DWORD    ${v}`),
    '',
  ].join('\r\n');
}

function sources(overrides: Partial<PolicySources> = {}) {
  const lines: string[] = [];
  const s: PolicySources = {
    platform: 'win32',
    regQuery: async () => null,
    macFile: '/nonexistent/policy.json',
    logger: new Logger({ sink: (l) => lines.push(l) }).scope('policy'),
    ...overrides,
  };
  return { s, lines };
}

function jsonFile(content: string) {
  const dir = tempDir('aiw-policy-');
  dirs.push(dir);
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(file, content);
  return file;
}

describe('loadFeaturePolicy', () => {
  it('everything is off by default (no policy)', async () => {
    const { s } = sources();
    expect(await loadFeaturePolicy(s)).toEqual({
      flags: { meetings: false, agents: false, voiceprints: false },
      sources: ['defaults'],
    });
  });

  it('per-user registry turns features on (pilot group)', async () => {
    const { s } = sources({
      regQuery: async (key) => (key === POLICY_KEYS.user ? reg({ Meetings: '0x1' }) : null),
    });
    expect(await loadFeaturePolicy(s)).toEqual({
      flags: { meetings: true, agents: false, voiceprints: false },
      sources: ['registry'],
    });
  });

  it('per-machine policy wins over per-user', async () => {
    const { s } = sources({
      regQuery: async (key) =>
        key === POLICY_KEYS.user
          ? reg({ Meetings: '0x1', Agents: '0x1' })
          : reg({ Meetings: '0x0' }),
    });
    expect((await loadFeaturePolicy(s)).flags).toEqual({
      meetings: false,
      agents: true,
      voiceprints: false,
    });
  });

  it('invalid values are ignored and logged; reg.exe failures mean "no policy"', async () => {
    const { s, lines } = sources({
      regQuery: async (key) => {
        if (key === POLICY_KEYS.machine) throw new Error('reg.exe missing');
        return reg({ Voiceprints: '0x2', Agents: '0x1' });
      },
    });
    expect((await loadFeaturePolicy(s)).flags).toEqual({
      meetings: false,
      agents: true,
      voiceprints: false,
    });
    expect(lines.join('\n')).toContain(
      'Ignored policy value (use DWORD 0 or 1) scope=user value=Voiceprints',
    );
  });

  it('result is frozen', async () => {
    const { s } = sources();
    const state = await loadFeaturePolicy(s);
    expect(Object.isFrozen(state.flags)).toBe(true);
  });

  it('test file replaces the OS sources (dev/test only)', async () => {
    const file = jsonFile('{"features":{"meetings":true,"agents":"yes"}}');
    const { s, lines } = sources({
      testFile: file,
      regQuery: async () => reg({ Agents: '0x1' }),
    });
    expect(await loadFeaturePolicy(s)).toEqual({
      flags: { meetings: true, agents: false, voiceprints: false },
      sources: ['file'],
    });
    expect(lines.join('\n')).toContain('Ignored policy value (use true or false) value=agents');
  });

  it('macOS reads the root-owned JSON file; other platforms use defaults', async () => {
    const file = jsonFile('{"features":{"voiceprints":true}}');
    expect(
      (await loadFeaturePolicy(sources({ platform: 'darwin', macFile: file }).s)).flags,
    ).toMatchObject({ voiceprints: true });
    expect(
      (await loadFeaturePolicy(sources({ platform: 'linux', macFile: file }).s)).sources,
    ).toEqual(['defaults']);
  });

  it('unreadable policy file: defaults and a warning', async () => {
    const { s, lines } = sources({ testFile: jsonFile('{not json') });
    expect((await loadFeaturePolicy(s)).sources).toEqual(['defaults']);
    expect(lines.join('\n')).toContain('Policy file could not be read');
  });
});
