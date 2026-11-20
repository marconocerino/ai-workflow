// Test double for aiw-paste.exe (VAI-304). Started by the app when AIW_PASTE_HELPER_SCRIPT points
// here (dev builds only). Reads the text from stdin like the real helper, appends it (fake test
// text only) to AIW_FAKE_PASTE_LOG, and answers according to AIW_FAKE_PASTE_MODE:
//   pasted (default) → PASTED restored · elevated → FAILED elevated · crash → exits, no line
import { appendFileSync } from 'node:fs';

let text = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (text += chunk));
process.stdin.on('end', () => {
  const log = process.env.AIW_FAKE_PASTE_LOG;
  if (log) appendFileSync(log, `${JSON.stringify({ text, args: process.argv.length - 2 })}\n`);
  const mode = process.env.AIW_FAKE_PASTE_MODE ?? 'pasted';
  if (mode === 'crash') process.exit(3);
  process.stdout.write(mode === 'elevated' ? 'FAILED elevated\n' : 'PASTED restored\n');
});
