// Builds the Windows helpers into resources/win/ (needs a Windows C compiler):
//   aiw-key-listener.exe  Hold-Ctrl watcher (native/win-key-listener, VAI-301, D-019)
//   aiw-paste.exe         paste at cursor   (native/win-paste, VAI-304, D-022)
//   macOS: brew install mingw-w64      Windows: MinGW-w64 (gcc on PATH)
// Usage: node scripts/build-win-helper.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(root, 'native', 'win-key-listener', 'main.c');
export const OUTPUT = path.join(root, 'resources', 'win', 'aiw-key-listener.exe');
export const PASTE_SOURCE = path.join(root, 'native', 'win-paste', 'main.c');
export const PASTE_OUTPUT = path.join(root, 'resources', 'win', 'aiw-paste.exe');

/** Each helper with the Windows libraries it may use (nothing else gets linked). */
export const HELPERS = [
  { source: SOURCE, output: OUTPUT, libs: ['-luser32'] },
  { source: PASTE_SOURCE, output: PASTE_OUTPUT, libs: ['-luser32', '-ladvapi32'] },
];

export function compilerCandidates(platform = process.platform) {
  return platform === 'win32' ? ['gcc', 'x86_64-w64-mingw32-gcc'] : ['x86_64-w64-mingw32-gcc'];
}

/** Compiler flags: optimised, warnings as errors, console subsystem, no debug info. */
export const FLAGS = ['-O2', '-Wall', '-Wextra', '-Werror', '-s'];

function findCompiler() {
  for (const cc of compilerCandidates()) {
    try {
      execFileSync(cc, ['--version'], { stdio: 'ignore' });
      return cc;
    } catch {
      // try the next one
    }
  }
  throw new Error(
    'No Windows C compiler found. macOS: `brew install mingw-w64`; Windows: install MinGW-w64.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cc = findCompiler();
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  for (const h of HELPERS) {
    execFileSync(cc, [h.source, '-o', h.output, ...FLAGS, ...h.libs], { stdio: 'inherit' });
    console.log(`built ${path.relative(root, h.output)} with ${cc}`);
  }
}
