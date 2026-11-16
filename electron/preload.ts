import { contextBridge, ipcRenderer } from 'electron';
// Type-only import: a sandboxed preload cannot require our own files at runtime.
import type { AiWorkflowApi, IpcArgs, IpcChannel, IpcResponse } from '../shared/ipc-contract';

function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>;
}

// Never expose ipcRenderer itself — only narrow functions.
const api: AiWorkflowApi = {
  app: {
    getInfo: () => invoke('app:get-info'),
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
  },
  // Secret values go in but never come back out.
  secrets: {
    set: (name, value) => invoke('secrets:set', { name, value }),
    has: (name) => invoke('secrets:has', name),
    clear: (name) => invoke('secrets:clear', name),
  },
};

contextBridge.exposeInMainWorld('aiWorkflow', api);
