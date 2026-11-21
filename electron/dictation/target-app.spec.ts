import { describe, expect, it } from 'vitest';
import { DictationStatus } from '../tray/dictation-status';
import { TargetApp } from './target-app';

describe('TargetApp (VAI-308)', () => {
  it('asks once when recording starts; keeps the answer for that dictation', async () => {
    const status = new DictationStatus();
    const answers = ['Outlook', 'Teams'];
    let calls = 0;
    const target = new TargetApp(status, async () => answers[calls++] ?? null);
    expect(await target.current()).toBeNull(); // nothing yet
    status.set('recording');
    status.set('idle');
    status.set('transcribing'); // no new lookup
    expect(await target.current()).toBe('Outlook');
    expect(calls).toBe(1);
    status.set('recording');
    expect(await target.current()).toBe('Teams');
  });

  it('no lookup, or a failing one: null', async () => {
    const status = new DictationStatus();
    const none = new TargetApp(status, null);
    const failing = new TargetApp(status, () => Promise.reject(new Error('x')));
    status.set('recording');
    expect(await none.current()).toBeNull();
    expect(await failing.current()).toBeNull();
  });
});
