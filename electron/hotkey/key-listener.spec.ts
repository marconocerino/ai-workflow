import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../logging/logger';
import { KeyListener } from './key-listener';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stdin: PassThrough;
    kill: () => void;
  };
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = vi.fn();
  return child;
}

afterEach(() => vi.useRealTimers());

function setup(spawnImpl?: () => ChildProcess) {
  const children: ReturnType<typeof fakeChild>[] = [];
  const events: string[] = [];
  const availability: boolean[] = [];
  const lines: string[] = [];
  let clock = 0;
  const listener = new KeyListener({
    spawn:
      spawnImpl ??
      (() => {
        const c = fakeChild();
        children.push(c);
        return c as unknown as ChildProcess;
      }),
    onEvent: (e) => events.push(e),
    onAvailability: (ok) => availability.push(ok),
    logger: new Logger({ sink: (l) => lines.push(l) }).scope('hotkey'),
    now: () => clock,
    restartDelayMs: 10,
  });
  const write = async (c: ReturnType<typeof fakeChild>, text: string) => {
    c.stdout.write(text);
    await new Promise((r) => setImmediate(r));
  };
  return {
    listener,
    children,
    events,
    availability,
    lines,
    write,
    tick: (ms: number) => (clock += ms),
  };
}

describe('KeyListener', () => {
  it('becomes available on READY and forwards events (split across chunks)', async () => {
    const { listener, children, events, availability, write } = setup();
    listener.start();
    await write(children[0]!, 'READY\nCTRL_DOWN cl');
    await write(children[0]!, 'ean\nOTHER\ngarbage\nCTRL_UP\n');
    expect(availability).toEqual([true]);
    expect(events).toEqual(['CTRL_DOWN_CLEAN', 'OTHER', 'CTRL_UP']);
  });

  it('restarts after a crash, then gives up after 3 restarts in a minute', async () => {
    vi.useFakeTimers();
    const { listener, children, availability, lines } = setup();
    listener.start();
    for (let i = 0; i < 4; i++) {
      children[i]!.stdout.write('READY\n');
      await vi.advanceTimersByTimeAsync(0);
      children[i]!.emit('exit', 1);
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(children).toHaveLength(4);
    expect(availability.at(-1)).toBe(false);
    expect(lines.join('\n')).toContain('keeps failing; using the toggle shortcut instead');
    expect(listener.isAvailable).toBe(false);
  });

  it('a missing helper (spawn throws) ends as unavailable', async () => {
    vi.useFakeTimers();
    const { listener, availability, lines } = setup(() => {
      throw Object.assign(new Error('ENOENT'), { name: 'Error' });
    });
    listener.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(availability).toEqual([]); // never became available
    expect(lines.join('\n')).toContain('keeps failing');
  });

  it('stop() closes stdin so the helper exits, and does not restart it', async () => {
    vi.useFakeTimers();
    const { listener, children } = setup();
    listener.start();
    const ended = vi.fn();
    children[0]!.stdin.on('finish', ended);
    listener.stop();
    children[0]!.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(ended).toHaveBeenCalled();
    expect(children[0]!.kill).toHaveBeenCalled();
    expect(children).toHaveLength(1);
  });

  it('never logs key events', async () => {
    const { listener, children, write, lines } = setup();
    listener.start();
    await write(children[0]!, 'READY\nCTRL_DOWN clean\nOTHER\nCTRL_UP\n');
    expect(lines.join('\n')).not.toMatch(/CTRL|OTHER/);
  });

  it('NO_PERMISSION (macOS): not retried, start() does nothing until recheck()', async () => {
    vi.useFakeTimers();
    const { listener, children, availability, lines } = setup();
    listener.start();
    children[0]!.stdout.write('NO_PERMISSION\n');
    await vi.advanceTimersByTimeAsync(0);
    children[0]!.emit('exit', 0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(children).toHaveLength(1); // no restart loop (each start would re-prompt)
    expect(listener.needsPermission).toBe(true);
    expect(availability).toEqual([false]); // status refresh
    expect(lines.join('\n')).toContain('needs Input Monitoring permission');

    listener.start(); // e.g. settings saved → apply()
    expect(children).toHaveLength(1);

    listener.recheck(); // user granted it and clicked "Check again"
    expect(children).toHaveLength(2);
    expect(listener.needsPermission).toBe(false);
    children[1]!.stdout.write('READY\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(listener.isAvailable).toBe(true);
  });
});
