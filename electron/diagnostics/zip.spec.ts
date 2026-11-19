import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../db/test-helpers';
import { createZip, readZip } from './zip';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const entries = [
  { name: 'README.txt', data: Buffer.from('hello\n') },
  { name: 'logs/main.log', data: Buffer.from('line\n'.repeat(500)) },
  { name: 'ünïcode.json', data: Buffer.from('{"ok":true}') },
  { name: 'empty.txt', data: Buffer.alloc(0) },
];

describe('zip', () => {
  it('round-trips files (stored and deflated) with CRC checks', () => {
    const zip = createZip(entries);
    const out = readZip(zip);
    expect([...out.keys()]).toEqual(entries.map((e) => e.name));
    for (const e of entries) expect(out.get(e.name)!.equals(e.data)).toBe(true);
    // The repetitive log is compressed.
    expect(zip.length).toBeLessThan(entries[1].data.length);
  });

  it('detects corruption', () => {
    const zip = createZip([{ name: 'a.txt', data: Buffer.from('abcdef') }]);
    zip[30 + 'a.txt'.length] ^= 0xff; // flip a byte of the stored data
    expect(() => readZip(zip)).toThrow(/CRC/);
  });

  it('rejects unsafe or duplicate names', () => {
    const data = Buffer.from('x');
    expect(() => createZip([{ name: '../evil', data }])).toThrow();
    expect(() => createZip([{ name: '/abs', data }])).toThrow();
    expect(() =>
      createZip([
        { name: 'a', data },
        { name: 'a', data },
      ]),
    ).toThrow();
  });

  it('opens with the system zip tool when one is available', () => {
    const dir = tempDir('aiw-zip-');
    dirs.push(dir);
    const file = path.join(dir, 'x.zip');
    fs.writeFileSync(file, createZip(entries));
    let listing: string;
    try {
      // bsdtar (macOS, Windows 10+) reads zip files.
      listing = execFileSync('tar', ['-tf', file], { encoding: 'utf8' });
    } catch {
      return; // no zip-capable tar here (e.g. GNU tar) — the round trip above still covers it
    }
    const names = listing
      .split(/\r?\n/)
      .filter(Boolean)
      .map((n) => n.normalize('NFC'));
    expect(names).toEqual(entries.map((e) => e.name.normalize('NFC')));
  });
});
