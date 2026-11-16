import { describe, expect, it } from 'vitest';
import { APP_TITLE, createMainWindowOptions } from './window';

describe('createMainWindowOptions', () => {
  const options = createMainWindowOptions('/app/preload.js');
  const prefs = options.webPreferences ?? {};

  it('gives the renderer no Node access', () => {
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.nodeIntegrationInWorker).toBe(false);
    expect(prefs.nodeIntegrationInSubFrames).toBe(false);
    expect(prefs.sandbox).toBe(true);
  });

  it('keeps web security on and disables risky features', () => {
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.webviewTag).toBe(false);
    expect(prefs.experimentalFeatures).toBe(false);
  });

  it('uses the given preload and the product name', () => {
    expect(prefs.preload).toBe('/app/preload.js');
    expect(options.title).toBe(APP_TITLE);
    expect(APP_TITLE).toBe('AI Workflow');
  });
});
