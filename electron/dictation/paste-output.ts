import type { ChildProcess } from 'node:child_process';
import type { ScopedLogger } from '../logging/logger';
import type { DictationOutput } from './dictation-pipeline';

/** Reasons the helper reports, plus what can go wrong running it. */
export type PasteFailure =
  | 'bad-input'
  | 'no-window'
  | 'elevated'
  | 'no-permission'
  | 'keys-held'
  | 'clipboard'
  | 'send'
  | 'crashed'
  | 'timeout'
  | 'not-started';

export type PasteOutcome =
  { ok: true; clipboard: 'restored' | 'kept' | 'not-saved' } | { ok: false; reason: PasteFailure };

/** The helper gives up well before this; it waits ≤ 0.5 s for keys and 0.5 s before restoring. */
export const PASTE_TIMEOUT_MS = 3_000;

const HELPER_REASONS = new Set<PasteFailure>([
  'bad-input',
  'no-window',
  'elevated',
  'no-permission',
  'keys-held',
  'clipboard',
  'send',
]);
/** Failures after which the helper has already left the text on the clipboard. */
const TEXT_LEFT_ON_CLIPBOARD = new Set<PasteFailure>([
  'no-window',
  'elevated',
  'no-permission',
  'keys-held',
  'send',
]);

/** Windows apps (Notepad, Outlook) expect CRLF line breaks, e.g. for Polished paragraphs. */
export function forPlatform(text: string, platform: NodeJS.Platform | undefined): string {
  return platform === 'win32' ? text.replace(/\r?\n/g, '\r\n') : text;
}

/** The helper's one result line (`PASTED restored`, `FAILED elevated`, …); anything else = crashed. */
export function parsePasteLine(line: string | null | undefined): PasteOutcome {
  const [word, detail] = (line ?? '').trim().split(' ');
  if (word === 'PASTED' && (detail === 'restored' || detail === 'kept' || detail === 'not-saved')) {
    return { ok: true, clipboard: detail };
  }
  if (word === 'FAILED' && HELPER_REASONS.has(detail as PasteFailure)) {
    return { ok: false, reason: detail as PasteFailure };
  }
  return { ok: false, reason: 'crashed' };
}

/**
 * Runs aiw-paste.exe once (VAI-304): the text goes in on stdin (never on the command line),
 * one result line comes back. Killed after `timeoutMs`.
 */
export function runPasteHelper(
  spawn: () => ChildProcess,
  text: string,
  timeoutMs = PASTE_TIMEOUT_MS,
): Promise<PasteOutcome> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn();
    } catch {
      resolve({ ok: false, reason: 'not-started' });
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);
    const finish = (outcome: PasteOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      out += chunk;
      if (out.length > 200) out = out.slice(0, 200); // one short line expected
    });
    child.on('error', () => finish({ ok: false, reason: 'not-started' }));
    child.on('close', () => finish(parsePasteLine(out.split('\n')[0])));
    child.stdin?.on('error', () => undefined); // helper gone early: 'close' reports it
    child.stdin?.end(text, 'utf8');
  });
}

export interface PasteOutputDeps {
  paste(text: string): Promise<PasteOutcome>;
  /** Used when the helper couldn't leave the text on the clipboard itself. */
  writeClipboard(text: string): void | Promise<void>;
  notify(title: string, body: string): void;
  /** For the paste key in messages: ⌘V on macOS, Ctrl+V elsewhere. */
  platform?: NodeJS.Platform;
  logger?: ScopedLogger;
  now?(): number;
}

/** What went wrong, in plain words (the text is on the clipboard in every case). */
function fallbackMessage(reason: PasteFailure, pasteKey: string): string {
  const copied = `Text copied — press ${pasteKey}.`;
  switch (reason) {
    case 'elevated':
      return `Can't type into an app running as administrator. ${copied}`;
    case 'keys-held':
      return `Couldn't paste while Alt or the Windows key was held. ${copied}`;
    case 'no-permission':
      return `To paste automatically, allow Accessibility in System Settings (see Settings → Dictation). ${copied}`;
    default:
      return `Couldn't paste here. ${copied}`;
  }
}

/**
 * Paste at the cursor (VAI-304, D-022; macOS from source: VAI-312). On success there's no notification — the text is just
 * there and the clipboard is back as it was. If pasting fails, the text stays on the clipboard
 * and a notification says so. Logs the outcome only, never the text.
 */
export function pasteOutput(d: PasteOutputDeps): DictationOutput {
  const now = d.now ?? (() => performance.now());
  const pasteKey = d.platform === 'darwin' ? '⌘V' : 'Ctrl+V';
  return {
    async text(dictated) {
      const text = forPlatform(dictated, d.platform);
      const started = now();
      const outcome = await d.paste(text);
      const ms = Math.round(now() - started);
      if (outcome.ok) {
        d.logger?.info('Pasted', { clipboard: outcome.clipboard, ms });
        return;
      }
      d.logger?.warn('Paste failed', { reason: outcome.reason, ms });
      if (!TEXT_LEFT_ON_CLIPBOARD.has(outcome.reason)) {
        try {
          await d.writeClipboard(text);
        } catch {
          d.logger?.error('Could not copy the text either');
          d.notify("Couldn't paste", "Couldn't paste or copy the text. Please dictate again.");
          return;
        }
      }
      d.notify("Couldn't paste", fallbackMessage(outcome.reason, pasteKey));
    },
    problem(message) {
      d.notify('Dictation failed', message);
    },
  };
}
