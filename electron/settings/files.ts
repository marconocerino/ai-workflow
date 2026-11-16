import * as fs from 'node:fs';
import * as path from 'node:path';

/** Read a UTF-8 file, or null if it doesn't exist. Other errors are thrown. */
export function readFileOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Write via a temp file + rename so a crash mid-write never leaves a half-written file.
 * `mode` 0o600: readable by the current user only (ignored on Windows, where the profile folder
 * is already per-user).
 */
export function writeFileAtomic(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Move a broken file aside (e.g. settings.corrupt-2026-11-16T12-00-00-000Z.json) and return its name. */
export function moveAside(file: string, label: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const ext = path.extname(file);
  const target = path.join(
    path.dirname(file),
    `${path.basename(file, ext)}.${label}-${stamp}${ext}`,
  );
  fs.renameSync(file, target);
  return target;
}
