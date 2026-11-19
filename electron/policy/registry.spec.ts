import { describe, expect, it } from 'vitest';
import { parseRegQuery, POLICY_KEYS } from './registry';

describe('parseRegQuery', () => {
  it('reads DWORD and string values (Windows line endings)', () => {
    const out = [
      '',
      'HKEY_CURRENT_USER\\Software\\Policies\\AI Workflow',
      '    Meetings    REG_DWORD    0x1',
      '    Agents    REG_DWORD    0x0',
      '    Some Name    REG_SZ    pilot channel',
      '    Blob    REG_BINARY    0102',
      '',
      'HKEY_CURRENT_USER\\Software\\Policies\\AI Workflow\\Sub',
      '',
    ].join('\r\n');
    expect(parseRegQuery(out)).toEqual({
      Meetings: 1,
      Agents: 0,
      'Some Name': 'pilot channel',
    });
  });

  it('ignores garbage and empty output', () => {
    expect(parseRegQuery('')).toEqual({});
    expect(
      parseRegQuery('ERROR: The system was unable to find the specified registry key'),
    ).toEqual({});
    expect(parseRegQuery('    Meetings    REG_DWORD    banana')).toEqual({});
  });

  it('uses the Policies keys (admin-only) for user and machine', () => {
    expect(POLICY_KEYS).toEqual({
      user: 'HKCU\\Software\\Policies\\AI Workflow',
      machine: 'HKLM\\Software\\Policies\\AI Workflow',
    });
  });
});
