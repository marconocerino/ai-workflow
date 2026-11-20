import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAGS, SOURCE, compilerCandidates } from './build-win-helper.mjs';

const c = readFileSync(SOURCE, 'utf8');
const code = c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('Windows Ctrl watcher (native/win-key-listener/main.c)', () => {
  it('only ever prints fixed words — never which key was pressed', () => {
    const calls = [...code.matchAll(/\bemit\((.*)\);/g)].map((m) => m[1].trim());
    expect(calls.length).toBeGreaterThan(3);
    for (const arg of calls) {
      expect(arg, `emit(${arg})`).toMatch(
        /^("[A-Z_]+"|other_key_held\(\) \? "CTRL_DOWN dirty" : "CTRL_DOWN clean")$/,
      );
    }
    const lines = [...code.matchAll(/"([A-Z_]+(?: [a-z]+)?)"/g)].map((m) => m[1]);
    expect(new Set(lines)).toEqual(
      new Set(['READY', 'CTRL_DOWN dirty', 'CTRL_DOWN clean', 'CTRL_UP', 'OTHER']),
    );
    // No formatted output on stdout (the only stderr line is the hook error number).
    expect(code).not.toMatch(/(^|[^f])printf\s*\(|fprintf\s*\(\s*stdout/m);
    expect(code).not.toMatch(/fopen|WriteFile|RegSet|Internet|socket/i); // no files, registry, network
  });

  it('never blocks input: every hook passes events on', () => {
    expect(code.match(/return CallNextHookEx\(/g)).toHaveLength(2);
    expect(code).not.toMatch(/return 1;/);
  });

  it('ignores injected input and the AltGr fake Ctrl', () => {
    expect(code).toContain('LLKHF_INJECTED');
    expect(code).toContain('LLMHF_INJECTED');
    expect(code).toContain('scanCode & 0x200');
  });

  it('exits when the app closes its stdin', () => {
    expect(code).toContain('watch_stdin');
    expect(code).toContain('WM_QUIT');
  });

  it('is built strictly (warnings are errors) and uses only user32', () => {
    expect(FLAGS).toEqual(expect.arrayContaining(['-Wall', '-Wextra', '-Werror', '-luser32']));
    expect(compilerCandidates('darwin')).toEqual(['x86_64-w64-mingw32-gcc']);
  });
});
