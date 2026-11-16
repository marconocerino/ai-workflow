import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, buildCsp, isTrustedUrl, originOf, resolveRendererPath } from './security';

describe('originOf', () => {
  it('handles the custom app:// scheme (URL.origin would be "null")', () => {
    expect(originOf('app://renderer/index.html')).toBe('app://renderer');
  });
  it('keeps the port', () => {
    expect(originOf('http://localhost:4200/x')).toBe('http://localhost:4200');
  });
  it('returns null for junk and host-less URLs', () => {
    expect(originOf('not a url')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf(undefined)).toBeNull();
    expect(originOf('file:///etc/passwd')).toBeNull();
  });
});

describe('isTrustedUrl', () => {
  const trusted = [APP_ORIGIN];
  it('accepts our renderer', () => {
    expect(isTrustedUrl('app://renderer/', trusted)).toBe(true);
    expect(isTrustedUrl('app://renderer/meetings/1', trusted)).toBe(true);
  });
  it('rejects other origins, look-alikes and files', () => {
    expect(isTrustedUrl('https://example.com', trusted)).toBe(false);
    expect(isTrustedUrl('app://renderer.evil.com/', trusted)).toBe(false);
    expect(isTrustedUrl('app://other/', trusted)).toBe(false);
    expect(isTrustedUrl('file:///index.html', trusted)).toBe(false);
    expect(isTrustedUrl(undefined, trusted)).toBe(false);
  });
});

describe('buildCsp', () => {
  it('blocks inline and remote scripts in production', () => {
    const csp = buildCsp();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("object-src 'none'");
  });
  it('allows only the dev server (http + ws) in dev', () => {
    const csp = buildCsp('http://localhost:4200');
    expect(csp).toContain("connect-src 'self' http://localhost:4200 ws://localhost:4200");
    expect(csp).toContain("script-src 'self'");
  });
});

describe('resolveRendererPath', () => {
  const root = path.resolve('/srv/renderer');
  it('serves index.html for the root and for Angular routes', () => {
    expect(resolveRendererPath('app://renderer/', root)).toBe(path.join(root, 'index.html'));
    expect(resolveRendererPath('app://renderer/meetings/42', root)).toBe(
      path.join(root, 'index.html'),
    );
  });
  it('serves real files', () => {
    expect(resolveRendererPath('app://renderer/main-ABC.js', root)).toBe(
      path.join(root, 'main-ABC.js'),
    );
  });
  it('never escapes the renderer folder', () => {
    for (const url of [
      'app://renderer/../../etc/passwd.txt',
      'app://renderer/%2e%2e/%2e%2e/secret.txt',
      'app://renderer/..%2F..%2Fsecret.txt',
      'app://renderer/..%5C..%5Csecret.txt',
    ]) {
      const resolved = resolveRendererPath(url, root);
      if (resolved !== null) expect(resolved.startsWith(root + path.sep)).toBe(true);
    }
  });
  it('rejects other hosts', () => {
    expect(resolveRendererPath('app://other/index.html', root)).toBeNull();
    expect(resolveRendererPath('https://renderer/index.html', root)).toBeNull();
  });
});
