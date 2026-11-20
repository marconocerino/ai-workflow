import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HIDDEN_OVERLAY, type OverlayState } from '../../../shared/overlay';
import { AI_WORKFLOW_BRIDGE } from '../core/electron-api';
import { DictationBar } from '../ui';

/**
 * Page of the overlay window (VAI-305): only the dictation bar on a transparent background.
 * Main pushes the state; the page never sends anything back except asking for it once.
 */
@Component({
  selector: 'app-overlay-page',
  imports: [DictationBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      @if (s.phase !== 'hidden') {
        <aiw-dictation-bar
          [phase]="s.phase"
          [level]="s.level"
          [app]="s.app"
          [appStyle]="s.style"
          [hint]="s.hint"
        />
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--aiw-space-2) var(--aiw-space-4) var(--aiw-space-4) var(--aiw-space-2);
    }
  `,
})
export class OverlayPage {
  protected readonly state = signal<OverlayState>(HIDDEN_OVERLAY);

  constructor() {
    inject(DOCUMENT).documentElement.classList.add('aiw-overlay');
    const bridge = inject(AI_WORKFLOW_BRIDGE);
    if (!bridge) return;
    bridge.overlay.onState((s) => this.state.set(s));
    bridge.overlay
      .getState()
      .then((s) => this.state.set(s))
      .catch(() => undefined);
  }
}
