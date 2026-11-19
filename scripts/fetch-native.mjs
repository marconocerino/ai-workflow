// Puts libsql's prebuilt binary for another platform into node_modules, so a package for that
// platform can be built on this machine (npm only installs the binary for the current one).
// Usage: node scripts/fetch-native.mjs win32-x64-msvc
// Uses `npm pack`, so it goes through the configured npm registry and checks the integrity hash.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function nativePackage(target, rootDir = root) {
  const libsql = JSON.parse(
    readFileSync(path.join(rootDir, 'node_modules/libsql/package.json'), 'utf8'),
  );
  const name = `@libsql/${target}`;
  const version = libsql.optionalDependencies?.[name];
  if (!version) throw new Error(`libsql has no prebuilt binary package ${name}.`);
  return { name, version, dir: path.join(rootDir, 'node_modules', name) };
}

function fetchNative(target) {
  const pkg = nativePackage(target);
  const installed = path.join(pkg.dir, 'package.json');
  if (
    existsSync(installed) &&
    JSON.parse(readFileSync(installed, 'utf8')).version === pkg.version
  ) {
    console.log(`${pkg.name}@${pkg.version} already present.`);
    return;
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'aiw-native-'));
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const out = execFileSync(npm, ['pack', `${pkg.name}@${pkg.version}`, '--json'], {
      cwd: tmp,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const tarball = path.join(tmp, JSON.parse(out)[0].filename);
    rmSync(pkg.dir, { recursive: true, force: true });
    mkdirSync(pkg.dir, { recursive: true });
    execFileSync('tar', ['-xzf', tarball, '-C', pkg.dir, '--strip-components=1']);
    console.log(`Added ${pkg.name}@${pkg.version}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/fetch-native.mjs <target, e.g. win32-x64-msvc>');
    process.exit(1);
  }
  fetchNative(target);
}
