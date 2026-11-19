import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder section (VAI-203). Replaced by the dictations stories. */
@Component({
  selector: 'app-dictations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder">
      <h1>Dictations</h1>
      <section class="aiw-card" aria-label="Dictations">
        <p class="aiw-muted">Your past dictations will show up here.</p>
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
export class Dictations {}
