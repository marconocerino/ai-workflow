import { type ChildProcess, spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { LogFields } from '../logging/redact';
import { type PasteOutcome, parsePasteLine, pasteOutput, runPasteHelper } from './paste-output';

const SECRET_TEXT = 'Board meeting moved to Thursday';

describe('parsePasteLine', () => {
  it.each([
    ['PASTED restored', { ok: true, clipboard: 'restored' }],
    ['PASTED kept\r', { ok: true, clipboard: 'kept' }],
    ['PASTED not-saved', { ok: true, clipboard: 'not-saved' }],
    ['FAILED elevated', { ok: false, reason: 'elevated' }],
    ['FAILED no-window', { ok: false, reason: 'no-window' }],
    ['FAILED keys-held', { ok: false, reason: 'keys-held' }],
    ['FAILED clipboard', { ok: false, reason: 'clipboard' }],
    ['FAILED send', { ok: false, reason: 'send' }],
    ['FAILED whatever', { ok: false, reason: 'crashed' }],
    ['', { ok: false, reason: 'crashed' }],
    [null, { ok: false, reason: 'crashed' }],
  ])('%j', (line, outcome) => expect(parsePasteLine(line)).toEqual(outcome));
});

/** A tiny Node script standing in for aiw-paste.exe. */
function node(script: string) {
  return (): ChildProcess =>
    spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
}

describe('runPasteHelper', () => {
  it('sends the text on stdin (not the command line) and reads the result line', async () => {
    const echoLength = node(
      `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{` +
        `console.log(s===${JSON.stringify(SECRET_TEXT)}&&process.argv.length<3?'PASTED restored':'FAILED send')})`,
    );
    expect(await runPasteHelper(echoLength, SECRET_TEXT)).toEqual({
      ok: true,
      clipboard: 'restored',
    });
  });

  it('a helper that exits without a line has crashed', async () => {
    expect(await runPasteHelper(node('process.exit(3)'), 'x')).toEqual({
      ok: false,
      reason: 'crashed',
    });
  });

  it('a helper that hangs is killed after the timeout', async () => {
    const started = Date.now();
    const result = await runPasteHelper(node('setInterval(()=>{},1000)'), 'x', 300);
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a helper that cannot start', async () => {
    const missing = () =>
      spawn('/definitely/not/aiw-paste.exe', [], { stdio: ['pipe', 'pipe', 'ignore'] });
    expect(await runPasteHelper(missing, 'x')).toEqual({ ok: false, reason: 'not-started' });
    expect(
      await runPasteHelper(() => {
        throw new Error('spawn failed');
      }, 'x'),
    ).toEqual({ ok: false, reason: 'not-started' });
  });
});

function setup(outcome: PasteOutcome, opts: { clipboardFails?: boolean } = {}) {
  const events: string[] = [];
  const lines: string[] = [];
  const log = (level: string) => (message: string, fields?: LogFields) =>
    lines.push(`${level} ${message} ${JSON.stringify(fields ?? {})}`);
  const output = pasteOutput({
    paste: async (text) => {
      events.push(`paste:${text}`);
      return outcome;
    },
    writeClipboard: async (text) => {
      if (opts.clipboardFails) throw new Error('busy');
      events.push(`clip:${text}`);
    },
    notify: (title, body) => events.push(`note:${title}|${body}`),
    logger: { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') },
    now: () => 0,
  });
  return { output, events, lines };
}

describe('pasteOutput', () => {
  it('pasted: no notification, nothing else touched; log has no text', async () => {
    const { output, events, lines } = setup({ ok: true, clipboard: 'restored' });
    await output.text(SECRET_TEXT);
    expect(events).toEqual([`paste:${SECRET_TEXT}`]);
    expect(lines).toEqual(['info Pasted {"clipboard":"restored","ms":0}']);
  });

  it('admin window: the helper left the text on the clipboard; explains why', async () => {
    const { output, events } = setup({ ok: false, reason: 'elevated' });
    await output.text(SECRET_TEXT);
    expect(events).toEqual([
      `paste:${SECRET_TEXT}`,
      "note:Couldn't paste|Can't type into an app running as administrator. Text copied — press Ctrl+V.",
    ]);
  });

  it.each(['no-window', 'send'] as const)(
    '%s: text already on the clipboard; generic notice',
    async (reason) => {
      const { output, events } = setup({ ok: false, reason });
      await output.text(SECRET_TEXT);
      expect(events).toEqual([
        `paste:${SECRET_TEXT}`,
        "note:Couldn't paste|Couldn't paste here. Text copied — press Ctrl+V.",
      ]);
    },
  );

  it.each(['crashed', 'timeout', 'not-started', 'clipboard'] as const)(
    '%s: the app copies the text itself, then the notice',
    async (reason) => {
      const { output, events, lines } = setup({ ok: false, reason });
      await output.text(SECRET_TEXT);
      expect(events).toEqual([
        `paste:${SECRET_TEXT}`,
        `clip:${SECRET_TEXT}`,
        "note:Couldn't paste|Couldn't paste here. Text copied — press Ctrl+V.",
      ]);
      expect(lines.join('\n')).toContain(`warn Paste failed {"reason":"${reason}","ms":0}`);
      expect(lines.join('\n')).not.toContain('Thursday');
    },
  );

  it('if even copying fails, says so (never claims "copied")', async () => {
    const { output, events } = setup({ ok: false, reason: 'crashed' }, { clipboardFails: true });
    await output.text(SECRET_TEXT);
    expect(events.at(-1)).toBe(
      "note:Couldn't paste|Couldn't paste or copy the text. Please dictate again.",
    );
  });

  it('transcription problems are shown as before', () => {
    const { output, events } = setup({ ok: true, clipboard: 'restored' });
    output.problem('Nothing was heard.');
    expect(events).toEqual(['note:Dictation failed|Nothing was heard.']);
  });
});
