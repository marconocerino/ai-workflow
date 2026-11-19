import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { Logger } from '../logging/logger';
import { registerDiagnosticsIpc, type DiagnosticsDeps } from './diagnostics';
import { createIpcRegistrar, UntrustedSenderError } from './handle';

function setup(overrides: Partial<DiagnosticsDeps> = {}, trusted = true) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const handle = createIpcRegistrar({ handle: (c, l) => handlers.set(c, l) }, () => trusted);
  const lines: string[] = [];
  let clock = 0;
  const logger = new Logger({ sink: (l) => lines.push(l) });
  const deps: DiagnosticsDeps = {
    logger: logger.scope('diagnostics'),
    rendererLogger: logger.scope('renderer'),
    defaultName: () => 'AI-Workflow-diagnostics-x.zip',
    chooseFile: vi.fn().mockResolvedValue('/Users/someone/Downloads/AI-Workflow-diagnostics-x.zip'),
    writeZip: vi.fn(),
    reveal: vi.fn(),
    openLogsFolder: vi.fn().mockResolvedValue(undefined),
    now: () => clock,
    rendererErrorsPerMinute: 3,
    ...overrides,
  };
  registerDiagnosticsIpc(handle, deps);
  const call = (channel: string, ...args: unknown[]) =>
    new Promise((resolve) =>
      resolve(
        handlers.get(channel)!({ senderFrame: null } as unknown as IpcMainInvokeEvent, ...args),
      ),
    );
  return { deps, lines, call, tick: (ms: number) => (clock += ms) };
}

describe('diagnostics IPC', () => {
  it('export: asks for a file, writes the zip, reveals it, returns only the file name', async () => {
    const { deps, call, lines } = setup();
    await expect(call('diagnostics:export')).resolves.toEqual({
      saved: true,
      fileName: 'AI-Workflow-diagnostics-x.zip',
    });
    expect(deps.chooseFile).toHaveBeenCalledWith('AI-Workflow-diagnostics-x.zip');
    expect(deps.writeZip).toHaveBeenCalledWith(
      '/Users/someone/Downloads/AI-Workflow-diagnostics-x.zip',
    );
    expect(deps.reveal).toHaveBeenCalled();
    expect(lines.some((l) => l.includes('Diagnostics exported'))).toBe(true);
  });

  it('export: cancelled dialog writes nothing', async () => {
    const { deps, call } = setup({ chooseFile: vi.fn().mockResolvedValue(null) });
    await expect(call('diagnostics:export')).resolves.toEqual({ saved: false });
    expect(deps.writeZip).not.toHaveBeenCalled();
  });

  it('export: write failure is logged and reported in plain words', async () => {
    const { call, lines } = setup({
      writeZip: () => {
        throw new Error('EACCES: permission denied');
      },
    });
    await expect(call('diagnostics:export')).rejects.toThrow(/could not be saved/);
    expect(lines.some((l) => l.includes('Diagnostics export failed'))).toBe(true);
  });

  it('renderer errors: logged with scrubbed message and stack frames only', async () => {
    const { call, lines } = setup();
    await call('log:renderer-error', {
      name: 'TypeError',
      message: 'x is undefined (Bearer abc123)',
      stack: 'TypeError: x is undefined (Bearer abc123)\n    at foo (app://renderer/main.js:1:2)',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('ERROR [renderer] Unexpected error in the window');
    expect(lines[0]).toContain('TypeError: x is undefined (Bearer [redacted])');
    expect(lines[0]).not.toContain('abc123');
    expect(lines[0]).toContain('    at foo (app://renderer/main.js:1:2)');
  });

  it('renderer errors: bad payloads ignored, names sanitised, rate limited', async () => {
    const { call, lines, tick } = setup();
    await call('log:renderer-error', 'just a string');
    await call('log:renderer-error', { message: 42 });
    expect(lines).toHaveLength(0);
    await call('log:renderer-error', { name: 'Bad Name\nINJECTED', message: 'm' });
    expect(lines[0]).toContain('error="Error: m"');
    for (let i = 0; i < 10; i++)
      await call('log:renderer-error', { name: 'Error', message: `m${i}` });
    expect(lines).toHaveLength(3); // limit is 3 per minute
    tick(60_000);
    await call('log:renderer-error', { name: 'Error', message: 'later' });
    expect(lines.some((l) => l.includes('Renderer errors were dropped dropped=8'))).toBe(true);
    expect(lines.at(-1)).toContain('later');
  });

  it('untrusted senders are rejected', async () => {
    const { call, deps } = setup({}, false);
    await expect(call('diagnostics:export')).rejects.toThrow(UntrustedSenderError);
    await expect(call('diagnostics:open-logs')).rejects.toThrow(UntrustedSenderError);
    expect(deps.writeZip).not.toHaveBeenCalled();
  });

  it('open logs folder', async () => {
    const { call, deps } = setup();
    await call('diagnostics:open-logs');
    expect(deps.openLogsFolder).toHaveBeenCalled();
  });
});
