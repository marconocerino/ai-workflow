import { execFile } from 'node:child_process';
import * as path from 'node:path';

/** Policy keys. Under Software\Policies, so only admins (GPO/Intune) can write them. */
export const POLICY_KEYS = {
  user: 'HKCU\\Software\\Policies\\AI Workflow',
  machine: 'HKLM\\Software\\Policies\\AI Workflow',
} as const;

export type RegistryValues = Record<string, number | string>;

/**
 * Parse `reg query <key>` output into name → value. Only REG_DWORD (number) and REG_SZ
 * (string) are kept; other types and sub-keys are ignored.
 *
 *   HKEY_CURRENT_USER\Software\Policies\AI Workflow
 *       Meetings    REG_DWORD    0x1
 *       Channel     REG_SZ    pilot
 */
export function parseRegQuery(output: string): RegistryValues {
  const values: RegistryValues = {};
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s{2,}(\S(?:.*?\S)?)\s{2,}(REG_DWORD|REG_SZ)\s{2,}(.*?)\s*$/.exec(line);
    if (!m) continue;
    const [, name, type, raw] = m;
    if (type === 'REG_DWORD') {
      if (/^0x[0-9a-f]{1,8}$/i.test(raw)) values[name] = parseInt(raw, 16);
    } else {
      values[name] = raw;
    }
  }
  return values;
}

export type RegQuery = (key: string) => Promise<string | null>;

/**
 * Runs Windows' own reg.exe (full path, so PATH can't swap it). 64-bit view. Resolves null
 * when the key doesn't exist or reg.exe fails — a missing policy is normal.
 */
export const windowsRegQuery: RegQuery = (key) =>
  new Promise((resolve) => {
    const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
    const reg = path.win32.join(systemRoot, 'System32', 'reg.exe');
    execFile(
      reg,
      ['query', key, '/reg:64'],
      { timeout: 5_000, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
