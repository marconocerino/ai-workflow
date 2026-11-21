import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DictationBar } from './dictation-bar';

@Component({
  imports: [DictationBar],
  template: `<aiw-dictation-bar
    [phase]="phase()"
    [level]="level()"
    [app]="app()"
    [appStyle]="appStyle()"
    [hint]="hint()"
  />`,
})
class Host {
  readonly phase = signal<'recording' | 'transcribing'>('recording');
  readonly level = signal(0);
  readonly app = signal<string | null>(null);
  readonly appStyle = signal<string | null>(null);
  readonly hint = signal<string | null>(null);
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const settle = () => fixture.whenStable();
  return { host: fixture.componentInstance, el, settle };
}

describe('DictationBar (VAI-305)', () => {
  it('recording: "Listening…", a status for screen readers, meter follows the level', async () => {
    const { host, el, settle } = await render();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Listening…');
    const bars = () =>
      Array.from(el.querySelectorAll<HTMLElement>('.meter-bar')).map((b) => b.style.transform);
    expect(bars()).toHaveLength(5);
    expect(bars().every((t) => t === 'scaleY(0.15)')).toBe(true); // silent: minimum height
    host.level.set(1);
    await settle();
    expect(bars()[2]).toBe('scaleY(1.00)');
    expect(el.querySelector('[data-testid="level"]')!.getAttribute('data-level')).toBe('1.00');
    expect(el.querySelector('.meter')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the target app and the hint while recording', async () => {
    const { host, el, settle } = await render();
    expect(el.querySelector('[data-testid="target-app"]')).toBeNull();
    host.app.set('Outlook');
    host.hint.set('Esc to cancel');
    await settle();
    expect(el.querySelector('[data-testid="target-app"]')!.textContent!.trim()).toBe('Outlook');
    expect(el.textContent).toContain('Esc to cancel');
    host.appStyle.set('Professional');
    await settle();
    expect(el.querySelector('[data-testid="target-app"]')!.textContent!.trim()).toBe(
      'Outlook · Professional',
    );
  });

  it('transcribing: no meter, no hint, says "Transcribing…"', async () => {
    const { host, el, settle } = await render();
    host.hint.set('Esc to cancel');
    host.phase.set('transcribing');
    await settle();
    expect(el.querySelector('.meter')).toBeNull();
    expect(el.textContent).toContain('Transcribing…');
    expect(el.textContent).not.toContain('Esc to cancel');
    expect(el.querySelector('aiw-dictation-bar')!.classList).toContain('phase-transcribing');
  });
});
