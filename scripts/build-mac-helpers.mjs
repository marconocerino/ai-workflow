// Builds the macOS helpers into resources/mac/ (VAI-312; from source only, never packaged):
//   aiw-key-listener  Hold-Ctrl watcher (native/mac-key-listener)
//   aiw-paste         paste at cursor   (native/mac-paste)
// Needs the Swift compiler from Xcode command-line tools (`xcode-select --install`).
// `npm start` runs this on macOS when a helper is missing or older than its source.
// Usage: node scripts/build-mac-helpers.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(root, 'resources', 'mac');

export const MAC_HELPERS = [
  {
    source: path.join(root, 'native', 'mac-key-listener', 'main.swift'),
    output: path.join(OUT_DIR, 'aiw-key-listener'),
  },
  {
    source: path.join(root, 'native', 'mac-paste', 'main.swift'),
    output: path.join(OUT_DIR, 'aiw-paste'),
  },
];

/** Optimised, warnings as errors; Swift 5 mode (the helpers are single-threaded scripts). */
export const SWIFT_FLAGS = ['-O', '-swift-version', '5', '-warnings-as-errors'];

/** Helpers that are missing or older than their source. */
export function staleHelpers(helpers = MAC_HELPERS) {
  return helpers.filter(
    (h) => !existsSync(h.output) || statSync(h.output).mtimeMs < statSync(h.source).mtimeMs,
  );
}

/** Builds what's stale. Returns the built helper names; throws if swiftc is missing or fails. */
export function buildMacHelpers({ all = false, log = console.log } = {}) {
  const todo = all ? MAC_HELPERS : staleHelpers();
  if (todo.length === 0) return [];
  try {
    execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'No Swift compiler found. Install Xcode command-line tools: xcode-select --install',
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const h of todo) {
    execFileSync('xcrun', ['swiftc', ...SWIFT_FLAGS, h.source, '-o', h.output], {
      stdio: 'inherit',
    });
    log(`built ${path.relative(root, h.output)}`);
  }
  return todo.map((h) => path.basename(h.output));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') {
    console.error('The macOS helpers can only be built on a Mac.');
    process.exit(1);
  }
  buildMacHelpers({ all: true });
}
