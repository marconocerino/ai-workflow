import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BACKLOG_PATH,
  PLAN_PATH,
  buildPlanFromDisk,
  parseBacklog,
  parseCsv,
  renderPlan,
  sprintRank,
} from './backlog.mjs';

describe('parseCsv', () => {
  it('handles BOM, CRLF, quotes, escaped quotes and multi-line fields', () => {
    const text = '﻿a,b,c\r\n1,"x, y","line1\r\nline2"\r\n2,"say ""hi""",\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'line1\r\nline2'],
      ['2', 'say "hi"', ''],
    ]);
  });

  it('handles LF and a missing final newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/unterminated/);
  });
});

describe('parseBacklog', () => {
  it('maps rows to objects and normalises line breaks', () => {
    const [s] = parseBacklog('ID,Acceptance criteria\r\nVAI-1,"• one\r\n• two"\r\n');
    expect(s).toEqual({ ID: 'VAI-1', 'Acceptance criteria': '• one\n• two' });
  });

  it('fails loudly on a broken row', () => {
    expect(() => parseBacklog('A,B\n1\n')).toThrow(/row 2/);
  });
});

describe('sprintRank', () => {
  it('orders S0 < S2 < S10 < Backlog', () => {
    const order = ['Backlog', 'S10', 'S2', 'S0'].sort((a, b) => sprintRank(a) - sprintRank(b));
    expect(order).toEqual(['S0', 'S2', 'S10', 'Backlog']);
  });
});

describe('renderPlan', () => {
  const story = (ID, Epic, Sprint, Points, Status) => ({
    ID,
    Epic,
    Story: `Story ${ID}`,
    Sprint,
    Points,
    Priority: 'Must',
    Status,
  });
  const plan = renderPlan([
    story('VAI-2', 'E1 One', 'S1', '5', 'To do'),
    story('VAI-1', 'E1 One', 'S0', '3', 'Done'),
    story('VAI-10', 'E2 Two', 'S10', '2', 'In progress'),
    story('VAI-9', 'E2 Two', 'Backlog', '1', 'To do'),
  ]);

  it('lists stories per epic in sprint order with checkboxes', () => {
    expect(plan).toContain(
      '## E1 One\n\n- [x] VAI-1 Story VAI-1 — S0 · 3 pts · Must\n- [ ] VAI-2 Story VAI-2 — S1 · 5 pts · Must\n',
    );
    expect(plan.indexOf('VAI-10')).toBeLessThan(plan.indexOf('VAI-9 '));
    expect(plan).toContain('VAI-9 Story VAI-9 — Backlog · 1 pt · Must');
    expect(plan).toContain('VAI-10 Story VAI-10 — S10 · 2 pts · Must · In progress');
  });

  it('summarises progress per sprint and in total', () => {
    expect(plan).toContain('| S0 | 1 / 1 | 3 / 3 |');
    expect(plan).toContain('| S1 | 0 / 1 | 0 / 5 |');
    expect(plan).toContain('| **Total** | **1 / 4** | **3 / 11** |');
    expect(plan.indexOf('| S10 |')).toBeLessThan(plan.indexOf('| Backlog |'));
  });

  it('marks itself as generated', () => {
    expect(plan).toContain('Generated from docs/backlog.csv by `npm run plan`');
  });
});

describe('PLAN.md', () => {
  it('is in sync with docs/backlog.csv (run `npm run plan` if this fails)', () => {
    // Ignore line endings: git on Windows may check PLAN.md out with CRLF.
    const onDisk = readFileSync(PLAN_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(buildPlanFromDisk());
  });

  it('covers every backlog story', () => {
    const stories = parseBacklog(readFileSync(BACKLOG_PATH, 'utf8'));
    expect(stories.length).toBeGreaterThan(0);
    const plan = buildPlanFromDisk();
    for (const s of stories) expect(plan).toContain(`${s.ID} ${s.Story} —`);
  });
});
