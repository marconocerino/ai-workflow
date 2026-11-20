import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type ChildProcess, spawn } from 'node:child_process';
import { AiHttpClient } from './ai/ai-http';
import { Transcriber } from './ai/transcribe';
import { AudioController } from './audio/audio-controller';
import { allowPermissionCheck, allowPermissionRequest } from './audio/permissions';
import { AppDatabase } from './db/app-database';
import { buildDiagnosticsZip, diagnosticsFileName } from './diagnostics/export';
import { clipboardOutput } from './dictation/clipboard-output';
import { DictationPipeline, type DictationOutput } from './dictation/dictation-pipeline';
import { pasteOutput, runPasteHelper } from './dictation/paste-output';
import { registerAiIpc } from './ipc/ai';
import { DictationHotkey } from './hotkey/dictation-hotkey';
import { KeyListener } from './hotkey/key-listener';
import { getAppInfo } from './ipc/app-info';
import { registerHotkeyIpc } from './ipc/hotkey';
import { registerDiagnosticsIpc } from './ipc/diagnostics';
import { createIpcRegistrar } from './ipc/handle';
import { registerSettingsIpc } from './ipc/settings';
import { Logger, RotatingFile, parseLogLevel } from './logging';
import { loadFeaturePolicy } from './policy/policy';
import { windowsRegQuery } from './policy/registry';
import { type ScopedLogger, terminalEcho } from './logging/logger';
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
import { runFrontApp } from './overlay/front-app';
import { OVERLAY_SIZE, OverlayController } from './overlay/overlay-controller';
import { APP_TITLE, createMainWindowOptions } from './window';
import { WindowLifecycle } from './window-lifecycle';
import type { AudioCommand } from '../shared/audio';
import type { FeatureState } from '../shared/features';
import {
  AUDIO_COMMAND_CHANNEL,
  OVERLAY_STATE_CHANNEL,
  type PasteStatus,
} from '../shared/ipc-contract';
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

// Windows shows notifications only for an app with an AppUserModelID. Packaged: the appId that
// electron-builder gives the Start-menu shortcut; from source: the Electron binary (Electron docs).
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.aiworkflow.desktop' : process.execPath);
}

// Tray and window behaviour (VAI-205): closing the window hides it; real quits go through.
const lifecycle = new WindowLifecycle(logger.scope('window'));
const dictationStatus = new DictationStatus();
const startup = new Startup(app, process.platform, logger.scope('startup'));
let tray: TrayController | null = null;
let hotkey: DictationHotkey | null = null;
let audio: AudioController | null = null;
let mainWindow: BrowserWindow | null = null;
let audioWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlay: OverlayController | null = null;
let lastRecordingForTests: { durationMs: number; peak: number } | null = null;
let lastNotificationForTests: { title: string; body: string } | null = null;
let pipeline: DictationPipeline | null = null;
let pasteHelperAvailable = false;
const quietNotifications = !app.isPackaged && process.env['AIW_E2E'] === '1';

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
    const aiClient = createAiClient(settings, secrets);
    pipeline = createPipeline(settings, aiClient);
    audio = createAudio(settings);
    hotkey = createHotkey(settings);
    overlay = createOverlay();
    app.on('will-quit', () => {
      hotkey?.dispose();
      overlay?.dispose();
      audio?.dispose();
      tray?.destroy();
      database.close();
      appLog.info('Quit');
    });
    registerIpc(settings, secrets, database, features, aiClient);
    hotkey.apply();
    createTray();
    createMainWindow(startup.openedAtLogin(process.argv));
    createAudioWindow();
    createOverlayWindow();
    exposeTestHooks();

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(false);
      else lifecycle.show();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  // Deny every permission except the microphone, audio only, for the hidden audio window
  // (VAI-302, D-020). Settings may check it to list device names.
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const allowed = allowPermissionRequest({
      permission,
      fromAudioWindow: !!audioWindow && wc.id === audioWindow.webContents.id,
      trustedOrigin: isTrustedUrl(details.requestingUrl, trustedOrigins),
      mediaTypes: 'mediaTypes' in details ? (details.mediaTypes ?? []) : [],
    });
    if (!allowed) logger.scope('app').info('Permission denied', { permission });
    callback(allowed);
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) =>
    allowPermissionCheck({
      permission,
      fromOurWindow:
        !!wc &&
        [mainWindow, audioWindow].some((w) => w && !w.isDestroyed() && w.webContents.id === wc.id),
      trustedOrigin: isTrustedUrl(requestingOrigin, trustedOrigins),
      mediaType: details.mediaType,
    }),
  );
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
  aiClient: AiHttpClient,
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
  handle('audio:status', () => audio!.status());
  handle('overlay:get-state', () => overlay!.current());
  // Only the hidden audio window may report mic events and deliver recordings.
  const fromAudioWindow = (event: Electron.IpcMainInvokeEvent) => {
    if (!audioWindow || event.sender.id !== audioWindow.webContents.id) {
      throw new Error('Only the audio window may send this.');
    }
  };
  handle('audio:event', (event, payload) => {
    fromAudioWindow(event);
    audioBridge.onEvent(payload);
  });
  handle('audio:recording', (event, payload) => {
    fromAudioWindow(event);
    audio?.onRecording(payload);
  });
  registerSettingsIpc(handle, settings, secrets, () => {
    audio?.configChanged();
    hotkey?.apply();
    tray?.refresh();
  });
  if (hotkey) {
    registerHotkeyIpc(handle, hotkey, settings, {
      platform: process.platform,
      openExternal: (url) => shell.openExternal(url),
      requestAccessibility: () => {
        systemPreferences.isTrustedAccessibilityClient(true); // lists the app, prompts once
      },
    });
  }
  registerDiagnosticsIpc(handle, diagnosticsDeps(settings, secrets, appInfo, features));
  registerAiIpc(handle, aiClient, settings, secrets, logger.scope('ai'));
}

/** The only client for AI servers (D-009): requests go only to the configured hosts. */
function createAiClient(settings: SettingsStore, secrets: SecretStore): AiHttpClient {
  // Electron's net.fetch uses Chromium's network stack: system proxy and company certificates work.
  return new AiHttpClient(
    () => settings.get(),
    secrets,
    (url, init) => net.fetch(url, init),
  );
}

/** Recording → speech-to-text (VAI-303) → paste at the cursor (VAI-304). */
function createPipeline(settings: SettingsStore, aiClient: AiHttpClient): DictationPipeline {
  const log = logger.scope('dictation');
  const transcriber = new Transcriber({
    client: aiClient,
    settings: () => settings.get(),
    logger: log,
  });
  return new DictationPipeline({
    transcribe: (recording) => transcriber.transcribe(recording),
    output: createOutput(log),
    status: dictationStatus,
    micReady: () => audio?.status().state === 'ready',
    logger: log,
  });
}

/**
 * Windows: paste at the cursor through aiw-paste.exe (D-022). Elsewhere (macOS dev), or if the
 * helper isn't built: text on the clipboard + a notification. Dev/test: AIW_PASTE_HELPER_SCRIPT
 * runs a fake helper script instead.
 */
function createOutput(log: ScopedLogger): DictationOutput {
  const notify = (title: string, body: string) => {
    lastNotificationForTests = { title, body };
    // e2e reads it through the test hook instead of popping up on the developer's screen.
    if (quietNotifications || !Notification.isSupported()) return;
    const note = new Notification({ title, body, silent: true });
    note.on('failed', (_e, error) => log.warn('Notification could not be shown', { error }));
    note.show();
  };
  const writeClipboard = (text: string) => clipboard.writeText(text);

  const spawnHelper = helperSpawner('aiw-paste', 'AIW_PASTE_HELPER_SCRIPT');
  pasteHelperAvailable = spawnHelper !== null;
  if (!spawnHelper) {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      log.warn('Paste helper missing; using the clipboard only');
    }
    return clipboardOutput({ writeClipboard, notify, platform: process.platform });
  }
  return pasteOutput({
    paste: (text) => runPasteHelper(() => spawnHelper(), text),
    writeClipboard,
    notify,
    platform: process.platform,
    logger: log,
  });
}

/**
 * How to start a native helper (`aiw-key-listener`, `aiw-paste`), or null if there is none:
 * - Windows: resources/win/<name>.exe, unpacked from the asar when packaged (D-019, D-022).
 * - macOS: resources/mac/<name>, from source only (built by `npm start`; VAI-312).
 * - Dev/test: the fake script in `fakeEnv` instead. e2e never runs the real helpers.
 */
function helperSpawner(name: string, fakeEnv: string): ((args?: string[]) => ChildProcess) | null {
  const fakeScript = !app.isPackaged ? process.env[fakeEnv] : undefined;
  if (fakeScript) {
    return (args = []) =>
      spawn(process.execPath, [fakeScript, ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'ignore'],
      });
  }
  if (!app.isPackaged && process.env['AIW_E2E'] === '1') return null;
  const file =
    process.platform === 'win32'
      ? app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'win', `${name}.exe`)
        : path.join(app.getAppPath(), 'resources', 'win', `${name}.exe`)
      : process.platform === 'darwin' && !app.isPackaged
        ? path.join(app.getAppPath(), 'resources', 'mac', name)
        : null;
  if (!file || !fs.existsSync(file)) return null;
  return (args = []) => spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
}

/** Can text be pasted at the cursor? (Settings, VAI-304/312) */
function pasteStatus(): PasteStatus {
  if (!pasteHelperAvailable) return 'clipboard-only';
  if (process.platform !== 'darwin') return 'ready';
  // Dev/test: AIW_FAKE_ACCESSIBILITY=0 pretends the permission is missing (with the fake helper).
  const fake = !app.isPackaged ? process.env['AIW_FAKE_ACCESSIBILITY'] : undefined;
  if (fake !== undefined || process.env['AIW_PASTE_HELPER_SCRIPT'])
    return fake === '0' ? 'no-permission' : 'ready';
  return systemPreferences.isTrustedAccessibilityClient(false) ? 'ready' : 'no-permission';
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
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
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
  mainWindow = win;
  lifecycle.attach(win);
  // Started at sign-in: stay in the tray until the user opens the window.
  if (hidden) appLog.info('Started at sign-in; staying in the tray');
  else win.once('ready-to-show', () => win.show());
  void win.loadURL(`${rendererBase}/`);
}

/** The floating dictation bar (VAI-305): follows DictationStatus; shows without focus. */
function createOverlay(): OverlayController {
  const pasteHelper = helperSpawner('aiw-paste', 'AIW_PASTE_HELPER_SCRIPT');
  return new OverlayController({
    window: {
      show: (bounds) => {
        const win = overlayWindow;
        if (!win || win.isDestroyed()) return;
        win.setBounds(bounds);
        win.showInactive(); // never takes focus from the app being dictated into
      },
      hide: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
      },
      send: (state) => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send(OVERLAY_STATE_CHANNEL, state);
        }
      },
    },
    status: dictationStatus,
    workArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
    source: () => hotkey?.recordingSource ?? null,
    frontApp: pasteHelper ? () => runFrontApp(() => pasteHelper(['--front-app'])) : undefined,
    logger: logger.scope('overlay'),
  });
}

/**
 * The overlay window (VAI-305, D-023): created hidden at startup with its page loaded, so showing
 * it is instant. Transparent, frameless, always on top, can't be focused or clicked (clicks go to
 * the app below), not in the taskbar. Same security settings as the other windows.
 */
function createOverlayWindow(): void {
  const options = createMainWindowOptions(path.join(__dirname, 'preload.js'));
  const win = new BrowserWindow({
    ...options,
    title: 'AI Workflow dictation',
    ...OVERLAY_SIZE,
    minWidth: undefined,
    minHeight: undefined,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: { ...options.webPreferences, backgroundThrottling: false },
  });
  overlayWindow = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  win.webContents.on('render-process-gone', (_e, details) =>
    logger.scope('overlay').error('Overlay window stopped', { reason: details.reason }),
  );
  void win.loadURL(`${rendererBase}/overlay`);
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
    problem: () => {
      const p = audio?.status().problem;
      return p === 'blocked' ? 'microphone blocked' : p === 'no-device' ? 'no microphone' : null;
    },
    dictationAvailable: () => {
      const s = hotkey?.status();
      return s?.holdCtrl === 'ready' || s?.toggleActive === true;
    },
    showWindow: () => lifecycle.show(),
    openSettings: () => {
      if (mainWindow && !mainWindow.isDestroyed())
        void mainWindow.loadURL(`${rendererBase}/settings`);
      lifecycle.show();
    },
    quit: () => app.quit(),
    logger: logger.scope('tray'),
  });
  tray.create();
}

/**
 * Hidden window that owns the microphone (VAI-302, D-020): same security settings as the main
 * window, never shown, not throttled in the background, audio may start without a click.
 */
function createAudioWindow(): void {
  const options = createMainWindowOptions(path.join(__dirname, 'preload.js'));
  const win = new BrowserWindow({
    ...options,
    title: 'AI Workflow audio',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      ...options.webPreferences,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  audioWindow = win;
  win.webContents.on('render-process-gone', (_e, details) => {
    logger.scope('audio').error('Audio window stopped', { reason: details.reason });
    audioBridge.reset();
    audio?.onEvent({ type: 'closed' });
  });
  void win.loadURL(`${rendererBase}/audio-engine`);
}

/** Commands to the audio window, held until its page says it's ready. */
const audioBridge = (() => {
  let ready = false;
  let queue: AudioCommand[] = [];
  return {
    send(command: AudioCommand) {
      if (!ready) {
        queue.push(command);
        return;
      }
      if (audioWindow && !audioWindow.isDestroyed()) {
        audioWindow.webContents.send(AUDIO_COMMAND_CHANNEL, command);
      }
    },
    onEvent(event: unknown) {
      const e = event as { type?: unknown } | null;
      if (e?.type === 'ready') {
        ready = true;
        const pending = queue;
        queue = [];
        pending.forEach((c) => this.send(c));
        return;
      }
      if (e?.type === 'level') {
        // 20 per second while recording: only for the overlay meter (VAI-305).
        overlay?.level((event as { level?: unknown }).level);
        return;
      }
      audio?.onEvent(event as Parameters<AudioController['onEvent']>[0]);
      tray?.refresh();
    },
    reset() {
      ready = false;
      queue = [];
    },
  };
})();

function createAudio(settings: SettingsStore): AudioController {
  return new AudioController({
    send: (command) => audioBridge.send(command),
    config: () => settings.get().dictation,
    status: dictationStatus,
    logger: logger.scope('audio'),
    // Speech-to-text (VAI-303). Tests may read the length and level (never the audio).
    onRecording: (r) => {
      lastRecordingForTests = { durationMs: r.durationMs, peak: r.peak };
      void pipeline?.onRecording(r);
    },
  });
}

/**
 * Keyboard control of dictation (VAI-301, D-019). Windows: Hold-Ctrl through our watcher
 * process (resources/aiw-key-listener.exe). Elsewhere, and whenever the watcher can't run, the
 * toggle shortcut. Dev/test: AIW_KEY_LISTENER_SCRIPT runs a fake watcher script instead.
 */
function createHotkey(settings: SettingsStore): DictationHotkey {
  const spawnWatcher = helperSpawner('aiw-key-listener', 'AIW_KEY_LISTENER_SCRIPT');

  let controller: DictationHotkey | null = null;
  const listener = spawnWatcher
    ? new KeyListener({
        spawn: spawnWatcher,
        onEvent: (e) => controller?.keyEvent(e),
        onAvailability: (ok) => {
          controller?.holdAvailability(ok);
          tray?.refresh();
        },
        logger: logger.scope('hotkey'),
      })
    : null;
  controller = new DictationHotkey({
    shortcuts: globalShortcut,
    listener,
    status: dictationStatus,
    // The overlay hears "stop"/"cancel" before the recorder, so it switches without flicker.
    events: audio
      ? {
          start: () => audio!.start(),
          stop: () => {
            overlay?.ended('stop');
            audio!.stop();
          },
          cancel: () => {
            overlay?.ended('cancel');
            audio!.cancel();
          },
          prepare: () => audio!.prepare(),
          abandon: () => audio!.abandon(),
        }
      : undefined,
    config: () => settings.get().dictation,
    paste: pasteStatus,
    logger: logger.scope('hotkey'),
  });
  return controller;
}

/** e2e only (dev build + AIW_E2E=1): lets Playwright read and drive the tray from the main process. */
function exposeTestHooks(): void {
  if (app.isPackaged || process.env['AIW_E2E'] !== '1') return;
  (globalThis as Record<string, unknown>)['__aiwTest'] = {
    tray: () => tray?.describe(),
    clickTray: (label: string) => tray?.click(label),
    setDictationState: (state: Parameters<DictationStatus['set']>[0]) => dictationStatus.set(state),
    hotkey: () => hotkey?.status(),
    audio: () => audio?.status(),
    lastRecording: () => lastRecordingForTests,
    lastNotification: () => lastNotificationForTests,
    overlay: () => ({
      ...overlay?.describe(),
      visible: !!overlayWindow && overlayWindow.isVisible(),
      focusable: !!overlayWindow && overlayWindow.isFocusable(),
      focused: !!overlayWindow && overlayWindow.isFocused(),
    }),
    focusedWindowId: () => BrowserWindow.getFocusedWindow()?.id ?? null,
  };
}
