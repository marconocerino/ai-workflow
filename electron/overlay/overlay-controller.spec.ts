import { describe, expect, it } from 'vitest';
import type { OverlayState } from '../../shared/overlay';
import { DictationStatus } from '../tray/dictation-status';
import {
  AWAIT_TEXT_MS,
  OVERLAY_SIZE,
  OverlayController,
  overlayBounds,
} from './overlay-controller';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 }; // 1080p minus a 40 px taskbar
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { source?: 'hold' | 'toggle'; app?: Promise<string | null> } = {}) {
  const status = new DictationStatus();
  const log: string[] = [];
  const sent: OverlayState[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const controller = new OverlayController({
    window: {
      show: (b) => log.push(`show ${b.x},${b.y}`),
      hide: () => log.push('hide'),
      send: (s) => sent.push(s),
    },
    status,
    workArea: () => WORK_AREA,
    source: () => opts.source ?? 'hold',
    frontApp: () => opts.app ?? Promise.resolve('Outlook'),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => timers.splice(0),
  });
  return { status, controller, log, sent, timers, last: () => sent.at(-1)! };
}

describe('overlayBounds', () => {
  it('bottom-centre, above the taskbar', () => {
    expect(overlayBounds(WORK_AREA)).toEqual({
      x: (1920 - OVERLAY_SIZE.width) / 2,
      y: 1040 - OVERLAY_SIZE.height - 24,
      ...OVERLAY_SIZE,
    });
  });

  it('on a second display to the left (negative coordinates)', () => {
    const b = overlayBounds({ x: -2560, y: 200, width: 2560, height: 1400 });
    expect(b.x).toBe(-2560 + (2560 - OVERLAY_SIZE.width) / 2);
    expect(b.y).toBe(200 + 1400 - OVERLAY_SIZE.height - 24);
  });
});

describe('OverlayController', () => {
  it('recording: sends the state, shows without focus, then fills in the app', async () => {
    const { status, log, last, controller } = setup();
    status.set('recording');
    expect(log).toEqual([`show ${(1920 - 600) / 2},${1040 - 92 - 24}`]);
    expect(last()).toEqual({ phase: 'recording', level: 0, app: null, hint: null });
    await tick();
    expect(last().app).toBe('Outlook');
    expect(controller.describe().showMs).toBeGreaterThanOrEqual(0);
  });

  it('toggle mode shows "Esc to cancel"', () => {
    const { status, last } = setup({ source: 'toggle' });
    status.set('recording');
    expect(last().hint).toBe('Esc to cancel');
  });

  it('levels only while recording, clamped; nonsense ignored', () => {
    const { status, controller, last, sent } = setup();
    controller.level(0.5);
    expect(sent).toEqual([]); // hidden: nothing sent
    status.set('recording');
    controller.level(0.4);
    expect(last().level).toBe(0.4);
    controller.level(7);
    expect(last().level).toBe(1);
    const count = sent.length;
    controller.level('loud');
    controller.level(Number.NaN);
    expect(sent).toHaveLength(count);
  });

  it('stop: straight to "Transcribing…" (no flicker through idle), hides when done', async () => {
    const { status, controller, log, last } = setup();
    status.set('recording');
    // What the hotkey does on release: status idle, then stop.
    status.set('idle');
    controller.ended('stop');
    status.set('listening'); // recorder keeps the mic ready
    await tick();
    expect(last().phase).toBe('transcribing');
    expect(log).not.toContain('hide');
    status.set('transcribing'); // the pipeline picked it up
    status.set('listening'); // text pasted
    await tick();
    expect(log.at(-1)).toBe('hide');
    expect(last().phase).toBe('hidden');
  });

  it('cancel hides at once', async () => {
    const { status, controller, log } = setup();
    status.set('recording');
    status.set('idle');
    controller.ended('cancel');
    expect(log.at(-1)).toBe('hide');
  });

  it('recording ended without the hotkey (mic error, cap): hides', async () => {
    const { status, log } = setup();
    status.set('recording');
    status.set('idle');
    await tick();
    expect(log.at(-1)).toBe('hide');
  });

  it('stop but the recording never arrives: gives up after a while', () => {
    const { status, controller, timers, log } = setup();
    status.set('recording');
    status.set('idle');
    controller.ended('stop');
    expect(timers[0]!.ms).toBe(AWAIT_TEXT_MS);
    timers[0]!.fn();
    expect(log.at(-1)).toBe('hide');
  });

  it('a slow app lookup from an earlier dictation never overwrites a newer one', async () => {
    let resolveOld!: (v: string) => void;
    const old = new Promise<string | null>((r) => (resolveOld = r));
    const { status, controller, last } = setup({ app: old });
    status.set('recording');
    controller.ended('cancel');
    resolveOld('Excel');
    await tick();
    expect(last().app).toBeNull();
  });

  it('transcribing without a visible bar (e.g. after a restart) shows it', () => {
    const { status, log, last } = setup();
    status.set('transcribing');
    expect(log[0]).toMatch(/^show /);
    expect(last().phase).toBe('transcribing');
  });
});
