import { describe, expect, it, vi } from 'vitest';
import type { AudioCommand } from '../../shared/audio';
import type { KeepMicReadySeconds } from '../../shared/settings';
import { Logger } from '../logging/logger';
import { DictationStatus } from '../tray/dictation-status';
import { AudioController } from './audio-controller';

function setup(keep: KeepMicReadySeconds = 10) {
  const sent: AudioCommand['type'][] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const status = new DictationStatus();
  const lines: string[] = [];
  const onRecording = vi.fn();
  const config = { micDeviceId: 'mic-2', keepMicReadySeconds: keep };
  const audio = new AudioController({
    send: (c) => sent.push(c.type),
    config: () => config,
    status,
    onRecording,
    logger: new Logger({ sink: (l) => lines.push(l) }).scope('audio'),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: (h) =>
      timers.splice(
        timers.findIndex((t) => t === h),
        1,
      ),
  });
  // The hotkey sets these around start/stop; mimic it.
  const start = () => {
    status.set('recording');
    audio.start();
  };
  const stop = () => {
    status.set('idle');
    audio.stop();
  };
  return { audio, sent, timers, status, lines, onRecording, config, start, stop };
}

describe('AudioController', () => {
  it('opens early on a clean Ctrl press and closes again if it was a shortcut', () => {
    const { audio, sent } = setup();
    audio.prepare();
    expect(sent).toEqual(['open']);
    audio.abandon();
    expect(sent).toEqual(['open', 'close']);
    expect(audio.status().state).toBe('closed');
  });

  it('keeps the mic ready ("Listening") for the chosen time after dictating, then closes it', () => {
    const { audio, sent, timers, status, start, stop } = setup(10);
    audio.prepare();
    start();
    stop();
    expect(sent).toEqual(['open', 'start', 'stop']);
    expect(status.get()).toBe('listening');
    expect(timers.map((t) => t.ms)).toEqual([10_000]);
    timers[0]!.fn();
    expect(sent.at(-1)).toBe('close');
    expect(status.get()).toBe('idle');
  });

  it('dictating again while ready reuses the open mic (no new open)', () => {
    const { audio, sent, timers, start, stop } = setup(5);
    start();
    stop();
    audio.prepare(); // already open: nothing to do
    start();
    expect(sent).toEqual(['open', 'start', 'stop', 'start']);
    expect(timers).toHaveLength(0); // the close timer was cancelled
  });

  it('keep ready off: closes right after dictating', () => {
    const { audio, sent, status, start, stop } = setup(0);
    start();
    stop();
    expect(sent).toEqual(['open', 'start', 'stop', 'close']);
    expect(status.get()).toBe('idle');
    expect(audio.status().state).toBe('closed');
  });

  it('cancel discards the recording but also keeps the mic ready', () => {
    const { audio, sent, status } = setup(5);
    status.set('recording');
    audio.start();
    status.set('idle');
    audio.cancel();
    expect(sent).toEqual(['open', 'start', 'cancel']);
    expect(status.get()).toBe('listening');
  });

  it('mic problems are reported, logged and reset the state', () => {
    const { audio, status, lines, start } = setup();
    start();
    audio.onEvent({ type: 'error', reason: 'blocked' });
    expect(audio.status()).toEqual({
      state: 'closed',
      usingDefaultInstead: false,
      problem: 'blocked',
    });
    expect(status.get()).toBe('idle');
    expect(lines.join('\n')).toContain('Microphone could not be opened reason=blocked');
  });

  it('missing chosen device → System default, shown in status', () => {
    const { audio, lines } = setup();
    audio.prepare();
    audio.onEvent({ type: 'opened', fellBack: true, openMs: 40 });
    expect(audio.status().usingDefaultInstead).toBe(true);
    expect(lines.join('\n')).toContain('Chosen microphone not found; using System default');
  });

  it('accepts valid recordings (length and level only in the log) and passes them on', () => {
    const { audio, onRecording, lines } = setup();
    const pcm = new Int16Array(16_000).fill(1000).buffer;
    audio.onRecording({ pcm, durationMs: 999_999, peak: 0.5 });
    expect(onRecording).toHaveBeenCalledWith({ pcm, durationMs: 1000, peak: 0.5 });
    expect(lines.join('\n')).toContain('Recording finished durationMs=1000 peakDb=-6');
  });

  it.each([
    ['not an ArrayBuffer', { pcm: [1, 2], peak: 0 }],
    ['odd byte length', { pcm: new ArrayBuffer(3), peak: 0 }],
    ['too long', { pcm: new ArrayBuffer(16_000 * 2 * 60 * 11), peak: 0 }],
    ['no peak', { pcm: new ArrayBuffer(2) }],
    ['null', null],
  ])('ignores invalid recordings: %s', (_label, raw) => {
    const { audio, onRecording } = setup();
    audio.onRecording(raw);
    expect(onRecording).not.toHaveBeenCalled();
  });

  it('a settings change closes a ready mic so the new device is used next time', () => {
    const { audio, sent, start, stop } = setup(10);
    start();
    stop();
    audio.configChanged();
    expect(sent.at(-1)).toBe('close');
  });
});
