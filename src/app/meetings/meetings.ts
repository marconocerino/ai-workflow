import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder section (VAI-203). Replaced by the meetings stories. */
@Component({
  selector: 'app-meetings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder">
      <h1>Meetings</h1>
      <section class="aiw-card" aria-label="Meetings">
        <p class="aiw-muted">Coming soon. This area is switched on for your pilot group.</p>
      </section>
    </div>
  `,
  styles: `
    .placeholder {
      max-width: 760px;
      padding: var(--aiw-space-7);
    }
    h1 {
      margin-bottom: var(--aiw-space-5);
    }
    p {
      margin: 0;
    }
  `,
})
export class Meetings {}
