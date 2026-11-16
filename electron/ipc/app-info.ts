import type { AppInfo } from '../../shared/ipc-contract';

export interface AppInfoSource {
  name: string;
  version: string;
  platform: string;
  versions: { electron?: string; chrome?: string };
}

/** Handler for 'app:get-info'. Pure so it can be unit-tested without Electron. */
export function getAppInfo(source: AppInfoSource): AppInfo {
  return {
    name: source.name,
    version: source.version,
    platform: source.platform,
    electron: source.versions.electron ?? 'unknown',
    chrome: source.versions.chrome ?? 'unknown',
  };
}
