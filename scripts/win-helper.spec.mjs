import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAGS, HELPERS, PASTE_SOURCE, SOURCE, compilerCandidates } from './build-win-helper.mjs';

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
    expect(FLAGS).toEqual(expect.arrayContaining(['-Wall', '-Wextra', '-Werror']));
    expect(HELPERS.find((h) => h.source === SOURCE)?.libs).toEqual(['-luser32']);
    expect(compilerCandidates('darwin')).toEqual(['x86_64-w64-mingw32-gcc']);
  });
});

const paste = readFileSync(PASTE_SOURCE, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('Windows paste helper (native/win-paste/main.c)', () => {
  it('only ever prints fixed result words — never the text', () => {
    const lines = [...paste.matchAll(/"((?:PASTED|FAILED) [a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(lines)).toEqual(
      new Set([
        'PASTED restored',
        'PASTED kept',
        'PASTED not-saved',
        'FAILED bad-input',
        'FAILED no-window',
        'FAILED elevated',
        'FAILED keys-held',
        'FAILED clipboard',
        'FAILED send',
      ]),
    );
    // One output function, fed only string literals or the `problem`/`line` that hold them.
    expect([...paste.matchAll(/\bemit\((.*?)\);/g)].map((m) => m[1])).toEqual(['line']);
    expect(paste).not.toMatch(/(^|[^f])printf\s*\(|fprintf|fwrite|WriteConsole/m);
    expect(paste).not.toMatch(/fopen|CreateFile|WriteFile|RegSet|Internet|socket/i);
  });

  it('reads the text from stdin, never the command line, and wipes it', () => {
    expect(paste).toContain('GetStdHandle(STD_INPUT_HANDLE)');
    expect(paste).toMatch(/int main\(void\)/);
    expect(paste).not.toMatch(/argv|GetCommandLine/);
    expect(paste).toContain('SecureZeroMemory(text');
  });

  it('keeps the dictated text out of clipboard history, cloud sync and clipboard managers', () => {
    for (const f of [
      'ExcludeClipboardContentFromMonitorProcessing',
      'CanIncludeInClipboardHistory',
      'CanUploadToCloudClipboard',
    ]) {
      expect(paste).toContain(`L"${f}"`);
    }
  });

  it('restores the clipboard only if nothing new was copied, and skips admin windows', () => {
    expect(paste).toContain('GetClipboardSequenceNumber() != ours');
    expect(paste).toContain('TokenElevation');
    expect(paste).toMatch(/#define RESTORE_DELAY_MS 500/);
  });

  it('links only user32 and advapi32 (token check)', () => {
    expect(HELPERS.find((h) => h.source === PASTE_SOURCE)?.libs).toEqual([
      '-luser32',
      '-ladvapi32',
    ]);
  });
});
