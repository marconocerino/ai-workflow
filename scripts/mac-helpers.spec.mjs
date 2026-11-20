import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAC_HELPERS, SWIFT_FLAGS } from './build-mac-helpers.mjs';

/** Swift source without comments. */
const source = (i) =>
  readFileSync(MAC_HELPERS[i].source, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
const watcher = source(0);
const paste = source(1);

describe('macOS Ctrl watcher (native/mac-key-listener/main.swift)', () => {
  it('only ever prints the shared protocol words — never which key', () => {
    const calls = [...watcher.matchAll(/(?<!func )\bemit\((.*)\)/g)].map((m) => m[1].trim());
    for (const arg of calls) {
      expect(arg, `emit(${arg})`).toMatch(
        /^("[A-Z_]+( [a-z]+)?"|modifiersHeld\.isEmpty && keysHeld\.isEmpty \? "CTRL_DOWN clean" : "CTRL_DOWN dirty")$/,
      );
    }
    const words = [...watcher.matchAll(/emit\("([A-Z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(words)).toEqual(new Set(['NO_PERMISSION', 'CTRL_UP', 'OTHER', 'READY']));
    expect(watcher).not.toMatch(/\bprint\(|FileManager|URLSession|write\(to/);
  });

  it('listen-only tap: can never block or change input', () => {
    expect(watcher).toContain('options: .listenOnly');
    expect(watcher).toContain('return Unmanaged.passUnretained(event)');
    expect(watcher).not.toMatch(/return nil/);
  });

  it('asks for Input Monitoring instead of retrying, ignores our own ⌘V, exits with the app', () => {
    expect(watcher).toContain('CGPreflightListenEventAccess()');
    expect(watcher).toContain('CGRequestListenEventAccess()');
    expect(watcher).toContain('PASTE_MARKER');
    expect(watcher).toContain('FileHandle.standardInput.readDataToEndOfFile()');
    expect(watcher).toContain('tapDisabledByTimeout'); // re-enables itself if macOS pauses it
  });
});

describe('macOS paste helper (native/mac-paste/main.swift)', () => {
  it('prints only fixed result lines — never the text', () => {
    const lines = [...paste.matchAll(/(?:finish|leaveText)\("([^"]*)"\)/g)].map((m) => m[1]);
    expect(new Set(lines)).toEqual(
      new Set([
        'FAILED bad-input',
        'no-permission',
        'no-window',
        'FAILED clipboard',
        'FAILED send',
        'PASTED not-saved',
        'PASTED kept',
      ]),
    );
    expect(paste).toContain(
      'finish(restoreClipboard(saved) ? "PASTED restored" : "PASTED not-saved")',
    );
    expect(paste).toContain('finish(writeText() ? "FAILED \\(reason)" : "FAILED clipboard")');
    expect(paste).not.toMatch(/\bprint\(|NSLog|FileManager|URLSession|write\(to/);
  });

  it('text from stdin only, kept off other devices and out of clipboard managers', () => {
    expect(paste).toContain('FileHandle.standardInput.readDataToEndOfFile()');
    // Only argument: the front-app query (VAI-305), which prints the app name and exits.
    expect(paste).not.toMatch(/ProcessInfo\.processInfo\.arguments/);
    expect(paste.match(/CommandLine\.arguments\[\d\]/g)).toEqual(['CommandLine.arguments[1]']);
    expect(paste).toContain('CommandLine.arguments[1] == "--front-app"');
    expect(paste).toContain('frontmostApplication?.localizedName');
    expect(paste).not.toMatch(/kCGWindowName|CGWindowListCopyWindowInfo/); // never window titles
    expect(paste).toContain('.currentHostOnly');
    expect(paste).toContain('org.nspasteboard.TransientType');
    expect(paste).toContain('org.nspasteboard.ConcealedType');
  });

  it('restores only if nothing new was copied; marks its ⌘V for the watcher', () => {
    expect(paste).toContain('pasteboard.changeCount != ours');
    expect(paste).toContain('AXIsProcessTrusted()');
    expect(paste).toContain('setIntegerValueField(.eventSourceUserData, value: PASTE_MARKER)');
    const marker = /let PASTE_MARKER: Int64 = (0x[0-9a-f_]+)/i;
    expect(paste.match(marker)?.[1]).toBe(watcher.match(marker)?.[1]);
  });

  it('built strictly', () => {
    expect(SWIFT_FLAGS).toEqual(expect.arrayContaining(['-O', '-warnings-as-errors']));
  });
});
