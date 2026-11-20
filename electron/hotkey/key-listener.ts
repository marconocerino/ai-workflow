import type { ChildProcess } from 'node:child_process';
import type { ScopedLogger } from '../logging/logger';
import { type KeyEvent, parseKeyEvent } from './ctrl-hold';

export type SpawnFn = () => ChildProcess;

export interface KeyListenerOptions {
  spawn: SpawnFn;
  onEvent(event: KeyEvent): void;
  /** Ready (hooks installed) or unavailable (gave up after repeated failures). */
  onAvailability(available: boolean): void;
  logger?: ScopedLogger;
  now?: () => number;
  /** Restarts allowed within `windowMs` before giving up. */
  maxRestarts?: number;
  windowMs?: number;
  restartDelayMs?: number;
}

/**
 * Runs and supervises the Ctrl watcher process (VAI-301). Restarts it if it stops; after
 * `maxRestarts` failures in a minute it gives up and reports "unavailable" (the toggle shortcut
 * takes over). Never logs key events.
 */
export class KeyListener {
  private child: ChildProcess | null = null;
  private stopped = true;
  private failures: number[] = [];
  private available = false;
  private permissionMissing = false;
  private buffer = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly o: KeyListenerOptions) {}

  start(): void {
    // Without permission nothing changes until the user grants it and asks to check again.
    if (!this.stopped || this.permissionMissing) return;
    this.stopped = false;
    this.failures = [];
    this.launch();
  }

  /** "Check again" after granting permission (or after giving up): a fresh start. */
  recheck(): void {
    this.stop();
    this.permissionMissing = false;
    this.start();
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin?.end(); // the watcher exits when stdin closes
      child.kill();
    }
    this.setAvailable(false);
  }

  get isAvailable(): boolean {
    return this.available;
  }

  /** macOS: the watcher reported it has no Input Monitoring permission (VAI-312). */
  get needsPermission(): boolean {
    return this.permissionMissing;
  }

  private launch(): void {
    let child: ChildProcess;
    try {
      child = this.o.spawn();
    } catch (e) {
      this.failed(`could not start (${e instanceof Error ? e.name : 'error'})`);
      return;
    }
    this.child = child;
    this.buffer = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onData(child, chunk));
    child.on('error', (e) => {
      if (this.child === child) this.failed(`error (${e.name})`);
    });
    child.on('exit', (code) => {
      if (this.child === child) this.failed(`exited (code ${code ?? 'none'})`);
    });
  }

  private onData(child: ChildProcess, chunk: string): void {
    if (this.child !== child) return;
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const event = parseKeyEvent(line);
      if (event === 'READY') {
        this.o.logger?.info('Hold-Ctrl watcher ready');
        this.setAvailable(true);
      } else if (event === 'NO_PERMISSION') {
        // Not a failure to retry: nothing changes until the user grants it (then start() again).
        this.o.logger?.warn('Hold-Ctrl watcher needs Input Monitoring permission');
        this.permissionMissing = true;
        this.stopped = true;
        this.child = null;
        if (this.available) this.setAvailable(false);
        else this.o.onAvailability(false); // status changed (needsPermission) even if not availability
        return;
      } else if (event) {
        this.o.onEvent(event);
      }
    }
    if (this.buffer.length > 1_000) this.buffer = ''; // garbage; never grows unbounded
  }

  private failed(reason: string): void {
    this.child = null;
    if (this.stopped) return;
    this.setAvailable(false);
    const now = (this.o.now ?? Date.now)();
    const windowMs = this.o.windowMs ?? 60_000;
    this.failures = [...this.failures.filter((t) => now - t < windowMs), now];
    const max = this.o.maxRestarts ?? 3;
    if (this.failures.length > max) {
      this.o.logger?.error('Hold-Ctrl watcher keeps failing; using the toggle shortcut instead', {
        reason,
      });
      this.stopped = true;
      return;
    }
    this.o.logger?.warn('Hold-Ctrl watcher stopped; restarting', { reason });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.launch();
    }, this.o.restartDelayMs ?? 500);
  }

  private setAvailable(available: boolean): void {
    if (available === this.available) return;
    this.available = available;
    this.o.onAvailability(available);
  }
}
