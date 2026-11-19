import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('features IPC', () => {
  it('is read-only: the contract and preload have no way to change flags', () => {
    const root = path.resolve(__dirname, '..', '..');
    const contract = fs.readFileSync(path.join(root, 'shared', 'ipc-contract.ts'), 'utf8');
    const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
    const channels = [...contract.matchAll(/'(features:[a-z-]+)'/g)].map((m) => m[1]);
    expect([...new Set(channels)]).toEqual(['features:get']);
    expect(preload).toMatch(/features: \{\s*get: \(\) => invoke\('features:get'\),\s*\}/);
  });
});
