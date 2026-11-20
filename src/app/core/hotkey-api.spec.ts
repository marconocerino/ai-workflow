import { shortcutFromEvent, shortcutLabel } from './hotkey-api';

const ev = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('shortcutFromEvent', () => {
  it.each([
    [ev('Space', { ctrlKey: true, shiftKey: true }), ['Ctrl', 'Shift', 'Space']],
    [ev('KeyK', { ctrlKey: true, altKey: true }), ['Ctrl', 'Alt', 'K']],
    [ev('Digit5', { metaKey: true }), ['Meta', '5']],
    [ev('F9', { altKey: true }), ['Alt', 'F9']],
    [ev('ControlLeft', { ctrlKey: true }), 'modifier-only'],
    [ev('ShiftRight', { shiftKey: true }), 'modifier-only'],
    [ev('Semicolon', { ctrlKey: true }), null],
  ])('%j → %j', (event, expected) => {
    expect(shortcutFromEvent(event)).toEqual(expected);
  });

  it('labels Meta as Win', () => {
    expect(shortcutLabel(['Meta', 'Shift', 'K'])).toBe('Win+Shift+K');
  });
});
