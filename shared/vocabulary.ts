/** Custom vocabulary as hints (VAI-309). Shared logic, no I/O. */

/**
 * Whisper-family decoders read only ~223 tokens of `prompt` (≈ 550 characters of a word list) and
 * keep the END of anything longer; Groq rejects prompts over 896 characters.
 */
export const ASR_PROMPT_CHARS = 550;
/** The LLM has no such window; this only stops a huge list crowding the cleanup prompt. */
export const CLEANUP_HINT_CHARS = 2000;

/**
 * The words as a comma-separated list of at most `maxChars`. Newest words win (the list is kept
 * oldest first) and stay at the end, which is the part a Whisper decoder reads.
 */
export function vocabularyHint(words: readonly string[], maxChars: number): string {
  const kept: string[] = [];
  let length = 0;
  for (let i = words.length - 1; i >= 0; i--) {
    const add = words[i]!.length + (kept.length ? 2 : 0);
    if (length + add > maxChars) break;
    kept.unshift(words[i]!);
    length += add;
  }
  return kept.join(', ');
}
