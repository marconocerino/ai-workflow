import { TestBed } from '@angular/core/testing';
import type { MicStatus } from '../../../../shared/audio';
import type { AiWorkflowApi, HotkeyStatus } from '../../../../shared/ipc-contract';
import type { Settings } from '../../../../shared/settings';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { SaveStatus } from '../shared/save-status';
import { DictationSettings } from './dictation';

const stored: Settings = {
  dictation: {
    mode: 'hold',
    toggleShortcut: ['Ctrl', 'Alt', 'F9'],
    micDeviceId: '',
    keepMicReadySeconds: 10,
  },
  ai: {
    asr: { baseUrl: '', model: 'qwen3-asr' },
    llm: { baseUrl: '', model: '' },
    timeoutMs: 30000,
    retries: 2,
  },
};

function fakeHotkey(status: Partial<HotkeyStatus> = {}) {
  const base: HotkeyStatus = {
    mode: 'hold',
    holdCtrl: 'ready',
    toggleShortcut: ['Ctrl', 'Alt', 'F9'],
    toggleActive: false,
    paste: 'ready',
    ...status,
  };
  return {
    status: vi.fn().mockResolvedValue(base),
    setToggleShortcut: vi.fn((keys: string[]) =>
      Promise.resolve({ ...base, toggleShortcut: keys }),
    ),
    suspend: vi.fn().mockResolvedValue(undefined),
    recheck: vi.fn().mockResolvedValue({ ...base, holdCtrl: 'ready', paste: 'ready' }),
    openPermissionSettings: vi.fn().mockResolvedValue(undefined),
  };
}

async function render(
  update = vi.fn().mockResolvedValue(stored),
  startup = {
    get: vi.fn().mockResolvedValue({ available: false, openAtLogin: false }),
    set: vi.fn(),
  },
  hotkey = fakeHotkey(),
  micStatus: MicStatus = { state: 'closed', usingDefaultInstead: false },
) {
  const bridge = {
    settings: { get: vi.fn().mockResolvedValue(stored), update },
    startup,
    hotkey,
    audio: { status: vi.fn().mockResolvedValue(micStatus) },
  };
  TestBed.configureTestingModule({
    imports: [DictationSettings],
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi },
      SaveStatus,
    ],
  });
  const fixture = TestBed.createComponent(DictationSettings);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  return { fixture, el, update, settle, startup, hotkey, status: TestBed.inject(SaveStatus) };
}

describe('DictationSettings', () => {
  it('shows the saved mode and toggle shortcut', async () => {
    const { el } = await render();
    expect(el.querySelector<HTMLInputElement>('[data-option="hold"] input')!.checked).toBe(true);
    expect(el.querySelector('[data-testid="toggle-shortcut"]')!.textContent).toContain(
      'Ctrl plus Alt plus F9',
    );
    expect(el.textContent).toContain('1. Hold');
  });

  it('choosing Toggle saves it and updates the how-it-works card', async () => {
    const { el, update, settle, status } = await render();
    el.querySelector<HTMLInputElement>('[data-option="toggle"] input')!.click();
    await settle();
    expect(update).toHaveBeenCalledWith({ dictation: { mode: 'toggle' } });
    expect(status.state()).toBe('saved');
    expect(el.textContent).toContain('1. Press');
    expect(el.textContent).toContain('3. Press again');
  });

  it('shows a save error', async () => {
    const { el, settle, status } = await render(
      vi
        .fn()
        .mockRejectedValue(
          new Error("Error invoking remote method 'settings:update': Error: EACCES"),
        ),
    );
    el.querySelector<HTMLInputElement>('[data-option="toggle"] input')!.click();
    await settle();
    expect(status.state()).toBe('error');
    expect(el.querySelector('[data-testid="dictation-error"]')!.textContent).toContain('EACCES');
  });

  it('start at sign-in: disabled with a note when running from source', async () => {
    const { el, settle } = await render();
    await settle();
    const toggle = el.querySelector('[data-testid="open-at-login"] button[role="switch"]')!;
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(el.querySelector('[data-testid="open-at-login-note"]')!.textContent).toContain(
      'Available in the installed app, not when running from source.',
    );
  });

  it('start at sign-in: installed app turns it on and confirms the save', async () => {
    const startup = {
      get: vi.fn().mockResolvedValue({ available: true, openAtLogin: false }),
      set: vi.fn().mockResolvedValue({ available: true, openAtLogin: true }),
    };
    const { el, settle, status } = await render(undefined, startup);
    await settle();
    el.querySelector<HTMLButtonElement>(
      '[data-testid="open-at-login"] button[role="switch"]',
    )!.click();
    await settle();
    expect(startup.set).toHaveBeenCalledWith(true);
    expect(status.state()).toBe('saved');
    expect(
      el
        .querySelector('[data-testid="open-at-login"] button[role="switch"]')!
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('start at sign-in: a failure shows the error and the real state', async () => {
    const startup = {
      get: vi.fn().mockResolvedValue({ available: true, openAtLogin: false }),
      set: vi.fn().mockRejectedValue(new Error('Access denied')),
    };
    const { el, settle, status } = await render(undefined, startup);
    await settle();
    el.querySelector<HTMLButtonElement>(
      '[data-testid="open-at-login"] button[role="switch"]',
    )!.click();
    await settle();
    expect(status.state()).toBe('error');
    expect(el.querySelector('[data-testid="startup-error"]')!.textContent).toContain(
      'Access denied',
    );
    expect(
      el
        .querySelector('[data-testid="open-at-login"] button[role="switch"]')!
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('Change: records a new shortcut, pauses global shortcuts meanwhile, saves it', async () => {
    const { el, settle, hotkey, status } = await render();
    await settle();
    el.querySelector<HTMLButtonElement>('[data-testid="change-shortcut"]')!.click();
    await settle();
    expect(hotkey.suspend).toHaveBeenCalledWith(true);
    const box = el.querySelector<HTMLElement>('[data-testid="shortcut-capture"]')!;
    expect(box.textContent).toContain('Press the new shortcut');
    // Modifiers alone: keep waiting. Shift+K: not allowed. Ctrl+Alt+K: saved.
    box.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', ctrlKey: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', shiftKey: true }));
    await settle();
    expect(el.querySelector('[data-testid="shortcut-capture"]')!.textContent).toContain(
      'Include Ctrl, Alt or Win',
    );
    el.querySelector('[data-testid="shortcut-capture"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, altKey: true }),
    );
    await settle();
    expect(hotkey.setToggleShortcut).toHaveBeenCalledWith(['Ctrl', 'Alt', 'K']);
    expect(status.state()).toBe('saved');
    expect(hotkey.suspend).toHaveBeenLastCalledWith(false);
    expect(el.querySelector('[data-testid="toggle-shortcut"]')!.textContent).toContain(
      'Ctrl plus Alt plus K',
    );
  });

  it('Change: a shortcut taken by another app shows the reason; Esc cancels', async () => {
    const hotkey = fakeHotkey();
    hotkey.setToggleShortcut.mockRejectedValue(
      new Error(
        "Error invoking remote method 'hotkey:set-toggle-shortcut': ShortcutTakenError: Ctrl+Alt+K is already used by another app. Choose another shortcut.",
      ),
    );
    const { el, settle } = await render(undefined, undefined, hotkey);
    await settle();
    el.querySelector<HTMLButtonElement>('[data-testid="change-shortcut"]')!.click();
    await settle();
    el.querySelector('[data-testid="shortcut-capture"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, altKey: true }),
    );
    await settle();
    expect(el.querySelector('[data-testid="shortcut-error"]')!.textContent).toContain(
      'Ctrl+Alt+K is already used by another app.',
    );
    el.querySelector<HTMLButtonElement>('[data-testid="change-shortcut"]')!.click();
    await settle();
    el.querySelector('[data-testid="shortcut-capture"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape' }),
    );
    await settle();
    expect(el.querySelector('[data-testid="shortcut-capture"]')).toBeNull();
    expect(hotkey.suspend).toHaveBeenLastCalledWith(false);
  });

  it('explains when Hold Ctrl is not available', async () => {
    const { el, settle } = await render(
      undefined,
      undefined,
      fakeHotkey({ holdCtrl: 'unsupported' }),
    );
    await settle();
    expect(el.querySelector('[data-testid="hold-unavailable"]')!.textContent).toContain(
      'Hold Ctrl works in the Windows app',
    );
  });

  describe('macOS permissions (VAI-312)', () => {
    it('no permission at all: no notes when everything works', async () => {
      const { el, settle } = await render();
      await settle();
      expect(el.querySelector('[data-testid="permission-input-monitoring"]')).toBeNull();
      expect(el.querySelector('[data-testid="permission-accessibility"]')).toBeNull();
    });

    it('Input Monitoring missing: explains, opens System Settings, checks again', async () => {
      const hotkey = fakeHotkey({ holdCtrl: 'no-permission', toggleActive: true });
      const { el, settle } = await render(undefined, undefined, hotkey);
      await settle();
      const note = el.querySelector('[data-testid="permission-input-monitoring"]')!;
      expect(note.textContent).toContain('Input Monitoring');
      expect(note.textContent).toContain('toggle shortcut below works');
      expect(el.querySelector('[data-testid="hold-unavailable"]')).toBeNull();
      const [open, check] = Array.from(note.querySelectorAll('button'));
      open!.click();
      await settle();
      expect(hotkey.openPermissionSettings).toHaveBeenCalledWith('input-monitoring');
      check!.click();
      await settle();
      expect(hotkey.recheck).toHaveBeenCalled();
      expect(el.querySelector('[data-testid="permission-input-monitoring"]')).toBeNull();
    });

    it('Accessibility missing: explains the ⌘V fallback and opens its settings', async () => {
      const hotkey = fakeHotkey({ paste: 'no-permission' });
      const { el, settle } = await render(undefined, undefined, hotkey);
      await settle();
      const note = el.querySelector('[data-testid="permission-accessibility"]')!;
      expect(note.textContent).toContain('Accessibility');
      expect(note.textContent).toContain('⌘V');
      (note.querySelector('button') as HTMLButtonElement).click();
      await settle();
      expect(hotkey.openPermissionSettings).toHaveBeenCalledWith('accessibility');
    });

    it('shows an error if System Settings could not be opened', async () => {
      const hotkey = fakeHotkey({ holdCtrl: 'no-permission' });
      hotkey.openPermissionSettings.mockRejectedValue(new Error('Only on macOS.'));
      const { el, settle } = await render(undefined, undefined, hotkey);
      await settle();
      (
        el.querySelector('[data-testid="permission-input-monitoring"] button') as HTMLButtonElement
      ).click();
      await settle();
      expect(el.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    });
  });

  describe('Microphone', () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'default', label: 'Default - Headset' },
      { kind: 'audioinput', deviceId: 'mic-a', label: 'Laptop microphone' },
      { kind: 'audioinput', deviceId: 'mic-b', label: '' },
      { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
    ];
    beforeEach(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: vi.fn().mockResolvedValue(devices),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      });
    });
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    });

    const openSelect = async (el: HTMLElement, id: string, settle: () => Promise<void>) => {
      el.querySelector<HTMLElement>(`[data-testid="${id}"] .mat-mdc-select-trigger`)!.click();
      await settle();
      const panels = document.querySelectorAll<HTMLElement>('.mat-mdc-select-panel');
      return [...panels[panels.length - 1]!.querySelectorAll<HTMLElement>('mat-option')];
    };

    it('lists System default and real microphones (no pseudo devices, no speakers)', async () => {
      const { el, settle } = await render();
      await settle();
      const options = await openSelect(el, 'mic-device', settle);
      expect(options.map((o) => o.textContent!.trim())).toEqual([
        'System default',
        'Laptop microphone',
        'Microphone 2',
      ]);
      options[1]!.click();
      await settle();
    });

    it('saves the chosen device and keep-ready time', async () => {
      const { el, settle, update, status } = await render();
      await settle();
      (await openSelect(el, 'mic-device', settle))[1]!.click();
      await settle();
      expect(update).toHaveBeenCalledWith({ dictation: { micDeviceId: 'mic-a' } });
      const keep = await openSelect(el, 'keep-mic-ready', settle);
      expect(keep.map((o) => o.textContent!.trim())).toEqual([
        'Off',
        '5 seconds',
        '10 seconds',
        '30 seconds',
      ]);
      keep[0]!.click();
      await settle();
      expect(update).toHaveBeenCalledWith({ dictation: { keepMicReadySeconds: 0 } });
      expect(status.state()).toBe('saved');
    });

    it('says when the saved microphone is not connected', async () => {
      const { el, settle } = await render(vi.fn(), undefined, undefined);
      await settle();
      expect(el.querySelector('[data-testid="mic-missing"]')).toBeNull();
      TestBed.resetTestingModule();
      stored.dictation.micDeviceId = 'unplugged';
      try {
        const again = await render();
        await again.settle();
        expect(again.el.querySelector('[data-testid="mic-missing"]')!.textContent).toContain(
          "isn't connected",
        );
      } finally {
        stored.dictation.micDeviceId = '';
      }
    });

    it('explains a blocked microphone in plain words', async () => {
      const { el, settle } = await render(undefined, undefined, undefined, {
        state: 'closed',
        usingDefaultInstead: false,
        problem: 'blocked',
      });
      await settle();
      expect(el.querySelector('[data-testid="mic-problem"]')!.textContent).toContain(
        'Let desktop apps access your microphone',
      );
    });
  });
});
