# Design tokens

<!-- Generated from src/theme/_tokens.scss by `npm run tokens`. Do not edit by hand. -->

The look of AI Workflow, sampled from the screenshots in this folder. Defined once in
`src/theme/_tokens.scss`; every screen uses the CSS variables below (never raw values), and
Angular Material colours point at them too (`src/theme/_theme.scss`).

## Colours

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-color-page` | `#eef0e2` | app background |
| `--aiw-color-page-dot` | `#cfd8bf` | dotted pattern on the page background |
| `--aiw-color-sidebar` | `#e2e8d2` | sidebars |
| `--aiw-color-surface` | `#fbfcf4` | cards, inputs, popovers |
| `--aiw-color-surface-tint` | `#ebf1e6` | selected option, your transcript lines |
| `--aiw-color-ink` | `#1f2e25` | headings and main text |
| `--aiw-color-ink-muted` | `#4f5e52` | secondary text, hints, inactive nav |
| `--aiw-color-ink-subtle` | `#637063` | placeholders (darker than the design's #838e81 to pass 4.5:1) |
| `--aiw-color-line` | `#2b3d31` | card and control borders |
| `--aiw-color-line-soft` | `#d6dccb` | dividers inside cards |
| `--aiw-color-primary` | `#2f6b45` | buttons, links, logo, focus ring |
| `--aiw-color-on-primary` | `#ffffff` | text on primary |
| `--aiw-color-primary-deep` | `#1f4d3a` | offset shadows, section labels |
| `--aiw-color-active` | `#c5db9c` | active nav item, selected |
| `--aiw-color-key` | `#d3dcc3` | keyboard key caps (Ctrl) |
| `--aiw-color-track` | `#bcc8a9` | toggle track when off |
| `--aiw-color-chip` | `#e6ebd9` | status chips |
| `--aiw-color-bubble` | `#d6e5be` | your messages in agent chat |
| `--aiw-color-danger` | `#c2361f` | recording, errors |
| `--aiw-color-danger-soft` | `#fcece8` | recording halo, error chips (design #fae0da, lightened for 4.5:1) |
| `--aiw-color-on-danger` | `#ffffff` | text on danger |
| `--aiw-color-success` | `#2f6b45` | success text |
| `--aiw-color-agent-notetaker` | `#2f6b45` | N |
| `--aiw-color-agent-notetaker-soft` | `#d2dec9` | N avatar background (design #c5d4bb, lightened for 4.5:1) |
| `--aiw-color-agent-researcher` | `#1f4d3a` | R |
| `--aiw-color-agent-researcher-soft` | `#c6d2bd` | R avatar background |
| `--aiw-color-agent-writer` | `#515f1f` | W (design #5e6b1e, darkened for 4.5:1) |
| `--aiw-color-agent-writer-soft` | `#cfd6b9` | W avatar background |
| `--aiw-color-agent-scheduler` | `#8e3b5a` | S |
| `--aiw-color-agent-scheduler-soft` | `#d6d0c1` | S avatar background |
| `--aiw-color-speaker-blue` | `#2f4f8f` | third speaker |

## Fonts

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-font-display` | `'Fraunces Variable', Georgia, 'Times New Roman', serif` | headings |
| `--aiw-font-text` | `'Archivo Variable', system-ui, -apple-system, 'Segoe UI', sans-serif` | everything else |
| `--aiw-font-mono` | `'JetBrains Mono Variable', ui-monospace, Consolas, 'SF Mono', monospace` | keys, timestamps |

## Spacing

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-space-1` | `4px` | tight gaps |
| `--aiw-space-2` | `8px` | small gaps |
| `--aiw-space-3` | `12px` | control padding |
| `--aiw-space-4` | `16px` | default gap |
| `--aiw-space-5` | `24px` | card padding |
| `--aiw-space-6` | `32px` | section spacing |
| `--aiw-space-7` | `48px` | page padding |

## Corner radius

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-radius-sm` | `6px` | key caps, small chips |
| `--aiw-radius-md` | `10px` | buttons, inputs, nav items |
| `--aiw-radius-lg` | `16px` | cards |
| `--aiw-radius-pill` | `999px` | pills and badges |

## Shadows

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-shadow-card` | `'6px 6px 0 var(--aiw-color-primary-deep)'` | offset shadow under cards |
| `--aiw-shadow-button` | `'3px 3px 0 var(--aiw-color-primary-deep)'` | offset shadow under primary buttons |
| `--aiw-shadow-focus` | `'0 0 0 3px color-mix(in srgb, var(--aiw-color-primary) 35%, transparent)'` | focus halo |

## Borders

| CSS variable | Value | Use |
| --- | --- | --- |
| `--aiw-border-card` | `'2px solid var(--aiw-color-line)'` | cards |
| `--aiw-border-control` | `'1.5px solid var(--aiw-color-line)'` | outlined buttons, key caps |

## Text contrast

Every text colour on every background it is used on must reach 4.5:1 (WCAG AA).
Checked by `npm test` (scripts/tokens.spec.mjs).

| Text | Background | Ratio | Where |
| --- | --- | --- | --- |
| ink | page | 12.33:1 ✓ | Headings and text on the page |
| ink | surface | 13.78:1 ✓ | Text in cards |
| ink | sidebar | 11.32:1 ✓ | Text in sidebars |
| ink | surface-tint | 12.37:1 ✓ | Selected option, your transcript line |
| ink | active | 9.48:1 ✓ | Active nav item |
| ink | key | 10.03:1 ✓ | Key caps (Ctrl) |
| ink | chip | 11.69:1 ✓ | Chip text |
| ink | bubble | 10.71:1 ✓ | Your chat messages |
| ink | danger-soft | 12.40:1 ✓ | Text on error background |
| ink-muted | page | 5.96:1 ✓ | Secondary text on the page |
| ink-muted | surface | 6.65:1 ✓ | Hints in cards |
| ink-muted | sidebar | 5.47:1 ✓ | Inactive nav items |
| ink-muted | chip | 5.65:1 ✓ | Muted chip text |
| ink-subtle | surface | 5.05:1 ✓ | Placeholders in inputs |
| ink-subtle | page | 4.52:1 ✓ | Placeholders on the page |
| primary | page | 5.50:1 ✓ | Links on the page |
| primary | surface | 6.14:1 ✓ | Links and success text in cards |
| primary | sidebar | 5.05:1 ✓ | Back link in sidebars |
| primary-deep | page | 8.34:1 ✓ | Section labels |
| on-primary | primary | 6.34:1 ✓ | Primary buttons, logo |
| danger | surface | 5.29:1 ✓ | Errors in cards |
| danger | page | 4.74:1 ✓ | Errors on the page |
| danger | danger-soft | 4.76:1 ✓ | Recording / error chip |
| on-danger | danger | 5.47:1 ✓ | Text on the record button |
| success | surface | 6.14:1 ✓ | Success messages |
| agent-notetaker | agent-notetaker-soft | 4.54:1 ✓ | N avatar |
| agent-researcher | agent-researcher-soft | 6.12:1 ✓ | R avatar |
| agent-writer | agent-writer-soft | 4.65:1 ✓ | W avatar |
| agent-scheduler | agent-scheduler-soft | 4.67:1 ✓ | S avatar |
| agent-notetaker | chip | 5.21:1 ✓ | Notetaker status chip |
| agent-researcher | chip | 7.91:1 ✓ | Researcher status chip |
| agent-writer | chip | 5.74:1 ✓ | Writer status chip ("Draft ready") |
| agent-scheduler | chip | 5.90:1 ✓ | Scheduler status chip ("Needs your OK") |
| agent-writer | surface | 6.76:1 ✓ | @Writer mention, speaker name |
| agent-scheduler | surface | 6.96:1 ✓ | @Scheduler mention |
| agent-researcher | bubble | 7.25:1 ✓ | @Researcher mention in your message |
| agent-writer | bubble | 5.26:1 ✓ | @Writer mention in your message |
| agent-scheduler | bubble | 5.41:1 ✓ | @Scheduler mention in your message |
| speaker-blue | surface | 7.71:1 ✓ | Third speaker name |

## Fonts

Fraunces, Archivo and JetBrains Mono are bundled with the app from `@fontsource-variable/*`
(SIL Open Font License 1.1) — never loaded from the internet.

## Changes from the screenshots

- Placeholder text uses `ink-subtle` (#637063) instead of the design's #838e81 (3.3:1).
- Notetaker avatar background #c5d4bb → #d2dec9 and Writer olive #5e6b1e → #515f1f, so their
  letters and @mentions reach 4.5:1.
- Error/recording chip background #fae0da → #fcece8 so red text on it reaches 4.5:1.
- The black dropdowns and input fields in the screenshots are not copied; inputs use `surface`.
