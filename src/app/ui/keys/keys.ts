import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Keyboard key caps. Screen readers hear "Ctrl plus Shift plus Space".
 *
 *   <aiw-keys keys="Ctrl" />
 *   <aiw-keys [keys]="['Ctrl', 'Shift', 'Space']" />
 */
@Component({
  selector: 'aiw-keys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="caps" aria-hidden="true">
      @for (key of list(); track $index) {
        <kbd class="aiw-kbd" [class.large]="size() === 'lg'">{{ key }}</kbd>
      }
    </span>
    <span class="aiw-sr-only">{{ spoken() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: baseline;
    }
    .caps {
      display: inline-flex;
      gap: var(--aiw-space-1);
    }
    .large {
      padding: 6px 14px;
      font-size: 16px;
      border-bottom-width: 4px;
      border-radius: var(--aiw-radius-md);
    }
  `,
})
export class Keys {
  readonly keys = input.required<string | readonly string[]>();
  readonly size = input<'md' | 'lg'>('md');

  protected readonly list = computed(() => {
    const k = this.keys();
    return typeof k === 'string' ? [k] : k;
  });
  protected readonly spoken = computed(() => this.list().join(' plus '));
}
