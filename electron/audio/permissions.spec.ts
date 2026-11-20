import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_COMMAND_CHANNEL, OVERLAY_STATE_CHANNEL } from '../../shared/ipc-contract';
import { allowPermissionCheck, allowPermissionRequest } from './permissions';

const req = {
  permission: 'media',
  fromAudioWindow: true,
  trustedOrigin: true,
  mediaTypes: ['audio'],
};

describe('permission requests', () => {
  it('allows only audio, only for the audio window, only from our origin', () => {
    expect(allowPermissionRequest(req)).toBe(true);
    expect(allowPermissionRequest({ ...req, mediaTypes: ['audio', 'video'] })).toBe(false);
    expect(allowPermissionRequest({ ...req, mediaTypes: ['video'] })).toBe(false);
    expect(allowPermissionRequest({ ...req, mediaTypes: [] })).toBe(false);
    expect(allowPermissionRequest({ ...req, fromAudioWindow: false })).toBe(false);
    expect(allowPermissionRequest({ ...req, trustedOrigin: false })).toBe(false);
  });

  it.each([
    'notifications',
    'geolocation',
    'clipboard-read',
    'display-capture',
    'midi',
    'openExternal',
  ])('denies %s', (permission) => {
    expect(allowPermissionRequest({ ...req, permission })).toBe(false);
  });

  it('checks: our windows may see whether the mic is allowed (device names), nothing else', () => {
    const check = {
      permission: 'media',
      fromOurWindow: true,
      trustedOrigin: true,
      mediaType: 'audio',
    };
    expect(allowPermissionCheck(check)).toBe(true);
    expect(allowPermissionCheck({ ...check, mediaType: 'unknown' })).toBe(true);
    expect(allowPermissionCheck({ ...check, mediaType: 'video' })).toBe(false);
    expect(allowPermissionCheck({ ...check, fromOurWindow: false })).toBe(false);
    expect(allowPermissionCheck({ ...check, permission: 'notifications' })).toBe(false);
  });
});

describe('main → renderer channels', () => {
  it('the preload listens on the same channels main sends to (audio, overlay)', () => {
    const preload = fs.readFileSync(path.resolve(__dirname, '..', 'preload.ts'), 'utf8');
    expect(preload).toContain(`ipcRenderer.on('${AUDIO_COMMAND_CHANNEL}'`);
    expect(preload).toContain(`ipcRenderer.on('${OVERLAY_STATE_CHANNEL}'`);
    // The only two ipcRenderer.on in the preload; they pass the payload, never the event.
    expect(preload.match(/ipcRenderer\.on\(/g)).toHaveLength(2);
    expect(preload).toMatch(/\(_event, command[^)]*\) =>\s*listener\(command\)/);
    expect(preload).toMatch(/\(_event, state[^)]*\) =>\s*listener\(state\)/);
  });
});
