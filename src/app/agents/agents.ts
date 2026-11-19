import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

/** Placeholder behind the `agents` feature flag (VAI-109). Replaced by the agents stories. */
@Component({
  selector: 'app-agents',
  imports: [MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="placeholder aiw-dotted">
      <section class="aiw-card" aria-labelledby="agents-heading">
        <h1 id="agents-heading">Agents</h1>
        <p class="aiw-muted">Coming soon. This area is switched on for your pilot group.</p>
        <a mat-stroked-button routerLink="/">Back to home</a>
      </section>
    </main>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .placeholder {
      min-height: 100%;
      padding: var(--aiw-space-7) var(--aiw-space-6);
    }
    .aiw-card {
      max-width: 560px;
      margin: 0 auto;
    }
  `,
})
export class Agents {}
