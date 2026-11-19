import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

/**
 * Settings section whose options arrive with a later story (VAI-204). Title, lead and what's
 * coming come from the route's data (bound to inputs).
 */
@Component({
  selector: 'app-settings-coming-soon',
  imports: [SettingsHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-settings-header [heading]="heading()" [lead]="lead()" [autosave]="false" />
      <section class="aiw-card" [attr.aria-label]="heading()" data-testid="coming-soon">
        <p><strong>Coming soon.</strong> {{ coming() }}</p>
      </section>
    </div>
  `,
  styles: `
    .page {
      max-width: 760px;
      padding: var(--aiw-space-7) var(--aiw-space-7) 64px;
    }
    p {
      margin: 0;
    }
  `,
})
export class ComingSoon {
  readonly heading = input.required<string>();
  readonly lead = input.required<string>();
  readonly coming = input.required<string>();

  constructor() {
    inject(SaveStatus).reset();
  }
}
