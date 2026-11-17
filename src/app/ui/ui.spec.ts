import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AgentId } from '../../../shared/agents';
import { AgentAvatar, Badge, Card, Chip, Icon, Keys } from '.';
import { ICONS } from './icon/icons';

@Component({
  imports: [AgentAvatar, Badge, Card, Chip, Icon, Keys],
  template: `
    <aiw-icon id="deco" name="mic" />
    <aiw-icon id="labelled" name="lock" label="Encrypted" [size]="24" />
    <aiw-keys id="one" keys="Ctrl" />
    <aiw-keys id="combo" [keys]="['Ctrl', 'Shift', 'Space']" />
    <aiw-agent-avatar id="avatar" [agent]="agent()" />
    <aiw-agent-avatar id="deco-avatar" agent="writer" decorative />
    <aiw-badge id="badge" [count]="count()" label="unread" />
    <aiw-chip id="static" tone="writer">Draft ready</aiw-chip>
    <aiw-chip id="live" tone="success" dot>Live</aiw-chip>
    <button
      id="topic"
      aiw-chip
      variant="outline"
      time="00:02"
      type="button"
      (click)="clicked = clicked + 1"
    >
      Cleanup levels
    </button>
    <button id="topic-off" aiw-chip type="button" disabled>Off</button>
    <aiw-card id="card" heading="Summary"
      ><p>Body</p>
      <div card-actions><button type="button">Go</button></div></aiw-card
    >
    <aiw-card id="plain">No heading</aiw-card>
    <button id="card-btn" aiw-card type="button">Clickable</button>
  `,
})
class Host {
  readonly agent = signal<AgentId>('researcher');
  readonly count = signal(2);
  clicked = 0;
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  return { fixture, el, q };
}

describe('UI kit', () => {
  it('icons: decorative ones are hidden, labelled ones are images', async () => {
    const { q } = await render();
    expect(q('#deco').getAttribute('aria-hidden')).toBe('true');
    expect(q('#deco').getAttribute('role')).toBeNull();
    expect(q('#labelled').getAttribute('role')).toBe('img');
    expect(q('#labelled').getAttribute('aria-label')).toBe('Encrypted');
    expect(q('#labelled svg').getAttribute('width')).toBe('24');
    expect(q('#deco svg').querySelectorAll('path, rect').length).toBe(ICONS.mic.length);
  });

  it('every icon has at least one shape', () => {
    for (const [name, shapes] of Object.entries(ICONS)) {
      expect(shapes.length, name).toBeGreaterThan(0);
    }
  });

  it('keys: show caps, read as "Ctrl plus Shift plus Space"', async () => {
    const { q } = await render();
    expect([...q('#combo').querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'Ctrl',
      'Shift',
      'Space',
    ]);
    expect(q('#combo .aiw-sr-only').textContent).toBe('Ctrl plus Shift plus Space');
    expect(q('#combo .caps').getAttribute('aria-hidden')).toBe('true');
    expect(q('#one .aiw-sr-only').textContent).toBe('Ctrl');
  });

  it('agent avatar: letter, colours and accessible name', async () => {
    const { q, fixture } = await render();
    const avatar = q('#avatar');
    expect(avatar.textContent!.trim()).toBe('R');
    expect(avatar.getAttribute('role')).toBe('img');
    expect(avatar.getAttribute('aria-label')).toBe('Researcher');
    expect(avatar.style.getPropertyValue('--avatar-fg')).toBe('var(--aiw-color-agent-researcher)');
    fixture.componentInstance.agent.set('scheduler');
    fixture.detectChanges();
    expect(avatar.textContent!.trim()).toBe('S');
    expect(q('#deco-avatar').getAttribute('aria-hidden')).toBe('true');
    expect(q('#deco-avatar').getAttribute('role')).toBeNull();
  });

  it('badge: count for eyes, "2 unread" for screen readers, hidden at 0', async () => {
    const { q, fixture } = await render();
    expect(q('#badge').textContent).toContain('2 unread');
    expect(q('#badge').hidden).toBe(false);
    fixture.componentInstance.count.set(150);
    fixture.detectChanges();
    expect(q('#badge span[aria-hidden]').textContent).toBe('99+');
    fixture.componentInstance.count.set(0);
    fixture.detectChanges();
    expect(q('#badge').hidden).toBe(true);
  });

  it('chips: tone/variant classes, dot, timestamp; buttons stay native buttons', async () => {
    const { q, fixture } = await render();
    expect(q('#static').className).toContain('tone-writer');
    expect(q('#static').className).toContain('variant-soft');
    expect(q('#live .dot')).not.toBeNull();
    expect(q('#live .dot').getAttribute('aria-hidden')).toBe('true');
    const topic = q('#topic') as HTMLButtonElement;
    expect(topic.tagName).toBe('BUTTON');
    expect(topic.className).toContain('variant-outline');
    expect(topic.querySelector('.time')!.textContent).toBe('00:02');
    topic.click();
    expect(fixture.componentInstance.clicked).toBe(1);
    expect((q('#topic-off') as HTMLButtonElement).disabled).toBe(true);
  });

  it('cards: heading, projected actions, clickable variant', async () => {
    const { q } = await render();
    expect(q('#card h2').textContent).toBe('Summary');
    expect(q('#card .actions button').textContent).toBe('Go');
    expect(q('#plain h2')).toBeNull();
    expect(q('#card-btn').tagName).toBe('BUTTON');
  });
});
