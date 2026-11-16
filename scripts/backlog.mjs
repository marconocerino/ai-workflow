// Read docs/backlog.csv and render PLAN.md. Used by `npm run plan` and by the drift test.
// No dependencies: a small RFC 4180 CSV parser (quoted fields, "" escapes, multi-line fields).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..');
export const BACKLOG_PATH = join(ROOT, 'docs', 'backlog.csv');
export const PLAN_PATH = join(ROOT, 'PLAN.md');

/** Parse CSV text into rows of strings. Handles a UTF-8 BOM and CRLF or LF line endings. */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error('CSV: unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** CSV text → array of objects keyed by the header row. Line breaks inside fields become \n. */
export function parseBacklog(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.map((cells, n) => {
    if (cells.length !== header.length) {
      throw new Error(
        `backlog.csv row ${n + 2}: ${cells.length} fields, expected ${header.length}`,
      );
    }
    return Object.fromEntries(header.map((h, i) => [h.trim(), cells[i].replace(/\r\n?/g, '\n')]));
  });
}

/** S0 < S1 < … < S10 < Backlog (anything non-numeric goes last). */
export function sprintRank(sprint) {
  const m = /^S(\d+)$/.exec(sprint);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

const byOrder = (a, b) =>
  sprintRank(a.Sprint) - sprintRank(b.Sprint) || a.ID.localeCompare(b.ID, 'en', { numeric: true });

const isDone = (s) => s.Status.trim().toLowerCase() === 'done';
const points = (s) => Number(s.Points) || 0;

/** Render PLAN.md from backlog stories. Deterministic, LF line endings. */
export function renderPlan(stories) {
  const lines = [
    '# Plan',
    '',
    '<!-- Generated from docs/backlog.csv by `npm run plan`. Do not edit by hand. -->',
    '',
    'Stories are picked in sprint order (S0, S1, …). Details and acceptance criteria live in',
    '`docs/backlog.csv`.',
    '',
  ];

  // Progress per sprint.
  const sprints = [...new Set(stories.map((s) => s.Sprint))].sort(
    (a, b) => sprintRank(a) - sprintRank(b) || a.localeCompare(b),
  );
  lines.push('## Progress', '', '| Sprint | Stories done | Points done |', '| --- | --- | --- |');
  for (const sprint of sprints) {
    const inSprint = stories.filter((s) => s.Sprint === sprint);
    const done = inSprint.filter(isDone);
    const pts = (list) => list.reduce((sum, s) => sum + points(s), 0);
    lines.push(
      `| ${sprint} | ${done.length} / ${inSprint.length} | ${pts(done)} / ${pts(inSprint)} |`,
    );
  }
  const allDone = stories.filter(isDone);
  const total = (list) => list.reduce((sum, s) => sum + points(s), 0);
  lines.push(
    `| **Total** | **${allDone.length} / ${stories.length}** | **${total(allDone)} / ${total(stories)}** |`,
    '',
  );

  // One section per epic, in first-appearance order of the CSV.
  const epics = [...new Set(stories.map((s) => s.Epic))];
  for (const epic of epics) {
    lines.push(`## ${epic}`, '');
    for (const s of stories.filter((x) => x.Epic === epic).sort(byOrder)) {
      const box = isDone(s) ? '[x]' : '[ ]';
      const status = isDone(s) || s.Status === 'To do' ? '' : ` · ${s.Status}`;
      const pts = `${s.Points} ${points(s) === 1 ? 'pt' : 'pts'}`;
      lines.push(`- ${box} ${s.ID} ${s.Story} — ${s.Sprint} · ${pts} · ${s.Priority}${status}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Read the backlog from disk and return the PLAN.md content. */
export function buildPlanFromDisk(backlogPath = BACKLOG_PATH) {
  return renderPlan(parseBacklog(readFileSync(backlogPath, 'utf8')));
}
