import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('main process logging rules', () => {
  it('no console.* outside electron/logging (use the logger; it scrubs secrets)', () => {
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (p !== path.join(root, 'logging')) walk(p);
        } else if (
          /\.ts$/.test(e.name) &&
          !/\.spec\.ts$/.test(e.name) &&
          e.name !== 'test-helpers.ts'
        ) {
          const lines = fs.readFileSync(p, 'utf8').split('\n');
          lines.forEach((line, i) => {
            if (/\bconsole\.(log|info|warn|error|debug|trace)\b/.test(line)) {
              offenders.push(`${path.relative(root, p)}:${i + 1}`);
            }
          });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
