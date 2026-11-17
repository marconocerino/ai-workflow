/**
 * Errors thrown in main arrive as
 * "Error invoking remote method 'settings:update': SettingsValidationError: Invalid settings: ai.llm.baseUrl must …".
 * These helpers turn that into text for the user.
 */

/** The message without Electron's "Error invoking remote method" wrapper and the error class name. */
export function ipcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^[A-Za-z]*Error: /, '')
    .trim();
}

/** The validation message for one settings field (e.g. "ai.llm.baseUrl"), or null. */
export function fieldError(error: unknown, path: string): string | null {
  const message = ipcErrorMessage(error).replace(/^Invalid settings: /, '');
  for (const part of message.split('; ')) {
    if (part.startsWith(`${path} `)) {
      const text = part.slice(path.length + 1);
      return text.charAt(0).toUpperCase() + text.slice(1) + '.';
    }
  }
  return null;
}
