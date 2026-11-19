import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppInfo } from '../../shared/ipc-contract';
import type { Settings } from '../../shared/settings';
import { tempDir } from '../db/test-helpers';
import { Redactor } from '../logging/redact';
import { buildDiagnosticsZip, diagnosticsFileName } from './export';
import { readZip } from './zip';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const settings: Settings = {
  ai: {
    asr: { baseUrl: 'https://asr.company.internal/v1', model: 'qwen3-asr' },
    llm: { baseUrl: 'https://llm.company.internal/v1', model: 'qwen3-32b' },
    timeoutMs: 30000,
    retries: 2,
  },
};
const appInfo: AppInfo = {
  name: 'AI Workflow',
  version: '0.1.0',
  platform: 'darwin',
  electron: '45.3.3',
  chrome: '140',
  database: { status: 'ok', schemaVersion: 1, encrypted: true },
};

function setup() {
  const dir = tempDir('aiw-diag-');
  dirs.push(dir);
  const logs = path.join(dir, 'logs');
  fs.mkdirSync(logs);
  // A profile folder with things that must never be exported.
  fs.writeFileSync(path.join(dir, 'secrets.json'), '{"secrets":{"ai.llm.apiKey":"ENCRYPTED"}}');
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'app.db'), 'database bytes');
  fs.writeFileSync(path.join(logs, 'main.log'), 'INFO [ai] used key company-key-123456\n');
  fs.writeFileSync(path.join(logs, 'main.1.log'), 'INFO [db] key ' + 'ab'.repeat(32) + '\n');
  const redactor = new Redactor();
  redactor.addSecret('company-key-123456');
  return {
    logFiles: [
      path.join(logs, 'main.log'),
      path.join(logs, 'main.1.log'),
      path.join(logs, 'gone.log'),
    ],
    redactor,
  };
}

describe('diagnostics export', () => {
  it('contains README, app info, settings and logs — nothing else', () => {
    const { logFiles, redactor } = setup();
    const zip = readZip(
      buildDiagnosticsZip({
        logFiles,
        settings,
        appInfo,
        secretsSet: { 'ai.asr.apiKey': false, 'ai.llm.apiKey': true },
        redactor,
        now: new Date('2026-11-19T10:00:00Z'),
      }),
    );
    expect([...zip.keys()]).toEqual([
      'README.txt',
      'app-info.json',
      'settings.json',
      'logs/main.log',
      'logs/main.1.log',
    ]);
    const info = JSON.parse(zip.get('app-info.json')!.toString());
    expect(info.version).toBe('0.1.0');
    expect(info.keysSet).toEqual({ 'ai.asr.apiKey': false, 'ai.llm.apiKey': true });
    expect(JSON.parse(zip.get('settings.json')!.toString())).toEqual(settings);
  });

  it('scrubs logs again: registered keys and key-shaped strings never leave', () => {
    const { logFiles, redactor } = setup();
    const raw = buildDiagnosticsZip({
      logFiles,
      settings,
      appInfo,
      secretsSet: { 'ai.asr.apiKey': false, 'ai.llm.apiKey': true },
      redactor,
      now: new Date(),
    });
    const all = [...readZip(raw).values()].map((b) => b.toString()).join('\n');
    expect(all).not.toContain('company-key-123456');
    expect(all).not.toContain('ab'.repeat(32));
    expect(all).not.toContain('ENCRYPTED');
    expect(all).not.toContain('database bytes');
  });

  it('file name has a timestamp and no characters Windows rejects', () => {
    const name = diagnosticsFileName(new Date('2026-11-19T16:28:45.522Z'));
    expect(name).toBe('AI-Workflow-diagnostics-2026-11-19-16-28-45.zip');
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });
});
