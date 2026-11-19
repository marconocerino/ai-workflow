import { describe, expect, it } from 'vitest';
import { checkFiles, readSignature } from './check-signature.mjs';

/** Minimal PE32+ file: DOS header → PE header → optional header with a security directory. */
function fakeExe({ certificate } = {}) {
  const pe = 0x40;
  const optional = pe + 24;
  const security = optional + 112 + 4 * 8;
  const headerEnd = security + 8;
  const blob = certificate ? Buffer.from(certificate) : Buffer.alloc(0);
  const certAt = 0x200;
  const buf = Buffer.alloc(certificate ? certAt + 8 + blob.length : headerEnd);
  buf.write('MZ', 0, 'latin1');
  buf.writeUInt32LE(pe, 0x3c);
  buf.write('PE\0\0', pe, 'latin1');
  buf.writeUInt16LE(0x20b, optional);
  if (certificate) {
    buf.writeUInt32LE(certAt, security);
    buf.writeUInt32LE(8 + blob.length, security + 4);
    buf.writeUInt32LE(8 + blob.length, certAt); // dwLength
    buf.writeUInt16LE(0x0200, certAt + 4); // wRevision
    buf.writeUInt16LE(0x0002, certAt + 6); // WIN_CERT_TYPE_PKCS_SIGNED_DATA
    blob.copy(buf, certAt + 8);
  }
  return buf;
}

describe('check-signature', () => {
  it('finds an Authenticode signature and its certificate', () => {
    const result = readSignature(fakeExe({ certificate: 'CN=AI Workflow Test Signing' }));
    expect(result.signed).toBe(true);
    expect(result.certificate.toString()).toContain('AI Workflow Test Signing');
  });

  it('reports unsigned and non-executable files', () => {
    expect(readSignature(fakeExe())).toEqual({ signed: false, reason: 'no signature' });
    expect(
      readSignature(Buffer.from('hello world, definitely not an exe file at all.......')),
    ).toMatchObject({ signed: false, reason: 'not a Windows executable' });
    const broken = fakeExe({ certificate: 'x' });
    broken.writeUInt32LE(0xffffff, 0x40 + 24 + 112 + 32); // points past the end
    expect(readSignature(broken)).toMatchObject({ signed: false });
  });

  it('checkFiles: a missing file is a problem', () => {
    expect(checkFiles(['/nonexistent/app.exe'])).toEqual([expect.stringContaining('missing')]);
  });
});
