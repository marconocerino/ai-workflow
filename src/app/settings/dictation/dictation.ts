import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { type MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { HotkeyStatus, PermissionPane, StartupState } from '../../../../shared/ipc-contract';
import type { MicStatus } from '../../../../shared/audio';
import {
  type DictationMode,
  KEEP_MIC_READY_OPTIONS,
  type KeepMicReadySeconds,
} from '../../../../shared/settings';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { HotkeyApi, shortcutFromEvent, shortcutLabel } from '../../core/hotkey-api';
import { MicDevices, micProblemText } from '../../core/mic-devices';
import { SettingsApi } from '../../core/settings-api';
import { StartupApi } from '../../core/startup-api';
import { Icon } from '../../ui/icon/icon';
import { Keys } from '../../ui/keys/keys';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

/**
 * Settings → Dictation (VAI-204, design: Settings@1x.png). How-it-works card and the shortcut
 * mode; Microphone (VAI-302); Startup (VAI-205).
 */
@Component({
  selector: 'app-dictation-settings',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatRadioModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    SettingsHeader,
    Keys,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dictation.html',
  styleUrl: './dictation.scss',
})
export class DictationSettings {
  private readonly api = inject(SettingsApi);
  private readonly status = inject(SaveStatus);

  protected readonly mode = new FormControl<DictationMode>('hold', { nonNullable: true });
  /** The mode as a signal, for the "how it works" card (the form control isn't reactive). */
  protected readonly current = signal<DictationMode>('hold');
  protected readonly toggleShortcut = signal<string[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly hotkeyApi = inject(HotkeyApi);
  protected readonly hotkey = signal<HotkeyStatus | null>(null);
  protected readonly permissionError = signal<string | null>(null);
  /** Recording a new toggle shortcut: null = not recording; otherwise a hint or error. */
  protected readonly capturing = signal<string | null>(null);
  protected readonly shortcutError = signal<string | null>(null);
  private readonly captureBox = viewChild<ElementRef<HTMLElement>>('captureBox');
  protected readonly shortcutLabel = shortcutLabel;
  protected readonly mic = inject(MicDevices);
  protected readonly micDevice = new FormControl('', { nonNullable: true });
  protected readonly keepReady = new FormControl<KeepMicReadySeconds>(10, { nonNullable: true });
  protected readonly keepReadyOptions = KEEP_MIC_READY_OPTIONS;
  protected readonly micStatus = signal<MicStatus | null>(null);
  protected readonly micProblem = computed(() => micProblemText(this.micStatus()));
  /** The saved device isn't plugged in (System default is used instead). */
  protected readonly savedDeviceMissing = computed(
    () => this.savedDevice() !== '' && !this.mic.devices().some((d) => d.id === this.savedDevice()),
  );
  private readonly savedDevice = signal('');
  protected readonly micError = signal<string | null>(null);
  private readonly startupApi = inject(StartupApi);
  private readonly injector = inject(Injector);
  protected readonly startup = signal<StartupState | null>(null);
  protected readonly startupError = signal<string | null>(null);

  constructor() {
    this.status.reset();
    void this.load();
    void this.refreshHotkey();
    this.mic.watch(inject(DestroyRef));
    void this.mic.status().then((s) => this.micStatus.set(s));
    // Never leave global shortcuts paused when leaving the page mid-capture.
    inject(DestroyRef).onDestroy(() => {
      if (this.capturing() !== null) void this.hotkeyApi.suspend(false);
    });
    void this.startupApi.get().then(
      (s) => this.startup.set(s),
      () => this.startup.set({ available: false, openAtLogin: false }),
    );
  }

  protected async setOpenAtLogin(change: MatSlideToggleChange): Promise<void> {
    this.startupError.set(null);
    try {
      this.startup.set(await this.status.track(this.startupApi.set(change.checked)));
    } catch (e) {
      this.startupError.set(ipcErrorMessage(e));
      // Show the real OS state again (set the switch directly: the bound value didn't change).
      const real = await this.startupApi.get().catch(() => this.startup());
      if (real) this.startup.set(real);
      change.source.checked = real?.openAtLogin ?? !change.checked;
    }
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.api.get();
      this.mode.setValue(settings.dictation.mode, { emitEvent: false });
      this.micDevice.setValue(settings.dictation.micDeviceId, { emitEvent: false });
      this.savedDevice.set(settings.dictation.micDeviceId);
      this.keepReady.setValue(settings.dictation.keepMicReadySeconds, { emitEvent: false });
      this.micDevice.valueChanges.subscribe((id) => void this.saveMic({ micDeviceId: id }));
      this.keepReady.valueChanges.subscribe((s) => void this.saveMic({ keepMicReadySeconds: s }));
      this.current.set(settings.dictation.mode);
      this.toggleShortcut.set(settings.dictation.toggleShortcut);
      this.loaded.set(true);
      this.mode.valueChanges.subscribe((mode) => {
        this.current.set(mode);
        void this.saveMode(mode);
      });
    } catch (e) {
      this.error.set(`Couldn't load settings: ${ipcErrorMessage(e)}`);
    }
  }

  private async saveMode(mode: DictationMode): Promise<void> {
    this.error.set(null);
    try {
      await this.status.track(this.api.update({ dictation: { mode } }));
    } catch (e) {
      this.error.set(ipcErrorMessage(e));
    }
    await this.refreshHotkey();
  }

  private async saveMic(patch: {
    micDeviceId?: string;
    keepMicReadySeconds?: KeepMicReadySeconds;
  }): Promise<void> {
    this.micError.set(null);
    try {
      const saved = await this.status.track(this.api.update({ dictation: patch }));
      this.savedDevice.set(saved.dictation.micDeviceId);
    } catch (e) {
      this.micError.set(ipcErrorMessage(e));
    }
  }

  protected keepReadyLabel(seconds: number): string {
    return seconds === 0 ? 'Off' : `${seconds} seconds`;
  }

  /** macOS (VAI-312): open the Privacy & Security page for a missing permission. */
  protected async openPane(pane: PermissionPane): Promise<void> {
    this.permissionError.set(null);
    try {
      await this.hotkeyApi.openPermissionSettings(pane);
    } catch (e) {
      this.permissionError.set(ipcErrorMessage(e));
    }
  }

  /** After granting a permission: start the helpers again and show the new state. */
  protected async recheck(): Promise<void> {
    this.permissionError.set(null);
    try {
      this.hotkey.set(await this.hotkeyApi.recheck());
    } catch (e) {
      this.permissionError.set(ipcErrorMessage(e));
    }
  }

  private async refreshHotkey(): Promise<void> {
    this.hotkey.set(await this.hotkeyApi.status().catch(() => null));
  }

  /** "Change": pause global shortcuts and listen for the next key combination. */
  protected async startCapture(): Promise<void> {
    this.shortcutError.set(null);
    await this.hotkeyApi.suspend(true);
    this.capturing.set('Press the new shortcut… (Esc to cancel)');
    afterNextRender(() => this.captureBox()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async onCaptureKey(event: KeyboardEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      await this.endCapture();
      return;
    }
    const keys = shortcutFromEvent(event);
    if (keys === 'modifier-only') return;
    if (keys === null) {
      this.capturing.set('That key can’t be used. Try a letter, number, F-key or Space.');
      return;
    }
    if (!keys.some((k) => k === 'Ctrl' || k === 'Alt' || k === 'Meta')) {
      this.capturing.set('Include Ctrl, Alt or Win, e.g. Ctrl+Shift+Space.');
      return;
    }
    try {
      const status = await this.status.track(this.hotkeyApi.setToggleShortcut(keys));
      this.toggleShortcut.set(status.toggleShortcut);
      this.hotkey.set(status);
    } catch (e) {
      this.shortcutError.set(ipcErrorMessage(e));
    }
    await this.endCapture();
  }

  protected async endCapture(): Promise<void> {
    if (this.capturing() === null) return;
    this.capturing.set(null);
    await this.hotkeyApi.suspend(false);
    await this.refreshHotkey();
  }
}
