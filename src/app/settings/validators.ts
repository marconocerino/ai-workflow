import type { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Same rules as main (electron/settings/schema.ts) for instant feedback.
 * Main still validates every save.
 */
export function serverUrlValidator(
  control: AbstractControl<string | null>,
): ValidationErrors | null {
  const value = (control.value ?? '').trim();
  if (value === '') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { url: 'Enter a full URL starting with https:// (or http://).' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { url: 'Must start with http:// or https://.' };
  }
  if (url.username || url.password) return { url: 'Must not contain a user name or password.' };
  if (url.search || url.hash) return { url: 'Must not contain ? or #.' };
  return null;
}

/** First error message of a control, for <mat-error>. */
export function errorText(control: AbstractControl): string | null {
  const errors = control.errors;
  if (!errors) return null;
  if (typeof errors['server'] === 'string') return errors['server'];
  if (typeof errors['url'] === 'string') return errors['url'];
  if (errors['required']) return 'Required.';
  if (errors['min'] || errors['max']) {
    const e = (errors['min'] ?? errors['max']) as { min?: number; max?: number };
    return e.min !== undefined ? `Must be at least ${e.min}.` : `Must be at most ${e.max}.`;
  }
  if (errors['maxlength']) return 'Too long.';
  if (errors['pattern']) return 'Must be a whole number.';
  return 'Invalid value.';
}
