import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Chip } from '../chip/chip';
import { Icon } from '../icon/icon';

/** Relative height of each meter bar, so a steady sound still looks like a voice. */
const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55];

/**
 * The floating dictation bar (VAI-305, design: Dictation overlay@1x.png). Shown in the overlay
 * window while recording and transcribing; also on /gallery.
 *
 *   <aiw-dictation-bar phase="recording" [level]="0.6" app="Outlook" appStyle="Professional" />
 */
@Component({
  selector: 'aiw-dictation-bar',
  imports: [Chip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"phase-" + phase()' },
  template: `
    <div class="bar" role="status" aria-live="polite">
      <span class="mic" aria-hidden="true">
        <aiw-icon [name]="phase() === 'recording' ? 'mic' : 'loader'" [size]="18" />
      </span>
      @if (phase() === 'recording') {
        <span class="meter" aria-hidden="true" data-testid="level" [attr.data-level]="levelText()">
          @for (h of bars(); track $index) {
            <span class="meter-bar" [style.transform]="'scaleY(' + h + ')'"></span>
          }
        </span>
      }
      <span class="label">{{ phase() === 'recording' ? 'Listening…' : 'Transcribing…' }}</span>
      @if (hint() && phase() === 'recording') {
        <span class="hint">{{ hint() }}</span>
      }
      @if (app(); as name) {
        <aiw-chip class="app" data-testid="target-app"
          >{{ name }}{{ appStyle() ? ' · ' + appStyle() : '' }}</aiw-chip
        >
      }
    </div>
  `,
  styleUrl: './dictation-bar.scss',
})
export class DictationBar {
  readonly phase = input<'recording' | 'transcribing'>('recording');
  /** Loudness 0..1 (from the audio window, never the audio itself). */
  readonly level = input(0);
  /** The app the text will go to, e.g. "Outlook". */
  readonly app = input<string | null>(null);
  /** Cleanup style for the app, e.g. "Professional" (VAI-308); shown after the app name. */
  readonly appStyle = input<string | null>(null);
  /** Small hint, e.g. "Esc to cancel" in toggle mode. */
  readonly hint = input<string | null>(null);

  protected readonly bars = computed(() => {
    const level = Math.min(1, Math.max(0, this.level()));
    return BAR_WEIGHTS.map((w) => Math.max(0.15, level * w).toFixed(2));
  });
  protected readonly levelText = computed(() => this.level().toFixed(2));
}
