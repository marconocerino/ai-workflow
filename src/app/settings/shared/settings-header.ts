import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from '../../ui/icon/icon';
import { SaveStatus } from './save-status';

/** Page title, lead text and the save confirmation pill (design: Settings@1x.png). */
@Component({
  selector: 'app-settings-header',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h1>{{ heading() }}</h1>
      <p class="lead aiw-muted">{{ lead() }}</p>
    </div>
    @if (autosave()) {
      <span class="aiw-chip pill" role="status" data-testid="save-status">
        @switch (status.state()) {
          @case ('saving') {
            Saving…
          }
          @case ('saved') {
            <aiw-icon name="check" [size]="14" /> Saved
          }
          @case ('error') {
            <span class="error">Couldn't save — see below</span>
          }
          @default {
            <aiw-icon name="check" [size]="14" /> Changes save automatically
          }
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--aiw-space-5);
      margin-bottom: var(--aiw-space-6);
    }
    h1 {
      margin-bottom: var(--aiw-space-2);
    }
    .lead {
      margin: 0;
    }
    .pill {
      white-space: nowrap;
      padding: 6px 14px;
      background: var(--aiw-color-surface);
      border: 1px solid var(--aiw-color-line-soft);
      color: var(--aiw-color-ink);
    }
    .error {
      color: var(--aiw-color-danger);
    }
  `,
})
export class SettingsHeader {
  protected readonly status = inject(SaveStatus);
  readonly heading = input.required<string>();
  readonly lead = input.required<string>();
  /** False on pages with nothing to save (About, Coming soon). */
  readonly autosave = input(true);
}
