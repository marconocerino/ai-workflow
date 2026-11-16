/**
 * Single source of truth for every IPC channel between the renderer and the main process.
 *
 * Types only: the sandboxed preload cannot load our own files at runtime, so it may only use
 * `import type` from here. Main and renderer import the same types, so a wrong channel name
 * or payload is a compile error on both sides.
 */

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
}
