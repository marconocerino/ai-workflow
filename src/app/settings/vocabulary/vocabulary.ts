import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { type MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MAX_VOCABULARY, MAX_VOCABULARY_WORD, splitVocabulary } from '../../../../shared/settings';
import { ipcErrorMessage } from '../../core/ipc-errors';
import { SettingsApi } from '../../core/settings-api';
import { Icon } from '../../ui';
import { SaveStatus } from '../shared/save-status';
import { SettingsHeader } from '../shared/settings-header';

/**
 * Settings → Vocabulary (VAI-309): names, products and acronyms sent as hints to speech-to-text
 * and cleanup. Add with Enter, comma or by pasting a list; remove with ✕ or Backspace.
 */
@Component({
  selector: 'app-vocabulary-settings',
  imports: [MatChipsModule, MatFormFieldModule, SettingsHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vocabulary.html',
  styleUrl: './vocabulary.scss',
})
export class VocabularySettings {
  private readonly api = inject(SettingsApi);
  private readonly status = inject(SaveStatus);
  protected readonly separators = [ENTER, COMMA] as const;
  protected readonly max = MAX_VOCABULARY;
  protected readonly words = signal<string[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  /** Enter or comma in the input. */
  protected addFromInput(event: MatChipInputEvent): void {
    const added = this.add(splitVocabulary(event.value));
    if (added) event.chipInput.clear();
  }

  /** A pasted list: every entry is added (commas, semicolons, new lines). */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/[,;\r\n\t]/.test(text)) return; // a single word: let it go into the input
    event.preventDefault();
    this.add(splitVocabulary(text));
  }

  protected remove(word: string): void {
    this.notice.set(null);
    void this.save(this.words().filter((w) => w !== word));
  }

  /** Adds new words (duplicates skipped quietly); says what couldn't be added. */
  private add(candidates: string[]): boolean {
    this.notice.set(null);
    const next = [...this.words()];
    const seen = new Set(next.map((w) => w.toLowerCase()));
    const tooLong: string[] = [];
    let full = false;
    for (const word of candidates) {
      if (word.length > MAX_VOCABULARY_WORD) {
        tooLong.push(word);
        continue;
      }
      if (seen.has(word.toLowerCase())) continue;
      if (next.length >= MAX_VOCABULARY) {
        full = true;
        break;
      }
      seen.add(word.toLowerCase());
      next.push(word);
    }
    const messages = [];
    if (tooLong.length) {
      messages.push(
        `Not added (over ${MAX_VOCABULARY_WORD} characters): ${tooLong.map((w) => `${w.slice(0, 20)}…`).join(', ')}.`,
      );
    }
    if (full) messages.push(`The list is full (${MAX_VOCABULARY} words). Remove some to add more.`);
    if (messages.length) this.notice.set(messages.join(' '));
    if (next.length !== this.words().length) void this.save(next);
    return tooLong.length === 0 && !full;
  }

  private async load(): Promise<void> {
    try {
      this.words.set((await this.api.get()).dictation.vocabulary);
      this.loaded.set(true);
    } catch (e) {
      this.error.set(`Couldn't load settings: ${ipcErrorMessage(e)}`);
    }
  }

  private async save(words: string[]): Promise<void> {
    this.error.set(null);
    const before = this.words();
    this.words.set(words);
    try {
      const saved = await this.status.track(this.api.update({ dictation: { vocabulary: words } }));
      this.words.set(saved.dictation.vocabulary);
    } catch (e) {
      this.words.set(before);
      this.error.set(ipcErrorMessage(e));
    }
  }
}
