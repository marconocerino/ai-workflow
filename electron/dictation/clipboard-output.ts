import type { DictationOutput } from './dictation-pipeline';
import { forPlatform } from './paste-output';

export interface ClipboardOutputDeps {
  writeClipboard(text: string): void | Promise<void>;
  /** Show a system notification (no-op where unsupported). */
  notify(title: string, body: string): void;
  platform: NodeJS.Platform;
}

/**
 * Temporary output until VAI-304 (paste at cursor): the text goes on the clipboard and a
 * notification says so. The notification never contains the text (Windows keeps notification
 * history), only that it's ready, or what went wrong.
 */
export function clipboardOutput(d: ClipboardOutputDeps): DictationOutput {
  const paste = d.platform === 'darwin' ? '⌘V' : 'Ctrl+V';
  return {
    async text(text) {
      await d.writeClipboard(forPlatform(text, d.platform));
      d.notify('Dictation ready', `Text copied. Press ${paste} to paste it.`);
    },
    problem(message) {
      d.notify('Dictation failed', message);
    },
  };
}
