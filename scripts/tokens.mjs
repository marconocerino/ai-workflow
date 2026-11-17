// Read src/theme/_tokens.scss, check text contrast and render design/tokens.md.
// `npm run tokens` writes design/tokens.md; scripts/tokens.spec.mjs checks contrast and drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(import.meta.dirname, '..');
export const TOKENS_PATH = join(ROOT, 'src', 'theme', '_tokens.scss');
export const TOKENS_DOC_PATH = join(ROOT, 'design', 'tokens.md');

/** Minimum WCAG AA contrast for normal text. */
export const MIN_CONTRAST = 4.5;

/**
 * Real text-on-background combinations used in the UI. Every pair must reach 4.5:1.
 * Add a pair whenever a new text colour is placed on a new background.
 */
export const TEXT_PAIRS = [
  ['ink', 'page', 'Headings and text on the page'],
  ['ink', 'surface', 'Text in cards'],
  ['ink', 'sidebar', 'Text in sidebars'],
  ['ink', 'surface-tint', 'Selected option, your transcript line'],
  ['ink', 'active', 'Active nav item'],
  ['ink', 'key', 'Key caps (Ctrl)'],
  ['ink', 'chip', 'Chip text'],
  ['ink', 'bubble', 'Your chat messages'],
  ['ink', 'danger-soft', 'Text on error background'],
  ['ink-muted', 'page', 'Secondary text on the page'],
  ['ink-muted', 'surface', 'Hints in cards'],
  ['ink-muted', 'sidebar', 'Inactive nav items'],
  ['ink-muted', 'chip', 'Muted chip text'],
  ['ink-subtle', 'surface', 'Placeholders in inputs'],
  ['ink-subtle', 'page', 'Placeholders on the page'],
  ['primary', 'page', 'Links on the page'],
  ['primary', 'surface', 'Links and success text in cards'],
  ['primary', 'sidebar', 'Back link in sidebars'],
  ['primary-deep', 'page', 'Section labels'],
  ['on-primary', 'primary', 'Primary buttons, logo'],
  ['danger', 'surface', 'Errors in cards'],
  ['danger', 'page', 'Errors on the page'],
  ['danger', 'danger-soft', 'Recording / error chip'],
  ['on-danger', 'danger', 'Text on the record button'],
  ['success', 'surface', 'Success messages'],
  ['agent-notetaker', 'agent-notetaker-soft', 'N avatar'],
  ['agent-researcher', 'agent-researcher-soft', 'R avatar'],
  ['agent-writer', 'agent-writer-soft', 'W avatar'],
  ['agent-scheduler', 'agent-scheduler-soft', 'S avatar'],
  ['agent-notetaker', 'chip', 'Notetaker status chip'],
  ['agent-researcher', 'chip', 'Researcher status chip'],
  ['agent-writer', 'chip', 'Writer status chip ("Draft ready")'],
  ['agent-scheduler', 'chip', 'Scheduler status chip ("Needs your OK")'],
  ['agent-writer', 'surface', '@Writer mention, speaker name'],
  ['agent-scheduler', 'surface', '@Scheduler mention'],
  ['agent-researcher', 'bubble', '@Researcher mention in your message'],
  ['agent-writer', 'bubble', '@Writer mention in your message'],
  ['agent-scheduler', 'bubble', '@Scheduler mention in your message'],
  ['speaker-blue', 'surface', 'Third speaker name'],
];

const ENTRY = /^\s*'([^']+)':\s*(.+?),\s*(?:\/\/\s*(.*))?$/;

/** Parse the `$map: ( 'name': value, // comment … );` blocks of _tokens.scss. */
export function parseTokens(scss) {
  const groups = {};
  let current = null;
  for (const line of scss.split(/\r?\n/)) {
    const open = /^\$([a-z-]+):\s*\($/.exec(line.trim());
    if (open) {
      current = open[1];
      groups[current] = [];
      continue;
    }
    if (current && line.trim() === ');') {
      current = null;
      continue;
    }
    if (!current) continue;
    const m = ENTRY.exec(line);
    if (m) {
      groups[current].push({
        name: m[1],
        value: m[2].trim().replace(/^"(.*)"$/, '$1'),
        comment: (m[3] ?? '').trim(),
      });
    }
  }
  return groups;
}

export function loadTokens(path = TOKENS_PATH) {
  return parseTokens(readFileSync(path, 'utf8'));
}

/** Colour name → hex. */
export function colorMap(groups) {
  return Object.fromEntries((groups.colors ?? []).map((t) => [t.name, t.value]));
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two hex colours. */
export function contrast(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every TEXT_PAIRS entry with its ratio. Throws if a pair names a missing colour. */
export function checkPairs(colors, pairs = TEXT_PAIRS) {
  return pairs.map(([fg, bg, use]) => {
    if (!colors[fg] || !colors[bg]) throw new Error(`Unknown colour token in pair ${fg}/${bg}`);
    const ratio = contrast(colors[fg], colors[bg]);
    return { fg, bg, use, ratio, pass: ratio >= MIN_CONTRAST };
  });
}

const PREFIX = {
  colors: 'color',
  fonts: 'font',
  space: 'space',
  radius: 'radius',
  shadows: 'shadow',
  borders: 'border',
};
const TITLES = {
  colors: 'Colours',
  fonts: 'Fonts',
  space: 'Spacing',
  radius: 'Corner radius',
  shadows: 'Shadows',
  borders: 'Borders',
};

/** Render design/tokens.md. Deterministic, LF line endings. */
export function renderTokensDoc(groups) {
  const lines = [
    '# Design tokens',
    '',
    '<!-- Generated from src/theme/_tokens.scss by `npm run tokens`. Do not edit by hand. -->',
    '',
    'The look of AI Workflow, sampled from the screenshots in this folder. Defined once in',
    '`src/theme/_tokens.scss`; every screen uses the CSS variables below (never raw values), and',
    'Angular Material colours point at them too (`src/theme/_theme.scss`).',
    '',
  ];
  for (const [group, tokens] of Object.entries(groups)) {
    lines.push(
      `## ${TITLES[group] ?? group}`,
      '',
      '| CSS variable | Value | Use |',
      '| --- | --- | --- |',
    );
    for (const t of tokens) {
      const value = t.value.replace(/\|/g, '\\|');
      lines.push(`| \`--aiw-${PREFIX[group] ?? group}-${t.name}\` | \`${value}\` | ${t.comment} |`);
    }
    lines.push('');
  }
  lines.push(
    '## Text contrast',
    '',
    `Every text colour on every background it is used on must reach ${MIN_CONTRAST}:1 (WCAG AA).`,
    'Checked by `npm test` (scripts/tokens.spec.mjs).',
    '',
    '| Text | Background | Ratio | Where |',
    '| --- | --- | --- | --- |',
  );
  for (const r of checkPairs(colorMap(groups))) {
    lines.push(`| ${r.fg} | ${r.bg} | ${r.ratio.toFixed(2)}:1 ${r.pass ? '✓' : '✗'} | ${r.use} |`);
  }
  lines.push(
    '',
    '## Fonts',
    '',
    'Fraunces, Archivo and JetBrains Mono are bundled with the app from `@fontsource-variable/*`',
    '(SIL Open Font License 1.1) — never loaded from the internet.',
    '',
    '## Changes from the screenshots',
    '',
    "- Placeholder text uses `ink-subtle` (#637063) instead of the design's #838e81 (3.3:1).",
    '- Notetaker avatar background #c5d4bb → #d2dec9 and Writer olive #5e6b1e → #515f1f, so their',
    '  letters and @mentions reach 4.5:1.',
    '- Error/recording chip background #fae0da → #fcece8 so red text on it reaches 4.5:1.',
    '- The black dropdowns and input fields in the screenshots are not copied; inputs use `surface`.',
    '',
  );
  return lines.join('\n');
}

// CLI: `node scripts/tokens.mjs` → write design/tokens.md
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const groups = loadTokens();
  const failing = checkPairs(colorMap(groups)).filter((r) => !r.pass);
  writeFileSync(TOKENS_DOC_PATH, renderTokensDoc(groups));
  console.log(`Wrote ${relative(ROOT, TOKENS_DOC_PATH)}`);
  if (failing.length > 0) {
    for (const r of failing) {
      console.error(`Contrast too low: ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)}:1 (${r.use})`);
    }
    process.exit(1);
  }
}
