import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Card with the design's border and offset shadow. On <a> or <button> it is clickable
 * (hover lifts it, focus ring, disabled).
 *
 *   <aiw-card heading="Summary">…<div card-actions>…</div></aiw-card>
 *   <aiw-card padding="none">list with its own dividers</aiw-card>
 *   <a aiw-card routerLink="/meetings/1">Design sync — 11:00</a>
 */
@Component({
  selector: 'aiw-card, a[aiw-card], button[aiw-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.pad-none]': 'padding() === "none"',
    '[class.pad-compact]': 'padding() === "compact"',
  },
  template: `
    @if (heading()) {
      <header class="head">
        <h2 class="heading">{{ heading() }}</h2>
        <ng-content select="[card-header]" />
      </header>
    }
    <ng-content />
    <div class="actions"><ng-content select="[card-actions]" /></div>
  `,
  styleUrl: './card.scss',
})
export class Card {
  readonly heading = input<string | null>(null);
  readonly padding = input<'default' | 'compact' | 'none'>('default');
}
