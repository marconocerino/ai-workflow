import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIN_CONTRAST,
  ROOT,
  TEXT_PAIRS,
  TOKENS_DOC_PATH,
  checkPairs,
  colorMap,
  contrast,
  loadTokens,
  parseTokens,
  renderTokensDoc,
} from './tokens.mjs';

describe('parseTokens', () => {
  it('reads maps, values with commas and comments', () => {
    const groups = parseTokens(
      [
        '$colors: (',
        '  // Section',
        "  'ink': #1f2e25, // main text",
        "  'page': #eef0e2,",
        ');',
        '$fonts: (',
        `  'text': "'Archivo Variable', system-ui, sans-serif", // body, labels`,
        ');',
      ].join('\n'),
    );
    expect(groups).toEqual({
      colors: [
        { name: 'ink', value: '#1f2e25', comment: 'main text' },
        { name: 'page', value: '#eef0e2', comment: '' },
      ],
      fonts: [
        {
          name: 'text',
          value: "'Archivo Variable', system-ui, sans-serif",
          comment: 'body, labels',
        },
      ],
    });
  });
});

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 5);
  });

  it('flags failing pairs', () => {
    const [r] = checkPairs({ a: '#999999', b: '#ffffff' }, [['a', 'b', 'test']]);
    expect(r.pass).toBe(false);
    expect(() => checkPairs({}, [['x', 'y', 'missing']])).toThrow(/Unknown colour token/);
  });
});

describe('design tokens', () => {
  const groups = loadTokens();
  const colors = colorMap(groups);

  it('defines every group', () => {
    expect(Object.keys(groups)).toEqual([
      'colors',
      'fonts',
      'space',
      'radius',
      'shadows',
      'borders',
    ]);
    for (const g of Object.values(groups)) expect(g.length).toBeGreaterThan(0);
  });

  it('colours are all 6-digit hex values', () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT_PAIRS.map(([fg, bg, use]) => [fg, bg, use]))(
    'text contrast %s on %s ≥ 4.5:1 (%s)',
    (fg, bg) => {
      expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(MIN_CONTRAST);
    },
  );

  it('design/tokens.md is in sync (run `npm run tokens` if this fails)', () => {
    const onDisk = readFileSync(TOKENS_DOC_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(renderTokensDoc(groups));
  });
});

describe('tokens are defined once', () => {
  const RAW_COLOR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|\brgba?\(|\bhsla?\(/;

  function files(dir) {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it('no raw colour values in src/ outside src/theme/', () => {
    const offenders = [];
    for (const file of files(join(ROOT, 'src'))) {
      const rel = relative(ROOT, file);
      if (rel.startsWith(join('src', 'theme'))) continue;
      if (!/\.(scss|css|html|ts)$/.test(file) || file.endsWith('.spec.ts')) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (RAW_COLOR.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
