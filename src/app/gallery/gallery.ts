import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { AGENTS } from '../../../shared/agents';
import { AgentAvatar, Badge, Card, Chip, DictationBar, Icon, type IconName, Keys } from '../ui';
import { ICONS } from '../ui/icon/icons';

/** Every core component in every state (VAI-202). Reachable at /gallery. */
@Component({
  selector: 'app-gallery',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    AgentAvatar,
    Badge,
    Card,
    Chip,
    Icon,
    Keys,
    DictationBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gallery.html',
  styleUrl: './gallery.scss',
})
export class Gallery {
  protected readonly agents = AGENTS;
  protected readonly iconNames = Object.keys(ICONS) as IconName[];
  protected readonly clicks = signal(0);

  protected readonly name = new FormControl('');
  protected readonly url = new FormControl('ftp://wrong', {
    validators: [Validators.pattern(/^https?:\/\//)],
  });
  protected readonly disabledInput = new FormControl({ value: 'Read only value', disabled: true });
  protected readonly notes = new FormControl('');
  protected readonly device = new FormControl('default');
  protected readonly disabledSelect = new FormControl({ value: 'default', disabled: true });
  protected readonly mode = new FormControl('hold');

  constructor() {
    this.url.markAsTouched();
  }

  protected click(): void {
    this.clicks.update((n) => n + 1);
  }

  /** Code samples shown under each section (interpolated, so < > are escaped). */
  protected readonly code = {
    buttons:
      '<button mat-flat-button>Approve and send</button>  <button mat-stroked-button>Other times</button>  <button mat-button>Cancel</button>  <button mat-flat-button class="aiw-danger">Delete</button>  <button mat-icon-button aria-label="Send"><aiw-icon name="send" /></button>',
    inputs:
      '<mat-form-field appearance="outline"><mat-label>Name</mat-label><input matInput [formControl]="name" /></mat-form-field>',
    toggles:
      '<mat-slide-toggle hideIcon>Open AI Workflow when I sign in</mat-slide-toggle>  <mat-checkbox>Send a follow-up</mat-checkbox>',
    options:
      '<mat-radio-group class="aiw-option-cards"><mat-radio-button class="aiw-option-card" value="hold"><span class="aiw-option-title">Hold Ctrl</span><span class="aiw-option-desc">…</span></mat-radio-button></mat-radio-group>',
    cards:
      '<aiw-card heading="Summary">…<div card-actions>…</div></aiw-card>  <a aiw-card routerLink="…">Clickable</a>',
    chips:
      '<aiw-chip tone="writer">Draft ready</aiw-chip>  <aiw-chip tone="success" dot>Live</aiw-chip>  <button aiw-chip variant="outline" time="00:02">Cleanup levels</button>',
    keys: "<aiw-keys keys=\"Ctrl\" />  <aiw-keys [keys]=\"['Ctrl', 'Shift', 'Space']\" />",
    avatars:
      '<aiw-agent-avatar agent="researcher" />  <aiw-agent-avatar agent="writer" size="lg" decorative />',
    badge: '<aiw-badge [count]="2" label="unread" />',
    icons: '<aiw-icon name="mic" />  <aiw-icon name="lock" label="Encrypted" />',
    labels: '<h3 class="aiw-section-label">Shortcut</h3>',
    dictationBar:
      '<aiw-dictation-bar phase="recording" [level]="0.6" app="Outlook" hint="Esc to cancel" />  <aiw-dictation-bar phase="transcribing" app="Outlook" />',
  };
}
