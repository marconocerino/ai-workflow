import { BrowserWindow, app, ipcMain, net, protocol, safeStorage, session, shell } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getAppInfo } from './ipc/app-info';
import { createIpcRegistrar } from './ipc/handle';
import { registerSettingsIpc } from './ipc/settings';
import {
  APP_ORIGIN,
  APP_SCHEME,
  buildCsp,
  isTrustedUrl,
  originOf,
  resolveRendererPath,
} from './security';
import { type Encryptor, SecretStore } from './settings/secret-store';
import { SettingsStore } from './settings/settings-store';
import { APP_TITLE, createMainWindowOptions } from './window';

// Dev/test only (ignored in packaged builds): separate profile folder and a fake macOS keychain,
// so e2e tests never touch the real profile or pop up a Keychain prompt.
if (!app.isPackaged && process.env['AIW_USER_DATA_DIR']) {
  app.setPath('userData', process.env['AIW_USER_DATA_DIR']);
}
if (!app.isPackaged && process.env['AIW_MOCK_KEYCHAIN'] === '1') {
  app.commandLine.appendSwitch('use-mock-keychain');
}

/** Dev only: URL of `ng serve`. Ignored in packaged builds. */
const devServerUrl = !app.isPackaged ? process.env['AIW_DEV_SERVER_URL'] : undefined;
const devOrigin = originOf(devServerUrl);
const trustedOrigins: string[] = devOrigin ? [devOrigin] : [APP_ORIGIN];
const rendererRoot = path.join(app.getAppPath(), 'dist', 'renderer');
const csp = buildCsp(devServerUrl);

// Must run before 'ready'. Makes app:// behave like a normal secure web origin.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Lock down every webContents ever created (main window and anything later).
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      // Never open new Electron windows. Plain https links go to the system browser.
      if (url.startsWith('https:')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url, trustedOrigins)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  void app.whenReady().then(() => {
    configureSession();
    registerAppProtocol();
    const settingsDir = app.getPath('userData');
    const settings = new SettingsStore(settingsDir);
    settings.load();
    const secrets = new SecretStore(settingsDir, osEncryptor());
    registerIpc(settings, secrets);
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  // Deny every permission (camera, mic, notifications, …) until a story explicitly needs it.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  // CSP on every response (covers the dev server; app:// sets it itself too).
  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRendererPath(request.url, rendererRoot);
    if (!filePath) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(response.body, { status: response.status, headers });
  });
}

/**
 * safeStorage (DPAPI on Windows, Keychain on macOS). On Linux without a keyring Electron falls
 * back to a hard-coded key ('basic_text'), which is not real protection — treat it as unavailable.
 */
function osEncryptor(): Encryptor {
  return {
    isEncryptionAvailable: () =>
      safeStorage.isEncryptionAvailable() &&
      !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
    encryptString: (text) => safeStorage.encryptString(text),
    decryptString: (data) => safeStorage.decryptString(data),
  };
}

function registerIpc(settings: SettingsStore, secrets: SecretStore): void {
  const handle = createIpcRegistrar(ipcMain, (event) =>
    isTrustedUrl(event.senderFrame?.url, trustedOrigins),
  );

  handle('app:get-info', () =>
    getAppInfo({
      name: APP_TITLE,
      version: app.getVersion(),
      platform: process.platform,
      versions: process.versions,
    }),
  );
  registerSettingsIpc(handle, settings, secrets);
}

function createMainWindow(): void {
  const win = new BrowserWindow(createMainWindowOptions(path.join(__dirname, 'preload.js')));
  win.once('ready-to-show', () => win.show());
  void win.loadURL(devServerUrl ?? `${APP_ORIGIN}/`);
}
