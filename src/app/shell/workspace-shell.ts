import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './sidebar/sidebar';

/** Workspace layout: sidebar + the current section (VAI-203). Settings has its own layout. */
@Component({
  selector: 'app-workspace-shell',
  imports: [RouterOutlet, Sidebar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar />
    <main class="content aiw-dotted" data-testid="workspace-content">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 248px 1fr;
      height: 100%;
    }
    .content {
      overflow: auto;
    }
  `,
})
export class WorkspaceShell {}
