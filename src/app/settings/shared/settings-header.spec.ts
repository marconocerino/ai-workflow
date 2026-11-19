import { TestBed } from '@angular/core/testing';
import { SaveStatus } from './save-status';
import { SettingsHeader } from './settings-header';

async function render(autosave = true) {
  TestBed.configureTestingModule({ imports: [SettingsHeader], providers: [SaveStatus] });
  const fixture = TestBed.createComponent(SettingsHeader);
  fixture.componentRef.setInput('heading', 'Dictation');
  fixture.componentRef.setInput('lead', 'How you start and stop talking.');
  fixture.componentRef.setInput('autosave', autosave);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const pill = () => el.querySelector('[data-testid="save-status"]')?.textContent?.trim() ?? null;
  return { fixture, el, pill, status: TestBed.inject(SaveStatus) };
}

describe('SettingsHeader + SaveStatus', () => {
  it('shows title, lead and "Changes save automatically"', async () => {
    const { el, pill } = await render();
    expect(el.querySelector('h1')!.textContent).toBe('Dictation');
    expect(el.textContent).toContain('How you start and stop talking.');
    expect(pill()).toBe('Changes save automatically');
    expect(el.querySelector('[data-testid="save-status"]')!.getAttribute('role')).toBe('status');
  });

  it('track(): Saving… then Saved', async () => {
    const { fixture, pill, status } = await render();
    let finish!: () => void;
    const saving = status.track(new Promise<void>((r) => (finish = r)));
    await fixture.whenStable();
    expect(pill()).toBe('Saving…');
    finish();
    await saving;
    await fixture.whenStable();
    expect(pill()).toBe('Saved');
  });

  it('track(): a failed save shows the error state and rethrows', async () => {
    const { fixture, pill, status } = await render();
    await expect(status.track(Promise.reject(new Error('disk full')))).rejects.toThrow('disk full');
    await fixture.whenStable();
    expect(pill()).toBe("Couldn't save — see below");
    status.reset();
    await fixture.whenStable();
    expect(pill()).toBe('Changes save automatically');
  });

  it('pages without settings have no pill', async () => {
    const { pill } = await render(false);
    expect(pill()).toBeNull();
  });
});
