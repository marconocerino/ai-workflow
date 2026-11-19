import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AGENTS } from '../../../../shared/agents';
import type { Feature } from '../../../../shared/features';
import { type AgentActivity, AgentStatus } from '../../core/agent-status';
import { FeatureFlags } from '../../core/feature-flags';
import { AgentAvatar, Badge, Icon, type IconName } from '../../ui';
import { Brand } from '../brand/brand';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  testId: string;
  feature?: Feature;
}

const NAV: readonly NavItem[] = [
  { path: '/', label: 'Home', icon: 'home', testId: 'nav-home' },
  {
    path: '/meetings',
    label: 'Meetings',
    icon: 'video',
    testId: 'nav-meetings',
    feature: 'meetings',
  },
  { path: '/agents', label: 'Agent chats', icon: 'chat', testId: 'nav-agents', feature: 'agents' },
  { path: '/dictations', label: 'Dictations', icon: 'waveform', testId: 'nav-dictations' },
];

const ACTIVITY_LABEL: Record<AgentActivity, string> = {
  live: 'Live',
  working: 'Working',
  idle: 'Idle',
};

/** Workspace sidebar (VAI-203, design/Sidebar component@1x.png). */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Brand, Icon, Badge, AgentAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly features = inject(FeatureFlags);
  private readonly status = inject(AgentStatus);

  protected readonly agentsOn = computed(() => this.features.enabled('agents'));
  protected readonly nav = computed(() =>
    NAV.filter((item) => !item.feature || this.features.enabled(item.feature)),
  );
  protected readonly unread = this.status.unreadChats;
  protected readonly roster = computed(() => {
    const activity = this.status.activity();
    return AGENTS.map((a) => ({
      ...a,
      activity: activity[a.id],
      label: ACTIVITY_LABEL[activity[a.id]],
    }));
  });
}
