/**
 * Single source of truth for every IPC channel between the renderer and the main process.
 *
 * Types only: the sandboxed preload cannot load our own files at runtime, so it may only use
 * `import type` from here. Main and renderer import the same types, so a wrong channel name
 * or payload is a compile error on both sides.
 */
import type { AiService, ConnectionResult } from './ai';
import type { AudioCommand, AudioEvent, MicStatus } from './audio';
import type { FeatureState } from './features';
import type { SecretName, Settings, SettingsPatch } from './settings';

/** Local database health (VAI-106). Never contains data or keys. */
export interface DatabaseStatus {
  /** ok: open and up to date · unavailable: OS encryption missing · error: could not open/migrate */
  status: 'ok' | 'unavailable' | 'error';
  schemaVersion: number;
  encrypted: boolean;
  /** Short, user-facing explanation when not ok. */
  message?: string;
}

/** Basic facts about the running app. Contains nothing sensitive. */
export interface AppInfo {
  name: string;
  version: string;
  /** Node platform string, e.g. 'win32', 'darwin', 'linux'. */
  platform: string;
  electron: string;
  chrome: string;
  database: DatabaseStatus;
}

/** An unexpected renderer error, sent to the main-process log (VAI-107). Capped and scrubbed. */
export interface RendererErrorReport {
  name: string;
  message: string;
  stack?: string;
}

/** Result of Settings → Diagnostics → Export. `fileName` only (no folder path). */
export type DiagnosticsExportResult = { saved: true; fileName: string } | { saved: false };

/** Start at sign-in (VAI-205). `available` is false when running from source. */
export interface StartupState {
  available: boolean;
  openAtLogin: boolean;
}

export type PasteStatus = 'ready' | 'no-permission' | 'clipboard-only';

/** macOS System Settings pages Settings may open (VAI-312). Fixed list, no URLs from the renderer. */
export type PermissionPane = 'input-monitoring' | 'accessibility';

/** Keyboard control of dictation (VAI-301). */
export interface HotkeyStatus {
  mode: 'hold' | 'toggle';
  /**
   * ready: Hold-Ctrl works · unavailable: watcher can't run (toggle shortcut used) ·
   * no-permission: macOS Input Monitoring not granted (VAI-312) · unsupported: no watcher here
   */
  holdCtrl: 'ready' | 'unavailable' | 'no-permission' | 'unsupported';
  /**
   * How text gets out (VAI-304/312): ready = pasted at the cursor · no-permission = macOS
   * Accessibility not granted · clipboard-only = no paste helper (text copied + notification).
   */
  paste: PasteStatus;
  toggleShortcut: string[];
  /** The toggle shortcut is registered right now (toggle mode, or fallback). */
  toggleActive: boolean;
  /** e.g. "Ctrl+Shift+Space is already used by another app." */
  toggleError?: string;
}

/** The only main → renderer message: commands for the hidden audio window. */
export const AUDIO_COMMAND_CHANNEL = 'audio:command';

/** channel → request payload and response type. */
export interface IpcContract {
  'app:get-info': { request: void; response: AppInfo };
  /** Feature flags from the managed policy, fixed at startup. Read-only: there is no setter. */
  'features:get': { request: void; response: FeatureState };
  'settings:get': { request: void; response: Settings };
  /** Validates and saves; rejects with a message naming the bad field. Returns the saved settings. */
  'settings:update': { request: SettingsPatch; response: Settings };
  'secrets:set': { request: { name: SecretName; value: string }; response: void };
  /** True if a value is stored. The value itself never leaves the main process. */
  'secrets:has': { request: SecretName; response: boolean };
  'secrets:clear': { request: SecretName; response: void };
  /** Calls GET {baseUrl}/models on the saved server with the saved key. */
  'ai:test-connection': { request: AiService; response: ConnectionResult };
  'hotkey:status': { request: void; response: HotkeyStatus };
  /** Saves a new toggle shortcut; rejects if it's invalid or taken by another app. */
  'hotkey:set-toggle-shortcut': { request: string[]; response: HotkeyStatus };
  /** Pause global shortcuts while the user records a new one in Settings. */
  'hotkey:suspend': { request: boolean; response: void };
  /** macOS: after granting a permission, start the helpers again and report (VAI-312). */
  'hotkey:recheck': { request: void; response: HotkeyStatus };
  /** macOS: open a Privacy & Security page in System Settings (VAI-312). */
  'hotkey:open-permission-settings': { request: PermissionPane; response: void };
  /** Mic state for Settings (VAI-302). */
  'audio:status': { request: void; response: MicStatus };
  /** Audio window only: mic opened/closed/failed. */
  'audio:event': { request: AudioEvent; response: void };
  /** Audio window only: a finished recording (PCM in memory). */
  'audio:recording': {
    request: { pcm: ArrayBuffer; durationMs: number; peak: number };
    response: void;
  };
  'startup:get': { request: void; response: StartupState };
  /** Turns the OS login entry on or off; rejects when running from source. */
  'startup:set': { request: boolean; response: StartupState };
  /** Log an unexpected renderer error. The renderer can't write anything else to the log. */
  'log:renderer-error': { request: RendererErrorReport; response: void };
  /** Asks where to save, writes the diagnostics zip, shows it in the file manager. */
  'diagnostics:export': { request: void; response: DiagnosticsExportResult };
  /** Opens the logs folder in the file manager. */
  'diagnostics:open-logs': { request: void; response: void };
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
  features: {
    get(): Promise<FeatureState>;
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
  ai: {
    testConnection(service: AiService): Promise<ConnectionResult>;
  };
  hotkey: {
    status(): Promise<HotkeyStatus>;
    setToggleShortcut(keys: string[]): Promise<HotkeyStatus>;
    suspend(on: boolean): Promise<void>;
    recheck(): Promise<HotkeyStatus>;
    openPermissionSettings(pane: PermissionPane): Promise<void>;
  };
  audio: {
    status(): Promise<MicStatus>;
  };
  /** Used only by the hidden audio window (VAI-302); main ignores it from other windows. */
  audioEngine: {
    onCommand(listener: (command: AudioCommand) => void): void;
    event(event: AudioEvent): Promise<void>;
    recording(recording: { pcm: ArrayBuffer; durationMs: number; peak: number }): Promise<void>;
  };
  startup: {
    get(): Promise<StartupState>;
    set(openAtLogin: boolean): Promise<StartupState>;
  };
  log: {
    rendererError(report: RendererErrorReport): Promise<void>;
  };
  diagnostics: {
    export(): Promise<DiagnosticsExportResult>;
    openLogs(): Promise<void>;
  };
}
