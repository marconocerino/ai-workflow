import type { MenuItemConstructorOptions } from 'electron';
import type { ScopedLogger } from '../logging/logger';
import type { DictationState, DictationStatus } from './dictation-status';

/** The parts of Electron's Tray we use (injectable for tests). */
export interface TrayLike {
  setImage(image: string): void;
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  on(event: 'click', listener: () => void): void;
  destroy(): void;
}

export interface TrayDeps {
  createTray(iconPath: string): TrayLike;
  buildMenu(template: MenuItemConstructorOptions[]): unknown;
  iconPath(state: DictationState): string;
  status: DictationStatus;
  platform: NodeJS.Platform;
  /** Whether the hotkey exists yet (VAI-301). Until then the menu says "not active yet". */
  dictationAvailable: () => boolean;
  showWindow(): void;
  openSettings(): void;
  quit(): void;
  logger?: ScopedLogger;
}

export const STATE_LABEL: Record<DictationState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  recording: 'Recording',
};

/**
 * System tray icon (VAI-205): icon + tooltip follow the dictation state; menu to open the app,
 * Settings, or quit. Clicking the icon opens the window on Windows (macOS shows the menu).
 */
export class TrayController {
  private tray: TrayLike | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: TrayDeps) {}

  create(): void {
    const { deps } = this;
    this.tray = deps.createTray(deps.iconPath(deps.status.get()));
    if (deps.platform !== 'darwin') this.tray.on('click', () => deps.showWindow());
    this.render(deps.status.get());
    this.unsubscribe = deps.status.onChange((state) => this.render(state));
    deps.logger?.info('Tray created');
  }

  destroy(): void {
    this.unsubscribe?.();
    this.tray?.destroy();
    this.tray = null;
  }

  /** Current tooltip and menu labels, for tests. */
  describe(): { state: DictationState; tooltip: string; menu: string[] } {
    const state = this.deps.status.get();
    return {
      state,
      tooltip: tooltip(state),
      menu: this.menuTemplate(state).map((i) => (i.type === 'separator' ? '---' : String(i.label))),
    };
  }

  /** Run a menu item by label (tests). */
  click(label: string): void {
    const item = this.menuTemplate(this.deps.status.get()).find((i) => i.label === label);
    if (!item?.click || item.enabled === false) throw new Error(`No enabled menu item "${label}"`);
    (item.click as () => void)();
  }

  private render(state: DictationState): void {
    if (!this.tray) return;
    this.tray.setImage(this.deps.iconPath(state));
    this.tray.setToolTip(tooltip(state));
    this.tray.setContextMenu(this.deps.buildMenu(this.menuTemplate(state)));
  }

  private menuTemplate(state: DictationState): MenuItemConstructorOptions[] {
    const { deps } = this;
    const statusLine = deps.dictationAvailable()
      ? `Dictation: ${STATE_LABEL[state]}`
      : 'Dictation: not active yet';
    return [
      { label: statusLine, enabled: false },
      { type: 'separator' },
      { label: 'Open AI Workflow', click: () => deps.showWindow() },
      { label: 'Settings', click: () => deps.openSettings() },
      { type: 'separator' },
      { label: 'Quit AI Workflow', click: () => deps.quit() },
    ];
  }
}

function tooltip(state: DictationState): string {
  return `AI Workflow — ${STATE_LABEL[state]}`;
}
