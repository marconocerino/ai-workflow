import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppInfo } from '../../shared/ipc-contract';
import type { SecretName, Settings } from '../../shared/settings';
import type { Redactor } from '../logging/redact';
import { createZip, type ZipEntry } from './zip';

/** Everything the export needs, gathered by main.ts. No secret values, ever. */
export interface DiagnosticsSource {
  /** Log files, newest first. */
  logFiles: string[];
  settings: Settings;
  appInfo: AppInfo;
  /** Which secrets are stored — yes/no only. */
  secretsSet: Record<SecretName, boolean>;
  redactor: Redactor;
  now: Date;
}

export const README = `AI Workflow diagnostics

Made with Settings > Diagnostics > Export diagnostics. Send it to support.

Included
- logs/       the app's log files (newest is main.log)
- settings.json  settings without secrets (server addresses, model names, timeouts)
- app-info.json  app version, operating system, database status, which keys are set (yes/no)

Never included
- API keys or the database key (the logs are scrubbed of them as well)
- dictations, meeting transcripts, audio, notes or agent data
- the database file and the encrypted secrets file
`;

export function diagnosticsFileName(now: Date): string {
  return `AI-Workflow-diagnostics-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`;
}

/** The files that go into the zip. Every text is scrubbed once more on the way in. */
export function diagnosticsEntries(source: DiagnosticsSource): ZipEntry[] {
  const { redactor: r, now } = source;
  const text = (name: string, content: string): ZipEntry => ({
    name,
    data: Buffer.from(r.text(content), 'utf8'),
    modified: now,
  });
  const entries: ZipEntry[] = [
    text('README.txt', README),
    text('app-info.json', json({ ...source.appInfo, keysSet: source.secretsSet })),
    text('settings.json', json(source.settings)),
  ];
  for (const file of source.logFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    entries.push(text(`logs/${path.basename(file)}`, content));
  }
  return entries;
}

export function buildDiagnosticsZip(source: DiagnosticsSource): Buffer {
  return createZip(diagnosticsEntries(source));
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
