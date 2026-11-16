/**
 * Single source of truth for every IPC channel between the renderer and the main process.
 *
 * Types only: the sandboxed preload cannot load our own files at runtime, so it may only use
 * `import type` from here. Main and renderer import the same types, so a wrong channel name
 * or payload is a compile error on both sides.
 */
import type { SecretName, Settings, SettingsPatch } from './settings';

/** Basic facts about the running app. Contains nothing sensitive. */
export interface AppInfo {
  name: string;
  version: string;
  /** Node platform string, e.g. 'win32', 'darwin', 'linux'. */
  platform: string;
  electron: string;
  chrome: string;
}

/** channel → request payload and response type. */
export interface IpcContract {
  'app:get-info': { request: void; response: AppInfo };
  'settings:get': { request: void; response: Settings };
  /** Validates and saves; rejects with a message naming the bad field. Returns the saved settings. */
  'settings:update': { request: SettingsPatch; response: Settings };
  'secrets:set': { request: { name: SecretName; value: string }; response: void };
  /** True if a value is stored. The value itself never leaves the main process. */
  'secrets:has': { request: SecretName; response: boolean };
  'secrets:clear': { request: SecretName; response: void };
}

export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request'];
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response'];

/** Arguments after the channel name: none for `void` requests, otherwise exactly one payload. */
export type IpcArgs<C extends IpcChannel> = IpcRequest<C> extends void ? [] : [IpcRequest<C>];

/** What the preload exposes on `window.aiWorkflow`. Narrow, purpose-built functions only. */
export interface AiWorkflowApi {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: SettingsPatch): Promise<Settings>;
  };
  secrets: {
    set(name: SecretName, value: string): Promise<void>;
    has(name: SecretName): Promise<boolean>;
    clear(name: SecretName): Promise<void>;
  };
}
