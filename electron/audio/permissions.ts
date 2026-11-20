/**
 * Which permission requests the app grants (VAI-302, D-020). Everything is denied except the
 * microphone — audio only, only for the hidden audio window, only from our own origin. Settings
 * may *check* the mic permission so it can show device names.
 */
export interface PermissionRequest {
  permission: string;
  fromAudioWindow: boolean;
  trustedOrigin: boolean;
  /** For 'media': what's asked for, e.g. ['audio'] or ['audio', 'video']. */
  mediaTypes: readonly string[];
}

export function allowPermissionRequest(r: PermissionRequest): boolean {
  return (
    r.permission === 'media' &&
    r.fromAudioWindow &&
    r.trustedOrigin &&
    r.mediaTypes.length > 0 &&
    r.mediaTypes.every((t) => t === 'audio')
  );
}

export interface PermissionCheck {
  permission: string;
  fromOurWindow: boolean;
  trustedOrigin: boolean;
  /** 'audio', 'video' or 'unknown' (Chromium checks device-label access as 'unknown'). */
  mediaType: string | undefined;
}

export function allowPermissionCheck(c: PermissionCheck): boolean {
  return (
    c.permission === 'media' &&
    c.fromOurWindow &&
    c.trustedOrigin &&
    (c.mediaType === 'audio' || c.mediaType === 'unknown' || c.mediaType === undefined)
  );
}
