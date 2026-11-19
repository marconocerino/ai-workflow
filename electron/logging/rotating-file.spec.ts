import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../db/test-helpers';
import { RotatingFile } from './rotating-file';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function dir() {
  const d = tempDir('aiw-log-');
  dirs.push(d);
  return path.join(d, 'logs');
}

describe('RotatingFile', () => {
  it('creates the folder and appends lines', () => {
    const f = new RotatingFile(dir());
    f.write('one');
    f.write('two\n');
    expect(fs.readFileSync(f.file, 'utf8')).toBe('one\ntwo\n');
    expect(f.files()).toEqual([f.file]);
  });

  it('rotates at the size limit and keeps only `keep` files', () => {
    const f = new RotatingFile(dir(), 'main', { maxBytes: 100, keep: 3 });
    for (let i = 0; i < 20; i++) f.write(`line ${String(i).padStart(2, '0')} ${'x'.repeat(30)}`);
    const names = f.files().map((p) => path.basename(p));
    expect(names).toEqual(['main.log', 'main.1.log', 'main.2.log']);
    expect(fs.readdirSync(f.dir).sort()).toEqual(['main.1.log', 'main.2.log', 'main.log']);
    for (const file of f.files()) expect(fs.statSync(file).size).toBeLessThanOrEqual(100);
    // Newest line is in main.log, older ones moved down.
    expect(fs.readFileSync(f.file, 'utf8')).toContain('line 19');
    expect(fs.readFileSync(path.join(f.dir, 'main.1.log'), 'utf8')).toContain('line 17');
  });

  it('continues an existing file after restart and counts its size', () => {
    const d = dir();
    const a = new RotatingFile(d, 'main', { maxBytes: 60, keep: 2 });
    a.write('a'.repeat(40));
    const b = new RotatingFile(d, 'main', { maxBytes: 60, keep: 2 });
    b.write('b'.repeat(40));
    expect(fs.readFileSync(path.join(d, 'main.1.log'), 'utf8')).toContain('aaaa');
    expect(fs.readFileSync(path.join(d, 'main.log'), 'utf8')).toBe('b'.repeat(40) + '\n');
  });

  it('never throws when the folder cannot be written', () => {
    const d = dir();
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, 'a file where the folder should be');
    expect(() => new RotatingFile(d).write('x')).not.toThrow();
  });
});
