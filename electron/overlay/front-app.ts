import type { ChildProcess } from 'node:child_process';

/** Program file names (Windows) and app names (macOS) → the short name people know. */
const FRIENDLY: Record<string, string> = {
  outlook: 'Outlook',
  olk: 'Outlook', // new Outlook for Windows
  'ms-teams': 'Teams',
  teams: 'Teams',
  winword: 'Word',
  word: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  powerpoint: 'PowerPoint',
  onenote: 'OneNote',
  msedge: 'Edge',
  'microsoft edge': 'Edge',
  chrome: 'Chrome',
  'google chrome': 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  code: 'VS Code',
  'visual studio code': 'VS Code',
  notepad: 'Notepad',
  textedit: 'TextEdit',
  notes: 'Notes',
  slack: 'Slack',
  zoom: 'Zoom',
  'zoom.us': 'Zoom',
  explorer: 'File Explorer',
  windowsterminal: 'Terminal',
  terminal: 'Terminal',
  cmd: 'Command Prompt',
  'ai workflow': 'AI Workflow',
  electron: 'AI Workflow', // running from source
};

const MAX_LENGTH = 40;

/** "OUTLOOK.EXE" / "Microsoft Outlook" → "Outlook"; unknown names are tidied, not invented. */
export function friendlyAppName(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!clean || clean === '?') return null;
  const base = clean.replace(/\.exe$/i, '');
  const key = base.toLowerCase();
  const short = FRIENDLY[key] ?? FRIENDLY[key.replace(/^microsoft /, '')];
  if (short) return short;
  const name = base.replace(/^Microsoft /, '');
  return name.length > MAX_LENGTH ? `${name.slice(0, MAX_LENGTH - 1)}…` : name;
}

/** The helper's `APP <name>` line → a friendly name, or null. */
export function parseAppLine(line: string | undefined): string | null {
  const match = /^APP (.+)$/.exec((line ?? '').replace(/\r$/, ''));
  return match ? friendlyAppName(match[1]!) : null;
}

/**
 * Asks the paste helper which app is in front (`aiw-paste --front-app`, VAI-305). Resolves null
 * on any problem; never throws, never takes longer than `timeoutMs`.
 */
export function runFrontApp(spawn: () => ChildProcess, timeoutMs = 1_000): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn();
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    let done = false;
    const finish = (name: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(name);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      out = (out + chunk).slice(0, 500);
    });
    child.on('error', () => finish(null));
    child.on('close', () => finish(parseAppLine(out.split('\n')[0])));
    child.stdin?.end();
  });
}
