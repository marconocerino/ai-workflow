import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder section (VAI-203). Replaced by the agents stories. */
@Component({
  selector: 'app-agents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="placeholder">
      <h1>Agent chats</h1>
      <section class="aiw-card" aria-label="Agent chats">
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
export class Agents {}
