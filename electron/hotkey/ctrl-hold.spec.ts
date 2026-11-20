import { describe, expect, it } from 'vitest';
import { CtrlHold, HOLD_MS, type KeyEvent, parseKeyEvent, type Timers } from './ctrl-hold';

/** Manual clock: run(ms) fires due timers. */
function fakeTimers() {
  let now = 0;
  let next = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = ++next;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => pending.delete(id as number),
  };
  const run = (ms: number) => {
    now += ms;
    for (const [id, t] of [...pending]) {
      if (t.at <= now) {
        pending.delete(id);
        t.fn();
      }
    }
  };
  return { timers, run };
}

function setup() {
  const log: string[] = [];
  const { timers, run } = fakeTimers();
  const hold = new CtrlHold(
    {
      start: () => log.push('start'),
      stop: () => log.push('stop'),
      cancel: () => log.push('cancel'),
      prepare: () => log.push('prepare'),
      abandon: () => log.push('abandon'),
    },
    timers,
  );
  const send = (...events: KeyEvent[]) => events.forEach((e) => hold.handle(e));
  return { hold, log, run, send };
}

describe('CtrlHold', () => {
  it('Ctrl alone held for 120 ms starts; release stops', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_CLEAN');
    run(HOLD_MS - 1);
    expect(log).toEqual(['prepare']);
    run(1);
    expect(log).toEqual(['prepare', 'start']);
    send('CTRL_UP');
    expect(log).toEqual(['prepare', 'start', 'stop']);
  });

  it('a quick Ctrl tap does nothing', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_CLEAN');
    run(80);
    send('CTRL_UP');
    run(500);
    expect(log).toEqual(['prepare', 'abandon']); // mic opened early, closed again
  });

  it('Ctrl+C (other key within 120 ms) is never treated as dictation', () => {
    const { log, run, send, hold } = setup();
    send('CTRL_DOWN_CLEAN');
    run(40);
    send('OTHER'); // C
    run(1000); // still holding Ctrl
    send('OTHER', 'CTRL_UP');
    expect(log).toEqual(['prepare', 'abandon']);
    expect(hold.current).toBe('idle');
  });

  it('Ctrl+click or Ctrl+scroll within 120 ms does nothing', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_CLEAN');
    run(10);
    send('OTHER'); // wheel
    run(300);
    send('CTRL_UP');
    expect(log).toEqual(['prepare', 'abandon']);
  });

  it('a slow shortcut (other key after 120 ms) cancels the recording', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_CLEAN');
    run(400);
    send('OTHER');
    send('CTRL_UP');
    expect(log).toEqual(['prepare', 'start', 'cancel']);
  });

  it('Ctrl pressed while another key is held (e.g. Shift+Ctrl) never starts', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_DIRTY');
    run(1000);
    send('CTRL_UP');
    expect(log).toEqual([]);
  });

  it('next press works normally after a blocked one', () => {
    const { log, run, send } = setup();
    send('CTRL_DOWN_CLEAN', 'OTHER', 'CTRL_UP', 'CTRL_DOWN_CLEAN');
    run(HOLD_MS);
    send('CTRL_UP');
    expect(log).toEqual(['prepare', 'abandon', 'prepare', 'start', 'stop']);
  });

  it('reset() (watcher stopped) cancels a recording in progress', () => {
    const { hold, log, run, send } = setup();
    send('CTRL_DOWN_CLEAN');
    run(HOLD_MS);
    hold.reset();
    expect(log).toEqual(['prepare', 'start', 'cancel']);
    expect(hold.current).toBe('idle');
  });

  it('parses watcher lines; ignores anything else', () => {
    expect(parseKeyEvent('READY')).toBe('READY');
    expect(parseKeyEvent('CTRL_DOWN clean\r')).toBe('CTRL_DOWN_CLEAN');
    expect(parseKeyEvent('CTRL_DOWN dirty')).toBe('CTRL_DOWN_DIRTY');
    expect(parseKeyEvent('CTRL_UP')).toBe('CTRL_UP');
    expect(parseKeyEvent('OTHER')).toBe('OTHER');
    expect(parseKeyEvent('KEY 65')).toBeNull();
  });
});
