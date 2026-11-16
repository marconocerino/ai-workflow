import type { BrowserWindowConstructorOptions } from 'electron';

export const APP_TITLE = 'AI Workflow';

/**
 * Options for the main window. Kept as a pure function so the security flags are unit-tested.
 * Renderer gets no Node: context isolation on, Node integration off, Chromium sandbox on.
 */
export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    title: APP_TITLE,
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#eef0e2',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      experimentalFeatures: false,
    },
  };
}
