import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE_RULES, styleFor } from './settings';

describe('styleFor (VAI-308)', () => {
  it('defaults: Outlook email, Word professional, Teams/Slack casual, VS Code/terminals code', () => {
    expect(styleFor(DEFAULT_STYLE_RULES, 'Outlook')).toBe('email');
    expect(styleFor(DEFAULT_STYLE_RULES, 'Word')).toBe('professional');
    expect(styleFor(DEFAULT_STYLE_RULES, 'Teams')).toBe('casual');
    expect(styleFor(DEFAULT_STYLE_RULES, 'Slack')).toBe('casual');
    expect(styleFor(DEFAULT_STYLE_RULES, 'VS Code')).toBe('code');
    expect(styleFor(DEFAULT_STYLE_RULES, 'Terminal')).toBe('code');
  });

  it('matches ignoring case and spaces at the ends', () => {
    expect(styleFor([{ app: 'Notion', style: 'casual' }], '  notion ')).toBe('casual');
  });

  it('apps without a rule, and unknown apps, use Neutral', () => {
    expect(styleFor(DEFAULT_STYLE_RULES, 'Figma')).toBe('neutral');
    expect(styleFor(DEFAULT_STYLE_RULES, null)).toBe('neutral');
    expect(styleFor([], 'Outlook')).toBe('neutral');
  });
});
