import { fieldError, ipcErrorMessage } from './ipc-errors';

const wrapped = new Error(
  "Error invoking remote method 'settings:update': SettingsValidationError: Invalid settings: ai.llm.baseUrl must be a valid URL; ai.retries must be between 0 and 10",
);

describe('ipc-errors', () => {
  it('strips the Electron wrapper and the error class', () => {
    expect(ipcErrorMessage(wrapped)).toBe(
      'Invalid settings: ai.llm.baseUrl must be a valid URL; ai.retries must be between 0 and 10',
    );
    expect(ipcErrorMessage('plain')).toBe('plain');
  });

  it('finds the message for one field', () => {
    expect(fieldError(wrapped, 'ai.llm.baseUrl')).toBe('Must be a valid URL.');
    expect(fieldError(wrapped, 'ai.retries')).toBe('Must be between 0 and 10.');
    expect(fieldError(wrapped, 'ai.asr.baseUrl')).toBeNull();
  });
});
