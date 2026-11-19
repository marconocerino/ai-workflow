import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AiHttpClient } from './ai/ai-http';
import { AppDatabase } from './db/app-database';
import { buildDiagnosticsZip, diagnosticsFileName } from './diagnostics/export';
import { registerAiIpc } from './ipc/ai';
import { getAppInfo } from './ipc/app-info';
import { registerDiagnosticsIpc } from './ipc/diagnostics';
import { createIpcRegistrar } from './ipc/handle';
import { registerSettingsIpc } from './ipc/settings';
import { Logger, RotatingFile, parseLogLevel } from './logging';
import { loadFeaturePolicy } from './policy/policy';
import { windowsRegQuery } from './policy/registry';
import { terminalEcho } from './logging/logger';
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
import { Startup } from './startup';
import { DictationStatus } from './tray/dictation-status';
import { TrayController } from './tray/tray-controller';
import { APP_TITLE, createMainWindowOptions } from './window';
import { WindowLifecycle } from './window-lifecycle';
import type { FeatureState } from '../shared/features';
import { SECRET_NAMES, type SecretName } from '../shared/settings';

// Dev/test only (ignored in packaged builds): separate profile folder and a fake macOS keychain,
// so e2e tests never touch the real profile or pop up a Keychain prompt.
if (!app.isPackaged && process.env['AIW_USER_DATA_DIR']) {
  app.setPath('userData', process.env['AIW_USER_DATA_DIR']);
}
if (!app.isPackaged && process.env['AIW_MOCK_KEYCHAIN'] === '1') {
  app.commandLine.appendSwitch('use-mock-keychain');
}

// Logging (VAI-107): <userData>/logs/main.log, rotated at 1 MB, 5 files kept. Level `info`;
// dev/test may set AIW_LOG_LEVEL. Never log transcripts, audio or keys (see electron/logging).
const logFile = new RotatingFile(path.join(app.getPath('userData'), 'logs'));
const logger = new Logger({
  sink: (line) => logFile.write(line),
  level: (!app.isPackaged && parseLogLevel(process.env['AIW_LOG_LEVEL'])) || 'info',
  ...(!app.isPackaged ? { echo: terminalEcho } : {}),
});
const appLog = logger.scope('app');
appLog.info('Starting', {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  packaged: app.isPackaged,
});
// Observe only: doesn't change Electron's default handling of crashes (VAI-111 adds recovery).
process.on('uncaughtExceptionMonitor', (error, origin) =>
  appLog.error('Uncaught exception in the main process', { origin, error }),
);
app.on('render-process-gone', (_e, _wc, details) =>
  appLog.error('Window process stopped', { reason: details.reason, exitCode: details.exitCode }),
);
app.on('child-process-gone', (_e, details) =>
  appLog.error('Helper process stopped', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
  }),
);

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

// Tray and window behaviour (VAI-205): closing the window hides it; real quits go through.
const lifecycle = new WindowLifecycle(logger.scope('window'));
const dictationStatus = new DictationStatus();
const startup = new Startup(app, process.platform, logger.scope('startup'));
let tray: TrayController | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => lifecycle.show());
  app.on('before-quit', () => lifecycle.quitting());

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

  void app.whenReady().then(async () => {
    configureSession();
    registerAppProtocol();
    const settingsDir = app.getPath('userData');
    const settings = new SettingsStore(settingsDir, { logger: logger.scope('settings') });
    settings.load();
    const secrets = new SecretStore(settingsDir, osEncryptor(), {
      logger: logger.scope('secrets'),
      onSecret: (value) => logger.addSecret(value),
    });
    const database = new AppDatabase(path.join(settingsDir, 'data'), secrets, {
      logger: logger.scope('db'),
    });
    const db = await database.open();
    logger.scope('db').info('Database opened', { status: db.status, schema: db.schemaVersion });
    const features = await loadFeaturePolicy({
      platform: process.platform,
      regQuery: windowsRegQuery,
      macFile: '/Library/Application Support/AI Workflow/policy.json',
      // Dev/test only: a JSON policy file instead of the registry (ignored when packaged).
      ...(!app.isPackaged && process.env['AIW_POLICY_FILE']
        ? { testFile: process.env['AIW_POLICY_FILE'] }
        : {}),
      logger: logger.scope('policy'),
    });
    logger.scope('policy').info('Features', {
      ...Object.fromEntries(Object.entries(features.flags).map(([k, v]) => [k, v ? 'on' : 'off'])),
      source: features.sources.join(','),
    });
    app.on('will-quit', () => {
      tray?.destroy();
      database.close();
      appLog.info('Quit');
    });
    registerIpc(settings, secrets, database, features);
    createTray();
    createMainWindow(startup.openedAtLogin(process.argv));
    exposeTestHooks();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(false);
      else lifecycle.show();
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
    isEncryptionAvailable: async () =>
      (await safeStorage.isAsyncEncryptionAvailable()) &&
      !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
    encryptString: (text) => safeStorage.encryptStringAsync(text),
    decryptString: async (data) => {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(data);
      return { value: result, shouldReEncrypt };
    },
  };
}

function registerIpc(
  settings: SettingsStore,
  secrets: SecretStore,
  database: AppDatabase,
  features: FeatureState,
): void {
  const handle = createIpcRegistrar(ipcMain, (event) =>
    isTrustedUrl(event.senderFrame?.url, trustedOrigins),
  );

  const appInfo = () =>
    getAppInfo({
      name: APP_TITLE,
      version: app.getVersion(),
      platform: process.platform,
      versions: process.versions,
      database: database.status(),
    });
  handle('app:get-info', appInfo);
  handle('features:get', () => features);
  handle('startup:get', () => startup.get());
  handle('startup:set', (_event, openAtLogin) => startup.set(openAtLogin));
  // Feature IPC is registered through the gate, so a hidden feature has nothing to call:
  //   const registerIf = featureGate(features.flags, logger.scope('policy'));
  //   registerIf('meetings', () => registerMeetingsIpc(handle, …));
  registerSettingsIpc(handle, settings, secrets);
  registerDiagnosticsIpc(handle, diagnosticsDeps(settings, secrets, appInfo, features));

  // Electron's net.fetch uses Chromium's network stack: system proxy and company certificates work.
  const aiClient = new AiHttpClient(
    () => settings.get(),
    secrets,
    (url, init) => net.fetch(url, init),
  );
  registerAiIpc(handle, aiClient, settings, secrets, logger.scope('ai'));
}

/** Dev/test only: save diagnostics into this folder without a dialog (for e2e). */
const testDiagnosticsDir = !app.isPackaged ? process.env['AIW_DIAGNOSTICS_DIR'] : undefined;

function diagnosticsDeps(
  settings: SettingsStore,
  secrets: SecretStore,
  appInfo: () => ReturnType<typeof getAppInfo>,
  features: FeatureState,
): Parameters<typeof registerDiagnosticsIpc>[1] {
  return {
    logger: logger.scope('diagnostics'),
    rendererLogger: logger.scope('renderer'),
    defaultName: () => diagnosticsFileName(new Date()),
    chooseFile: async (name) => {
      if (testDiagnosticsDir) return path.join(testDiagnosticsDir, name);
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const options = {
        title: 'Export diagnostics',
        defaultPath: path.join(app.getPath('downloads'), name),
        filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    writeZip: (file) => {
      const zip = buildDiagnosticsZip({
        logFiles: logFile.files(),
        settings: settings.get(),
        appInfo: appInfo(),
        features,
        secretsSet: Object.fromEntries(SECRET_NAMES.map((n) => [n, secrets.has(n)])) as Record<
          SecretName,
          boolean
        >,
        redactor: logger.redactor,
        now: new Date(),
      });
      fs.writeFileSync(file, zip);
    },
    reveal: (file) => {
      if (!testDiagnosticsDir) shell.showItemInFolder(file);
    },
    openLogsFolder: async () => {
      fs.mkdirSync(logFile.dir, { recursive: true });
      const error = await shell.openPath(logFile.dir);
      if (error) throw new Error('The logs folder could not be opened.');
    },
  };
}

const rendererBase = devServerUrl?.replace(/\/+$/, '') ?? APP_ORIGIN;

function createMainWindow(hidden: boolean): void {
  const win = new BrowserWindow(createMainWindowOptions(path.join(__dirname, 'preload.js')));
  lifecycle.attach(win);
  // Started at sign-in: stay in the tray until the user opens the window.
  if (hidden) appLog.info('Started at sign-in; staying in the tray');
  else win.once('ready-to-show', () => win.show());
  void win.loadURL(`${rendererBase}/`);
}

function createTray(): void {
  const iconDir = path.join(app.getAppPath(), 'assets', 'tray');
  tray = new TrayController({
    // No GUID yet: on Windows an unsigned exe that moves can't reuse it (add with VAI-108b).
    createTray: (icon) => {
      const image = nativeImage.createFromPath(icon);
      if (image.isEmpty())
        logger.scope('tray').warn('Tray icon missing', { file: path.basename(icon) });
      return new Tray(image);
    },
    buildMenu: (template) => Menu.buildFromTemplate(template),
    iconPath: (state) => path.join(iconDir, `${state}.png`),
    status: dictationStatus,
    platform: process.platform,
    dictationAvailable: () => false, // VAI-301 adds the hotkey
    showWindow: () => lifecycle.show(),
    openSettings: () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) void win.loadURL(`${rendererBase}/settings`);
      lifecycle.show();
    },
    quit: () => app.quit(),
    logger: logger.scope('tray'),
  });
  tray.create();
}

/** e2e only (dev build + AIW_E2E=1): lets Playwright read and drive the tray from the main process. */
function exposeTestHooks(): void {
  if (app.isPackaged || process.env['AIW_E2E'] !== '1') return;
  (globalThis as Record<string, unknown>)['__aiwTest'] = {
    tray: () => tray?.describe(),
    clickTray: (label: string) => tray?.click(label),
    setDictationState: (state: Parameters<DictationStatus['set']>[0]) => dictationStatus.set(state),
  };
}
