import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RotatingFileOptions {
  /** Rotate when the current file would grow past this (bytes). */
  maxBytes?: number;
  /** Total files kept, including the current one: main.log, main.1.log … main.(keep-1).log. */
  keep?: number;
}

export const DEFAULT_MAX_BYTES = 1024 * 1024;
export const DEFAULT_KEEP = 5;

/**
 * Append-only log file with size-based rotation. Writes are synchronous, so the last lines
 * before a crash are on disk. Never throws: logging must not break the app.
 */
export class RotatingFile {
  readonly file: string;
  private readonly maxBytes: number;
  private readonly keep: number;
  private size: number | null = null;

  constructor(
    readonly dir: string,
    readonly base = 'main',
    options: RotatingFileOptions = {},
  ) {
    this.file = path.join(dir, `${base}.log`);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.keep = Math.max(1, options.keep ?? DEFAULT_KEEP);
  }

  write(line: string): void {
    try {
      const data = line.endsWith('\n') ? line : `${line}\n`;
      const bytes = Buffer.byteLength(data);
      if (this.size === null) {
        fs.mkdirSync(this.dir, { recursive: true });
        this.size = fs.existsSync(this.file) ? fs.statSync(this.file).size : 0;
      }
      if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate();
      fs.appendFileSync(this.file, data, { mode: 0o600 });
      this.size += bytes;
    } catch {
      // Disk full, permissions… — drop the line rather than crash.
    }
  }

  /** Log files, newest first (main.log, main.1.log, …). */
  files(): string[] {
    return [this.file, ...range(1, this.keep).map((n) => this.numbered(n))].filter((f) =>
      fs.existsSync(f),
    );
  }

  private rotate(): void {
    fs.rmSync(this.numbered(this.keep - 1), { force: true });
    for (let n = this.keep - 2; n >= 1; n--) {
      if (fs.existsSync(this.numbered(n))) fs.renameSync(this.numbered(n), this.numbered(n + 1));
    }
    if (this.keep > 1) fs.renameSync(this.file, this.numbered(1));
    else fs.rmSync(this.file, { force: true });
    this.size = 0;
  }

  private numbered(n: number): string {
    return path.join(this.dir, `${this.base}.${n}.log`);
  }
}

function range(from: number, toExclusive: number): number[] {
  return Array.from({ length: Math.max(0, toExclusive - from) }, (_, i) => from + i);
}
