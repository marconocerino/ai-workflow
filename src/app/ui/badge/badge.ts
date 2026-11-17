import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Count bubble, e.g. unread agent chats. Hidden when the count is 0.
 *
 *   <aiw-badge [count]="2" label="unread" />   → screen readers: "2 unread"
 */
@Component({
  selector: 'aiw-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[hidden]': 'count() <= 0' },
  template: `<span aria-hidden="true">{{ shown() }}</span
    ><span class="aiw-sr-only">{{ count() }} {{ label() }}</span>`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: var(--aiw-radius-pill);
      background: var(--aiw-color-primary);
      color: var(--aiw-color-on-primary);
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }
    :host([hidden]) {
      display: none;
    }
  `,
})
export class Badge {
  readonly count = input.required<number>();
  readonly label = input('new');
  protected readonly shown = computed(() => (this.count() > 99 ? '99+' : String(this.count())));
}
