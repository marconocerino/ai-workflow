import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { MicStatus } from '../../../shared/audio';
import { AI_WORKFLOW_BRIDGE } from './electron-api';

export interface MicDevice {
  id: string;
  label: string;
}

/** The Windows/Chromium pseudo-devices; we show our own "System default" instead. */
const PSEUDO = new Set(['default', 'communications']);

/**
 * Microphones for Settings (VAI-302). The list updates when a headset is plugged in or out.
 * The capture itself happens in the hidden audio window.
 */
@Injectable({ providedIn: 'root' })
export class MicDevices {
  private readonly bridge = inject(AI_WORKFLOW_BRIDGE);
  readonly devices = signal<MicDevice[]>([]);

  /** Load now and keep updating until `destroyRef` is destroyed. */
  watch(destroyRef: DestroyRef): void {
    const md = globalThis.navigator?.mediaDevices;
    if (!md) return;
    const refresh = () => void this.refresh();
    md.addEventListener('devicechange', refresh);
    destroyRef.onDestroy(() => md.removeEventListener('devicechange', refresh));
    refresh();
  }

  async refresh(): Promise<void> {
    const md = globalThis.navigator?.mediaDevices;
    if (!md) return;
    try {
      const all = await md.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput' && !PSEUDO.has(d.deviceId));
      this.devices.set(
        inputs.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      );
    } catch {
      this.devices.set([]);
    }
  }

  status(): Promise<MicStatus | null> {
    return this.bridge ? this.bridge.audio.status().catch(() => null) : Promise.resolve(null);
  }
}

/** Plain-language explanation of a mic problem, or null. */
export function micProblemText(status: MicStatus | null): string | null {
  switch (status?.problem) {
    case 'blocked':
      return 'Windows is blocking the microphone. Open Windows Settings → Privacy & security → Microphone and turn on “Let desktop apps access your microphone”.';
    case 'no-device':
      return 'No microphone found. Plug one in or check that it’s turned on.';
    case 'failed':
      return 'The microphone couldn’t be started. Try another device below.';
    default:
      return null;
  }
}
