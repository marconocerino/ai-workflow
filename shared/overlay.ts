/** The floating dictation bar (VAI-305). Types only, shared by main and the overlay window. */

export interface OverlayState {
  /** recording: mic is on · transcribing: text on its way · hidden: nothing to show. */
  phase: 'hidden' | 'recording' | 'transcribing';
  /** Loudness 0..1 while recording (never audio). */
  level: number;
  /** Where the text will go, e.g. "Outlook" — app name only, never a window title. */
  app: string | null;
  /** Cleanup style for that app, e.g. "Professional"; null when Neutral or cleanup is off (VAI-308). */
  style: string | null;
  /** Small hint, e.g. "Esc to cancel" (toggle mode). */
  hint: string | null;
}

export const HIDDEN_OVERLAY: OverlayState = {
  phase: 'hidden',
  level: 0,
  app: null,
  style: null,
  hint: null,
};
