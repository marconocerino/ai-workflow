import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The YAML parser electron-builder itself uses to read this file.
const require = createRequire(
  createRequire(import.meta.url).resolve('app-builder-lib/package.json'),
);
const yaml = require('js-yaml');
const config = yaml.load(readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
const nsh = readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('Windows installer (VAI-108)', () => {
  it('per-user NSIS installer that never asks for admin rights', () => {
    expect(config.win.target.map((t) => t.target)).toEqual(['nsis', 'zip']);
    expect(config.nsis).toMatchObject({
      oneClick: true,
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
      deleteAppDataOnUninstall: false,
      include: 'build/installer.nsh',
    });
    expect(config.win.requestedExecutionLevel ?? 'asInvoker').toBe('asInvoker');
  });

  it('has a fixed upgrade GUID (independent of the placeholder appId)', () => {
    expect(config.nsis.guid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('installer file name matches what check-signature and the docs expect', () => {
    expect(config.nsis.artifactName).toBe('AI-Workflow-Setup-${version}.${ext}');
  });

  it('uninstall: asks (default keep), silent keeps unless /DELETEDATA, never during updates', () => {
    expect(nsh).toMatch(/!macro customUnInstall/);
    expect(nsh).toMatch(/\$\{ifNot\} \$\{isUpdated\}/);
    expect(nsh).toMatch(/GetOptions\} \$R0 "\/DELETEDATA"/);
    expect(nsh).toMatch(/GetOptions\} \$R0 "\/S"/);
    // Question defaults to the second button ("No" = keep) and has no /SD (would auto-answer).
    expect(nsh).toMatch(/MB_YESNO\|MB_ICONQUESTION\|MB_DEFBUTTON2/);
    expect(nsh).not.toMatch(/\/SD /);
    expect(nsh).toMatch(/RMDir \/r "\$APPDATA\\\$\{APP_FILENAME\}"/);
  });

  it('release build refuses to finish unsigned', () => {
    expect(pkg.scripts['release:win']).toContain('-c.forceCodeSigning=true');
    expect(pkg.scripts['release:win']).toContain('scripts/check-signature.mjs');
  });
});

describe('packaged files', () => {
  it('every platform files list has an include pattern (else electron-builder packs the repo)', () => {
    for (const platform of ['win', 'mac', 'linux']) {
      const files = config[platform].files ?? [];
      expect(
        files.some((f) => !f.startsWith('!')),
        platform,
      ).toBe(true);
    }
  });

  it('ships the third-party licence notices', () => {
    expect(config.files).toContain('THIRD_PARTY_NOTICES.md');
  });
});

describe('Electron fuses', () => {
  it('hardening fuses are set', () => {
    expect(config.electronFuses).toMatchObject({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableCookieEncryption: true,
      onlyLoadAppFromAsar: true,
      enableEmbeddedAsarIntegrityValidation: true,
      grantFileProtocolExtraPrivileges: false,
    });
  });
});
