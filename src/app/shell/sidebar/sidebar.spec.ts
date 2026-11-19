import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { AiWorkflowApi } from '../../../../shared/ipc-contract';
import { AgentStatus } from '../../core/agent-status';
import { AI_WORKFLOW_BRIDGE } from '../../core/electron-api';
import { FeatureFlags } from '../../core/feature-flags';
import { Sidebar } from './sidebar';

@Component({ template: '' })
class Blank {}

async function render(flags: { meetings?: boolean; agents?: boolean } = {}) {
  const bridge = {
    features: {
      get: () =>
        Promise.resolve({
          flags: { meetings: false, agents: false, voiceprints: false, ...flags },
          sources: ['registry' as const],
        }),
    },
  } satisfies Pick<AiWorkflowApi, 'features'>;
  TestBed.configureTestingModule({
    imports: [Sidebar],
    providers: [
      { provide: AI_WORKFLOW_BRIDGE, useValue: bridge },
      provideRouter([
        { path: '', component: Blank },
        { path: 'meetings', component: Blank },
        { path: 'agents', component: Blank },
        { path: 'dictations', component: Blank },
      ]),
    ],
  });
  await TestBed.inject(FeatureFlags).load();
  const fixture = TestBed.createComponent(Sidebar);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const navLabels = () =>
    [...el.querySelectorAll('nav a .label')].map((l) => l.textContent!.trim());
  return { fixture, el, q, navLabels };
}

describe('Sidebar', () => {
  it('default flags: Home and Dictations only, no agent roster, plain dictation hint', async () => {
    const { q, navLabels } = await render();
    expect(navLabels()).toEqual(['Home', 'Dictations']);
    expect(q('agent-roster')).toBeNull();
    expect(q('ctrl-hint')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Hold Ctrl anywhere to dictate',
    );
    expect(q('nav-settings')).not.toBeNull();
    expect(q('company-badge')!.textContent).toContain("Runs on your company's AI servers");
  });

  it('all flags on: all four sections, roster and agent hint', async () => {
    const { q, navLabels, el } = await render({ meetings: true, agents: true });
    expect(navLabels()).toEqual(['Home', 'Meetings', 'Agent chats', 'Dictations']);
    expect(q('ctrl-hint')!.textContent).toContain('dictate or ask an agent');
    const rows = [...el.querySelectorAll('[data-agent]')].map((li) => [
      li.querySelector('.agent-name')!.textContent!.trim(),
      li.querySelector('[data-testid="agent-activity"]')!.textContent!.trim(),
    ]);
    expect(rows).toEqual([
      ['Notetaker', 'Idle'],
      ['Researcher', 'Idle'],
      ['Writer', 'Idle'],
      ['Scheduler', 'Idle'],
    ]);
  });

  it('shows live and working agents and an unread badge from the status service', async () => {
    const { fixture, el } = await render({ agents: true });
    const status = TestBed.inject(AgentStatus);
    status.activity.set({
      notetaker: 'live',
      researcher: 'working',
      writer: 'idle',
      scheduler: 'idle',
    });
    status.unreadChats.set(2);
    await fixture.whenStable();
    const activity = (id: string) =>
      el.querySelector(`[data-agent="${id}"] [data-testid="agent-activity"]`)!;
    expect(activity('notetaker').textContent!.trim()).toBe('Live');
    expect(activity('notetaker').querySelector('.dot')).not.toBeNull();
    expect(activity('researcher').textContent!.trim()).toBe('Working');
    const agentsLink = el.querySelector('[data-testid="nav-agents"]')!;
    expect(agentsLink.textContent!.replace(/\s+/g, ' ')).toContain('2 unread');
  });

  it('unread badge hidden at 0', async () => {
    const { el } = await render({ agents: true });
    expect(el.querySelector<HTMLElement>('[data-testid="nav-agents"] aiw-badge')!.hidden).toBe(
      true,
    );
  });

  it('marks exactly the active section with aria-current', async () => {
    const { fixture, el } = await render({ meetings: true });
    await TestBed.inject(Router).navigateByUrl('/dictations');
    await fixture.whenStable();
    const current = [...el.querySelectorAll('nav a[aria-current="page"]')].map((a) =>
      a.getAttribute('data-testid'),
    );
    expect(current).toEqual(['nav-dictations']);
    expect(el.querySelector('[data-testid="nav-home"]')!.classList).not.toContain('active');
  });
});
