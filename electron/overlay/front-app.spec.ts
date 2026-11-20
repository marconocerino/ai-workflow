import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { friendlyAppName, parseAppLine, runFrontApp } from './front-app';

describe('friendlyAppName', () => {
  it.each([
    ['OUTLOOK.EXE', 'Outlook'],
    ['olk.exe', 'Outlook'],
    ['ms-teams.exe', 'Teams'],
    ['WINWORD.EXE', 'Word'],
    ['msedge.exe', 'Edge'],
    ['Code.exe', 'VS Code'],
    ['Code', 'VS Code'], // macOS
    ['Microsoft Outlook', 'Outlook'],
    ['Microsoft Teams', 'Teams'],
    ['Google Chrome', 'Chrome'],
    ['AI Workflow.exe', 'AI Workflow'],
    ['Figma.exe', 'Figma'],
    ['Microsoft Whiteboard', 'Whiteboard'],
    ['?', null],
    ['', null],
    ['  ', null],
  ])('%j → %j', (raw, name) => expect(friendlyAppName(raw)).toBe(name));

  it('strips control characters and caps the length', () => {
    expect(friendlyAppName('Evil\u0007App')).toBe('EvilApp');
    expect(friendlyAppName('x'.repeat(100))!.length).toBe(40);
  });
});

describe('parseAppLine', () => {
  it('reads "APP <name>"', () => {
    expect(parseAppLine('APP OUTLOOK.EXE\r')).toBe('Outlook');
    expect(parseAppLine('APP ?')).toBeNull();
    expect(parseAppLine('PASTED restored')).toBeNull();
    expect(parseAppLine(undefined)).toBeNull();
  });
});

const node = (script: string) => () =>
  spawn(process.execPath, ['-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });

describe('runFrontApp', () => {
  it('runs the helper and returns the friendly name', async () => {
    expect(await runFrontApp(node('console.log("APP WINWORD.EXE")'))).toBe('Word');
  });

  it('null on a crash, a hang or a failed start — never throws', async () => {
    expect(await runFrontApp(node('process.exit(2)'))).toBeNull();
    expect(await runFrontApp(node('setInterval(()=>{},1000)'), 200)).toBeNull();
    expect(
      await runFrontApp(() => {
        throw new Error('ENOENT');
      }),
    ).toBeNull();
  });
});
