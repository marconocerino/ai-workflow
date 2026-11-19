import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Logo + "AI Workflow" + a subtitle ("Workspace", "Settings"). Shared by both sidebars. */
@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="logo" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
      </svg>
    </span>
    <div>
      <div class="name">AI Workflow</div>
      <div class="sub">{{ subtitle() }}</div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px;
    }
    .logo {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--aiw-radius-md);
      background: var(--aiw-color-primary);
      color: var(--aiw-color-on-primary);
    }
    .name {
      font-weight: 700;
      font-size: 16px;
    }
    .sub {
      font-size: 13px;
      color: var(--aiw-color-ink-muted);
    }
  `,
})
export class Brand {
  readonly subtitle = input.required<string>();
}
