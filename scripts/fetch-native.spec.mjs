import { describe, expect, it } from 'vitest';
import { nativePackage } from './fetch-native.mjs';

describe('fetch-native', () => {
  it('resolves the Windows binary package at the same version as libsql', () => {
    const pkg = nativePackage('win32-x64-msvc');
    expect(pkg.name).toBe('@libsql/win32-x64-msvc');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dir.replaceAll('\\', '/')).toMatch(/node_modules\/@libsql\/win32-x64-msvc$/);
  });

  it('rejects unknown targets', () => {
    expect(() => nativePackage('amiga-68k')).toThrow(/no prebuilt binary/);
  });
});
