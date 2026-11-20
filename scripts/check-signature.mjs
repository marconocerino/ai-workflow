// Checks that Windows .exe files carry an Authenticode signature (VAI-108, D-015).
// Reads the PE header directly (no dependency, runs on macOS too). It confirms a signature is
// embedded and, with --publisher, that the signing certificate names that publisher. Full trust
// checks (chain, timestamp) need Windows: Get-AuthenticodeSignature (see README).
//
// Usage: node scripts/check-signature.mjs [--publisher "Name"] [file.exe …]
//        (no files: the installer and app exe in release/)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WIN_CERT_TYPE_PKCS_SIGNED_DATA = 0x0002;

/** @returns {{ signed: boolean, reason?: string, certificate?: Buffer }} */
export function readSignature(buf) {
  if (buf.length < 0x40 || buf.toString('latin1', 0, 2) !== 'MZ') {
    return { signed: false, reason: 'not a Windows executable' };
  }
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') {
    return { signed: false, reason: 'not a Windows executable' };
  }
  const optional = pe + 24;
  const magic = buf.readUInt16LE(optional);
  const directories = magic === 0x20b ? optional + 112 : magic === 0x10b ? optional + 96 : -1;
  if (directories < 0) return { signed: false, reason: 'unknown executable format' };
  const security = directories + 4 * 8; // IMAGE_DIRECTORY_ENTRY_SECURITY
  if (security + 8 > buf.length) return { signed: false, reason: 'truncated header' };
  const offset = buf.readUInt32LE(security);
  const size = buf.readUInt32LE(security + 4);
  if (offset === 0 || size === 0) return { signed: false, reason: 'no signature' };
  if (offset + 8 > buf.length || offset + size > buf.length) {
    return { signed: false, reason: 'signature points outside the file' };
  }
  const length = buf.readUInt32LE(offset);
  const type = buf.readUInt16LE(offset + 6);
  if (type !== WIN_CERT_TYPE_PKCS_SIGNED_DATA || length < 8) {
    return { signed: false, reason: 'not an Authenticode signature' };
  }
  return { signed: true, certificate: buf.subarray(offset + 8, offset + length) };
}

export function defaultFiles(rootDir = root) {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return [
    path.join(rootDir, 'release', `AI-Workflow-Setup-${pkg.version}.exe`),
    path.join(rootDir, 'release', 'win-unpacked', `${pkg.productName}.exe`),
    ...['aiw-key-listener.exe', 'aiw-paste.exe'].map((helper) =>
      path.join(
        rootDir,
        ...['release', 'win-unpacked', 'resources', 'app.asar.unpacked', 'resources', 'win'],
        helper,
      ),
    ),
  ];
}

/** @returns {string[]} problems (empty = all signed) */
export function checkFiles(files, publisher) {
  const problems = [];
  for (const file of files) {
    const name = path.relative(root, file) || file;
    if (!existsSync(file)) {
      problems.push(`${name}: missing (build it first)`);
      continue;
    }
    const result = readSignature(readFileSync(file));
    if (!result.signed) {
      problems.push(`${name}: not signed (${result.reason})`);
    } else if (publisher && !result.certificate.includes(Buffer.from(publisher, 'utf8'))) {
      problems.push(`${name}: signed, but not by "${publisher}"`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--publisher');
  const publisher = at >= 0 ? args.splice(at, 2)[1] : (process.env.AIW_SIGN_PUBLISHER ?? '');
  const files = args.length ? args.map((f) => path.resolve(f)) : defaultFiles();
  const problems = checkFiles(files, publisher);
  for (const f of files) {
    if (!problems.some((p) => p.startsWith(path.relative(root, f)))) {
      console.log(`signed: ${path.relative(root, f)}${publisher ? ` (${publisher})` : ''}`);
    }
  }
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
}
