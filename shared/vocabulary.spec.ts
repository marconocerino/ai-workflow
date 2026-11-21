import { describe, expect, it } from 'vitest';
import { splitVocabulary } from './settings';
import { ASR_PROMPT_CHARS, vocabularyHint } from './vocabulary';

describe('splitVocabulary (VAI-309)', () => {
  it('commas, semicolons, new lines and tabs separate; spaces inside are kept', () => {
    expect(splitVocabulary('Kubernetes, Siobhan;AIWF\nVisual   Studio\r\n\tkubectl,, ')).toEqual([
      'Kubernetes',
      'Siobhan',
      'AIWF',
      'Visual Studio',
      'kubectl',
    ]);
    expect(splitVocabulary('  ')).toEqual([]);
  });
});

describe('vocabularyHint', () => {
  it('a comma-separated list', () => {
    expect(vocabularyHint(['Siobhan', 'Kubernetes', 'AIWF'], 550)).toBe(
      'Siobhan, Kubernetes, AIWF',
    );
    expect(vocabularyHint([], 550)).toBe('');
  });

  it('over the limit: the newest words are kept, at the end (what Whisper reads)', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${String(i).padStart(3, '0')}`);
    const hint = vocabularyHint(words, ASR_PROMPT_CHARS);
    expect(hint.length).toBeLessThanOrEqual(ASR_PROMPT_CHARS);
    expect(hint.endsWith('word199')).toBe(true);
    expect(hint).not.toContain('word000');
    expect(hint.split(', ')).toEqual(words.slice(-hint.split(', ').length));
  });
});
