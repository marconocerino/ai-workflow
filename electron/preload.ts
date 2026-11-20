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
  // Read-only: flags come from IT policy and can't be changed from the page.
  features: {
    get: () => invoke('features:get'),
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
  ai: {
    testConnection: (service) => invoke('ai:test-connection', service),
  },
  hotkey: {
    status: () => invoke('hotkey:status'),
    setToggleShortcut: (keys) => invoke('hotkey:set-toggle-shortcut', keys),
    suspend: (on) => invoke('hotkey:suspend', on),
  },
  audio: {
    status: () => invoke('audio:status'),
  },
  audioEngine: {
    // Main sends commands only to the hidden audio window. Only the payload is passed on, never
    // the IPC event. (Same string as AUDIO_COMMAND_CHANNEL; a test checks they match.)
    onCommand: (listener) => {
      ipcRenderer.on('audio:command', (_event, command: Parameters<typeof listener>[0]) =>
        listener(command),
      );
    },
    event: (event) => invoke('audio:event', event),
    recording: (recording) => invoke('audio:recording', recording),
  },
  startup: {
    get: () => invoke('startup:get'),
    set: (openAtLogin) => invoke('startup:set', openAtLogin),
  },
  log: {
    rendererError: (report) => invoke('log:renderer-error', report),
  },
  diagnostics: {
    export: () => invoke('diagnostics:export'),
    openLogs: () => invoke('diagnostics:open-logs'),
  },
};

contextBridge.exposeInMainWorld('aiWorkflow', api);
