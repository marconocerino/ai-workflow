/**
 * Chromium's fake microphone for VAI-302 tests: fake devices with a short beep every second, so
 * recordings have sound in them. Deliberately NOT --use-fake-ui-for-media-stream: that flag skips
 * the app's permission handler, which the tests must exercise. (--use-file-for-fake-audio-capture
 * is ignored in Electron's sandboxed audio service, so a WAV file can't be used.)
 */
export const FAKE_MIC_ARGS = ['--use-fake-device-for-media-stream'];
