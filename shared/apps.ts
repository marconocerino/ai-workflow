/** App names for the overlay chip and style rules (VAI-305/308). Types and data only. */

/** Program file names (Windows) and app names (macOS) → the short name people know. */
export const APP_NAMES: Readonly<Record<string, string>> = {
  outlook: 'Outlook',
  olk: 'Outlook', // new Outlook for Windows
  'ms-teams': 'Teams',
  teams: 'Teams',
  winword: 'Word',
  word: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  powerpoint: 'PowerPoint',
  onenote: 'OneNote',
  msedge: 'Edge',
  'microsoft edge': 'Edge',
  chrome: 'Chrome',
  'google chrome': 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  code: 'VS Code',
  'visual studio code': 'VS Code',
  notepad: 'Notepad',
  textedit: 'TextEdit',
  notes: 'Notes',
  slack: 'Slack',
  zoom: 'Zoom',
  'zoom.us': 'Zoom',
  explorer: 'File Explorer',
  windowsterminal: 'Terminal',
  terminal: 'Terminal',
  cmd: 'Command Prompt',
  'ai workflow': 'AI Workflow',
  electron: 'AI Workflow', // running from source
};

/** Short names people know, for suggestions in Settings → Style per app. */
export const KNOWN_APPS: readonly string[] = [...new Set(Object.values(APP_NAMES))].sort();
