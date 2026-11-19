// Dev only: creates a self-signed code-signing certificate (.pfx) to test Windows signing
// without the company certificate (VAI-108). Never use it for real releases.
// Usage: node scripts/make-test-cert.mjs <out-dir>
// Then:  CSC_LINK=<out-dir>/test-signing.pfx CSC_KEY_PASSWORD=<printed> npm run release:win
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const TEST_PUBLISHER = 'AI Workflow Test Signing';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/make-test-cert.mjs <out-dir>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const key = path.join(out, 'test-signing.key');
const crt = path.join(out, 'test-signing.crt');
const pfx = path.join(out, 'test-signing.pfx');
const password = randomBytes(12).toString('hex');
// Output piped (openssl prints key-generation progress); errors still throw with stderr.
const run = (args) => execFileSync('openssl', args, { stdio: 'pipe' });

run([
  'req',
  '-x509',
  '-newkey',
  'rsa:3072',
  '-nodes',
  '-days',
  '30',
  '-sha256',
  '-keyout',
  key,
  '-out',
  crt,
  '-subj',
  `/CN=${TEST_PUBLISHER}/O=${TEST_PUBLISHER}`,
  '-addext',
  'keyUsage=critical,digitalSignature',
  '-addext',
  'extendedKeyUsage=codeSigning',
]);
run(['pkcs12', '-export', '-inkey', key, '-in', crt, '-out', pfx, '-passout', `pass:${password}`]);
console.log(`CSC_LINK=${pfx}`);
console.log(`CSC_KEY_PASSWORD=${password}`);
