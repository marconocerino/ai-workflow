import type { StartupState } from '../shared/ipc-contract';
import type { ScopedLogger } from './logging/logger';
import { HIDDEN_ARG } from './window-lifecycle';

/** The parts of Electron's app we use (injectable for tests). */
export interface LoginItemApi {
  isPackaged: boolean;
  getLoginItemSettings(options?: { args?: string[] }): {
    openAtLogin: boolean;
    wasOpenedAtLogin?: boolean;
  };
  setLoginItemSettings(settings: { openAtLogin: boolean; args?: string[] }): void;
}

/**
 * "Open AI Workflow when I sign in" (VAI-205). The OS login entry is the source of truth, so a
 * change in Task Manager / System Settings shows up here. Only for the installed app: from
 * source it would register the bare Electron binary.
 */
export class Startup {
  constructor(
    private readonly app: LoginItemApi,
    private readonly platform: NodeJS.Platform,
    private readonly logger?: ScopedLogger,
  ) {}

  get available(): boolean {
    return this.app.isPackaged && (this.platform === 'win32' || this.platform === 'darwin');
  }

  get(): StartupState {
    if (!this.available) return { available: false, openAtLogin: false };
    return {
      available: true,
      openAtLogin: this.app.getLoginItemSettings(this.query()).openAtLogin,
    };
  }

  set(openAtLogin: unknown): StartupState {
    if (typeof openAtLogin !== 'boolean') throw new Error('openAtLogin must be true or false.');
    if (!this.available) {
      throw new Error('Starting at sign-in is only available in the installed app.');
    }
    // Windows: start with --hidden so the app goes straight to the tray.
    this.app.setLoginItemSettings({ openAtLogin, ...this.query() });
    this.logger?.info('Start at sign-in changed', { openAtLogin });
    return this.get();
  }

  /** Was this launch started by the OS at sign-in? (macOS reports it; Windows passes --hidden.) */
  openedAtLogin(argv: readonly string[]): boolean {
    if (argv.includes(HIDDEN_ARG)) return true;
    if (this.platform === 'darwin' && this.available) {
      return this.app.getLoginItemSettings().wasOpenedAtLogin === true;
    }
    return false;
  }

  private query(): { args?: string[] } {
    return this.platform === 'win32' ? { args: [HIDDEN_ARG] } : {};
  }
}
