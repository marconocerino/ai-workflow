import { TestBed } from '@angular/core/testing';
import type { AiWorkflowApi } from '../../../shared/ipc-contract';
import type { OverlayState } from '../../../shared/overlay';
import { AI_WORKFLOW_BRIDGE } from '../core/electron-api';
import { OverlayPage } from './overlay-page';

async function render(initial: OverlayState) {
  let push: (s: OverlayState) => void = () => undefined;
  const bridge = {
    overlay: {
      getState: vi.fn().mockResolvedValue(initial),
      onState: (l: (s: OverlayState) => void) => (push = l),
    },
  };
  TestBed.configureTestingModule({
    imports: [OverlayPage],
    providers: [{ provide: AI_WORKFLOW_BRIDGE, useValue: bridge as unknown as AiWorkflowApi }],
  });
  const fixture = TestBed.createComponent(OverlayPage);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, push, settle: () => fixture.whenStable() };
}

describe('OverlayPage (VAI-305)', () => {
  afterEach(() => document.documentElement.classList.remove('aiw-overlay'));

  it('transparent page; shows the bar only when main says so', async () => {
    const r = await render({ phase: 'hidden', level: 0, app: null, style: null, hint: null });
    expect(document.documentElement.classList).toContain('aiw-overlay');
    expect(r.el.querySelector('aiw-dictation-bar')).toBeNull();
    r.push({ phase: 'recording', level: 0.5, app: 'Teams', style: 'Casual', hint: null });
    await r.settle();
    expect(r.el.querySelector('aiw-dictation-bar')!.textContent).toContain('Teams · Casual');
    r.push({ phase: 'hidden', level: 0, app: null, style: null, hint: null });
    await r.settle();
    expect(r.el.querySelector('aiw-dictation-bar')).toBeNull();
  });

  it('picks up the current state when it loads mid-dictation', async () => {
    const r = await render({
      phase: 'transcribing',
      level: 0,
      app: 'Word',
      style: null,
      hint: null,
    });
    await r.settle();
    expect(r.el.textContent).toContain('Transcribing…');
  });
});
