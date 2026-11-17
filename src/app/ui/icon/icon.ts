import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS, type IconName } from './icons';

/**
 * Lucide icon as inline SVG (no icon font — nothing is loaded from the internet).
 * Decorative by default (hidden from screen readers). Give `label` when the icon carries
 * meaning on its own; icon-only buttons put the label on the button instead.
 *
 *   <aiw-icon name="mic" />
 *   <aiw-icon name="lock" label="Encrypted" />
 */
@Component({
  selector: 'aiw-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @for (shape of shapes(); track $index) {
        @switch (shape[0]) {
          @case ('path') {
            <svg:path [attr.d]="$any(shape[1]).d" />
          }
          @case ('circle') {
            <svg:circle
              [attr.cx]="$any(shape[1]).cx"
              [attr.cy]="$any(shape[1]).cy"
              [attr.r]="$any(shape[1]).r"
            />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="$any(shape[1]).x"
              [attr.y]="$any(shape[1]).y"
              [attr.width]="$any(shape[1]).width"
              [attr.height]="$any(shape[1]).height"
              [attr.rx]="$any(shape[1]).rx"
              [attr.ry]="$any(shape[1]).ry"
            />
          }
          @case ('line') {
            <svg:line
              [attr.x1]="$any(shape[1]).x1"
              [attr.y1]="$any(shape[1]).y1"
              [attr.x2]="$any(shape[1]).x2"
              [attr.y2]="$any(shape[1]).y2"
            />
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      vertical-align: middle;
    }
    svg {
      display: block;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly strokeWidth = input(2);
  /** Accessible name. Leave empty for decorative icons. */
  readonly label = input<string | null>(null);

  protected readonly shapes = computed(() => ICONS[this.name()]);
}
