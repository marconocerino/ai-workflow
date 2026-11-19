import type { RendererErrorReport } from '../../shared/ipc-contract';
import type { ScopedLogger } from '../logging/logger';
import type { createIpcRegistrar } from './handle';

type Handle = ReturnType<typeof createIpcRegistrar>;

export interface DiagnosticsDeps {
  logger: ScopedLogger;
  /** Where renderer error reports go (scope "renderer"). */
  rendererLogger: ScopedLogger;
  /** Ask the user where to save (save dialog), or null if cancelled. */
  chooseFile(defaultName: string): Promise<string | null>;
  /** Default file name for a new export. */
  defaultName(): string;
  /** Build the zip and write it to `file`. */
  writeZip(file: string): void;
  /** Show the saved file in Finder/Explorer. */
  reveal(file: string): void;
  openLogsFolder(): Promise<void>;
  /** Renderer error reports allowed per minute (protects the log from floods). */
  rendererErrorsPerMinute?: number;
  now?: () => number;
}

const MAX_TEXT = 1_000;

export function registerDiagnosticsIpc(handle: Handle, deps: DiagnosticsDeps): void {
  const limit = deps.rendererErrorsPerMinute ?? 30;
  const now = deps.now ?? Date.now;
  let windowStart = 0;
  let count = 0;
  let dropped = 0;

  handle('log:renderer-error', (_event, report) => {
    const r = toReport(report);
    if (!r) return;
    const t = now();
    if (t - windowStart >= 60_000) {
      if (dropped > 0) deps.rendererLogger.warn('Renderer errors were dropped', { dropped });
      windowStart = t;
      count = 0;
      dropped = 0;
    }
    if (++count > limit) {
      dropped++;
      return;
    }
    const error = new Error(r.message);
    error.name = r.name;
    // Keep only the call-site lines ("at …"); the message is logged once, capped.
    const frames = (r.stack ?? '').split('\n').filter((l) => /^\s*at\s/.test(l));
    error.stack = [`${r.name}: ${r.message}`, ...frames].join('\n');
    deps.rendererLogger.error('Unexpected error in the window', { error });
  });

  handle('diagnostics:export', async () => {
    const file = await deps.chooseFile(deps.defaultName());
    if (!file) return { saved: false };
    try {
      deps.writeZip(file);
    } catch (e) {
      deps.logger.error('Diagnostics export failed', { error: asError(e) });
      throw new Error('The diagnostics file could not be saved. Try another folder.');
    }
    deps.logger.info('Diagnostics exported');
    deps.reveal(file);
    return { saved: true, fileName: file.split(/[\\/]/).pop() ?? file };
  });

  handle('diagnostics:open-logs', () => deps.openLogsFolder());
}

/** Accept only the expected shape; cap every string. */
function toReport(value: unknown): RendererErrorReport | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v['message'] !== 'string') return null;
  const name =
    typeof v['name'] === 'string' && /^[A-Za-z]\w{0,60}$/.test(v['name']) ? v['name'] : 'Error';
  return {
    name,
    message: v['message'].slice(0, MAX_TEXT),
    ...(typeof v['stack'] === 'string' ? { stack: v['stack'].slice(0, MAX_TEXT * 2) } : {}),
  };
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
