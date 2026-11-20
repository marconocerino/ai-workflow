import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUT_DIR, decodePng, iconFiles, renderIcon } from './tray-icons.mjs';

const redPixels = (rgba) => {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i] > 200 && rgba[i + 1] < 100 && rgba[i + 3] > 128) n++;
  return n;
};

describe('tray icons', () => {
  it.each(iconFiles())(
    'assets/tray/$file matches the generator (run `node scripts/tray-icons.mjs`)',
    ({ state, size, file }) => {
      const { size: actual, rgba } = decodePng(readFileSync(path.join(OUT_DIR, file)));
      expect(actual).toBe(size);
      expect(rgba.equals(renderIcon(state, size))).toBe(true);
    },
  );

  it('only the recording icon has the red dot; states look different', () => {
    expect(redPixels(renderIcon('idle', 32))).toBe(0);
    expect(redPixels(renderIcon('listening', 32))).toBe(0);
    expect(redPixels(renderIcon('recording', 32))).toBeGreaterThan(30);
    expect(renderIcon('idle', 32).equals(renderIcon('listening', 32))).toBe(false);
  });
});
