import { describe, expect, it } from 'vitest';
import { Logger, parseLogLevel } from './logger';

function make(level?: 'debug' | 'info' | 'warn' | 'error') {
  const lines: string[] = [];
  const logger = new Logger({
    sink: (l) => lines.push(l),
    now: () => new Date('2026-11-19T16:28:45.522Z'),
    ...(level ? { level } : {}),
  });
  return { logger, lines };
}

describe('Logger', () => {
  it('writes one readable line: timestamp, level, scope, message, fields', () => {
    const { logger, lines } = make();
    logger.scope('db').warn('Migration failed', { version: 2, name: 'add-notes' });
    expect(lines).toEqual([
      '2026-11-19T16:28:45.522Z WARN  [db] Migration failed version=2 name=add-notes',
    ]);
  });

  it('filters by level (default info)', () => {
    const { logger, lines } = make();
    const log = logger.scope('x');
    log.debug('hidden');
    log.info('shown');
    log.error('shown too');
    expect(lines.map((l) => l.split(' ')[1])).toEqual(['INFO', 'ERROR']);
    const strict = make('error');
    strict.logger.scope('x').warn('hidden');
    expect(strict.lines).toEqual([]);
  });

  it('errors get an indented, scrubbed stack', () => {
    const { logger, lines } = make();
    logger.scope('ai').error('Request failed', { error: new Error('token sk-abcdefghijklmnop') });
    const [first, ...rest] = lines[0].split('\n');
    expect(first).toContain('error="Error: token [redacted]"');
    expect(rest.length).toBeGreaterThan(0);
    for (const l of rest) expect(l.startsWith('    at ')).toBe(true);
  });

  it('scrubs registered secrets from messages and fields', () => {
    const { logger, lines } = make();
    logger.addSecret('company-api-key-123');
    logger
      .scope('ai')
      .info('Using company-api-key-123', { url: 'https://x/?q=company-api-key-123' });
    expect(lines[0]).not.toContain('company-api-key-123');
    expect(lines[0]).toContain('[secret]');
  });

  it('never throws, even if the sink does', () => {
    const logger = new Logger({
      sink: () => {
        throw new Error('disk full');
      },
    });
    expect(() => logger.scope('x').error('boom')).not.toThrow();
  });

  it('parses levels', () => {
    expect(parseLogLevel('DEBUG')).toBe('debug');
    expect(parseLogLevel('verbose')).toBeNull();
    expect(parseLogLevel(undefined)).toBeNull();
  });
});
