import { Redactor, type LogFields } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** A logger for one area of the app, e.g. `logger.scope('db')`. */
export interface ScopedLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  /** Where finished lines go (the rotating file). */
  sink?: (line: string) => void;
  /** Also print to the terminal (dev). */
  echo?: (level: LogLevel, line: string) => void;
  level?: LogLevel;
  now?: () => Date;
  redactor?: Redactor;
}

/**
 * The app's logger (main process). One readable line per entry:
 *   2026-11-19T16:28:45.522Z WARN  [db] Migration failed version=2 error="Error: boom"
 * Rules: never pass transcripts, audio or keys — put facts in `fields` (numbers, ids, names);
 * everything is scrubbed again on the way out (see redact.ts).
 */
export class Logger {
  readonly redactor: Redactor;
  private readonly sink: (line: string) => void;
  private readonly echo?: (level: LogLevel, line: string) => void;
  private readonly min: number;
  private readonly now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.sink = options.sink ?? (() => undefined);
    this.echo = options.echo;
    this.min = LOG_LEVELS.indexOf(options.level ?? 'info');
    this.now = options.now ?? (() => new Date());
    this.redactor = options.redactor ?? new Redactor();
  }

  scope(name: string): ScopedLogger {
    return {
      debug: (m, f) => this.write('debug', name, m, f),
      info: (m, f) => this.write('info', name, m, f),
      warn: (m, f) => this.write('warn', name, m, f),
      error: (m, f) => this.write('error', name, m, f),
    };
  }

  /** Values to scrub from every line (API keys, the database key). */
  addSecret(value: string | null | undefined): void {
    this.redactor.addSecret(value);
  }

  write(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
    if (LOG_LEVELS.indexOf(level) < this.min) return;
    try {
      const r = this.redactor;
      const extra = r.fields(fields);
      let line =
        `${this.now().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ` +
        r.message(message) +
        (extra ? ` ${extra}` : '');
      const error = fields ? Object.values(fields).find((v) => v instanceof Error) : undefined;
      const stack = error instanceof Error ? r.stack(error) : null;
      if (stack) line += `\n${stack.replace(/^/gm, '    ')}`;
      this.sink(line);
      this.echo?.(level, line);
    } catch {
      // Logging must never break the app.
    }
  }
}

export function parseLogLevel(value: string | undefined): LogLevel | null {
  const v = value?.toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(v ?? '') ? (v as LogLevel) : null;
}

/** Dev: mirror log lines to the terminal. */
export function terminalEcho(level: LogLevel, line: string): void {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console -- the logger is the one place allowed to print
  else console.log(line);
}

/** Default for stores used without a logger (tests, scripts): prints to the terminal. */
export const consoleLogger: ScopedLogger = new Logger({
  level: 'debug',
  echo: terminalEcho,
}).scope('app');
