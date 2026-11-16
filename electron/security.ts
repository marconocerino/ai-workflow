/**
 * Pure security helpers (no Electron imports) so they can be unit-tested.
 * The wiring into Electron lives in main.ts.
 */
import * as path from 'node:path';

/** Scheme + host of our production renderer, served by the custom protocol. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'renderer';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * `scheme://host[:port]` of a URL, or null if it can't be parsed.
 * We don't use `URL.origin` because it is the string "null" for custom schemes like app://.
 */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.host) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** True only if `url` belongs to one of the trusted origins (exact match). */
export function isTrustedUrl(
  url: string | undefined | null,
  trustedOrigins: readonly string[],
): boolean {
  const origin = originOf(url);
  return origin !== null && trustedOrigins.includes(origin);
}

/**
 * Content-Security-Policy for the renderer.
 * - No inline or remote scripts.
 * - `style-src 'unsafe-inline'` is needed for Angular component styles.
 * - `connect-src` only allows our own origin for now; company AI hosts are added in VAI-104.
 * - In dev the Angular dev server (and its live-reload websocket) is allowed too.
 */
export function buildCsp(devServerUrl?: string): string {
  const dev = originOf(devServerUrl);
  const devWs = dev ? dev.replace(/^http/, 'ws') : null;
  const connect = ["'self'", dev, devWs].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

/** Map an app://renderer/... request path to a file inside the renderer folder, or null if unsafe. */
export function resolveRendererPath(requestUrl: string, rendererRoot: string): string | null {
  let pathname: string;
  try {
    const u = new URL(requestUrl);
    if (`${u.protocol}//${u.host}` !== APP_ORIGIN) return null;
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  // Paths without a file extension are Angular routes → serve index.html.
  const lastSegment = pathname.split('/').pop() ?? '';
  const relative = pathname === '/' || !lastSegment.includes('.') ? 'index.html' : pathname;
  const root = path.resolve(rendererRoot);
  const full = path.resolve(root, '.' + path.posix.normalize('/' + relative));
  // Block path traversal outside the renderer folder.
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}
