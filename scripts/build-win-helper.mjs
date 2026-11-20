// Builds the Windows Ctrl watcher (native/win-key-listener/main.c) into
// resources/win/aiw-key-listener.exe (VAI-301, D-019). Needs a Windows C compiler:
//   macOS: brew install mingw-w64      Windows: MinGW-w64 (gcc on PATH)
// Usage: node scripts/build-win-helper.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(root, 'native', 'win-key-listener', 'main.c');
export const OUTPUT = path.join(root, 'resources', 'win', 'aiw-key-listener.exe');

export function compilerCandidates(platform = process.platform) {
  return platform === 'win32' ? ['gcc', 'x86_64-w64-mingw32-gcc'] : ['x86_64-w64-mingw32-gcc'];
}

/** Compiler flags: optimised, warnings as errors, console subsystem, user32 only, no debug info. */
export const FLAGS = ['-O2', '-Wall', '-Wextra', '-Werror', '-s', '-luser32'];

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
  execFileSync(cc, [SOURCE, '-o', OUTPUT, ...FLAGS], { stdio: 'inherit' });
  console.log(`built ${path.relative(root, OUTPUT)} with ${cc}`);
}
