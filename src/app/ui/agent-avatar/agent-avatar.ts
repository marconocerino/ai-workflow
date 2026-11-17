import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { type AgentId, agentById } from '../../../../shared/agents';

/**
 * Letter avatar for an agent, in the agent's colours. Announced as the agent's name.
 *
 *   <aiw-agent-avatar agent="researcher" />
 *   <aiw-agent-avatar agent="writer" size="lg" decorative />   (when the name is shown next to it)
 */
@Component({
  selector: 'aiw-agent-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"size-" + size()',
    '[style.--avatar-fg]': '"var(--aiw-color-agent-" + agent() + ")"',
    '[style.--avatar-bg]': '"var(--aiw-color-agent-" + agent() + "-soft)"',
    '[attr.role]': 'decorative() ? null : "img"',
    '[attr.aria-label]': 'decorative() ? null : info().name',
    '[attr.aria-hidden]': 'decorative() ? "true" : null',
    '[attr.title]': 'info().name',
  },
  template: `{{ info().letter }}`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      background: var(--avatar-bg);
      color: var(--avatar-fg);
      font-family: var(--aiw-font-text);
      font-weight: 700;
      line-height: 1;
      user-select: none;
    }
    :host(.size-sm) {
      width: 22px;
      height: 22px;
      font-size: 12px;
      border-radius: var(--aiw-radius-sm);
    }
    :host(.size-md) {
      width: 28px;
      height: 28px;
      font-size: 14px;
      border-radius: var(--aiw-radius-sm);
    }
    :host(.size-lg) {
      width: 36px;
      height: 36px;
      font-size: 16px;
      border-radius: var(--aiw-radius-md);
    }
  `,
})
export class AgentAvatar {
  readonly agent = input.required<AgentId>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Set when the agent's name is already shown as text next to the avatar. */
  readonly decorative = input(false, { transform: booleanAttribute });

  protected readonly info = computed(() => agentById(this.agent()));
}
