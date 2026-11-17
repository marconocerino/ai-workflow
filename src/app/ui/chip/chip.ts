import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

export type ChipTone =
  'neutral' | 'success' | 'danger' | 'notetaker' | 'researcher' | 'writer' | 'scheduler';

/**
 * Small label: status ("Draft ready"), tag ("Recorded by Notetaker"), topic with a timestamp,
 * or @mention. On a <button> or <a> it becomes interactive (hover, focus, disabled).
 *
 *   <aiw-chip tone="writer">Draft ready</aiw-chip>
 *   <aiw-chip tone="success" dot>Live</aiw-chip>
 *   <button aiw-chip variant="outline" time="00:02" (click)="seek(2)">Cleanup levels</button>
 */
@Component({
  // Element for static chips, attribute for interactive ones (keeps native button/link a11y).
  selector: 'aiw-chip, button[aiw-chip], a[aiw-chip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'aiw-chip-host',
    '[class]': '"tone-" + tone() + " variant-" + variant()',
  },
  template: `
    @if (dot()) {
      <span class="dot" aria-hidden="true"></span>
    }
    @if (time()) {
      <span class="time">{{ time() }}</span>
    }
    <ng-content />
  `,
  styleUrl: './chip.scss',
})
export class Chip {
  readonly tone = input<ChipTone>('neutral');
  /** soft: tinted background (status). outline: bordered (topics, mentions). */
  readonly variant = input<'soft' | 'outline'>('soft');
  /** Small dot before the text, e.g. "● Live". */
  readonly dot = input(false, { transform: booleanAttribute });
  /** Monospace timestamp before the text, e.g. "01:15". */
  readonly time = input<string | null>(null);
}
