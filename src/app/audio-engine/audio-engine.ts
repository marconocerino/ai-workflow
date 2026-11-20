import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AI_WORKFLOW_BRIDGE } from '../core/electron-api';
import { openBrowserSource, warmUpAudio } from './browser-source';
import { AudioEngine } from './engine';

/**
 * Page of the hidden audio window (VAI-302). No UI: it owns the microphone and answers the main
 * process's commands. In any other window the main process ignores what it sends.
 */
@Component({
  selector: 'app-audio-engine',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="aiw-sr-only">AI Workflow audio</p>`,
})
export class AudioEngineHost {
  constructor() {
    const bridge = inject(AI_WORKFLOW_BRIDGE);
    if (!bridge) return;
    const engine = new AudioEngine(openBrowserSource, {
      event: (e) => void bridge.audioEngine.event(e).catch(() => undefined),
      recording: (r) => void bridge.audioEngine.recording(r).catch(() => undefined),
    });
    void warmUpAudio().catch(() => undefined); // retried on first open if it fails here
    bridge.audioEngine.onCommand((command) => engine.handle(command));
    void bridge.audioEngine.event({ type: 'ready' }).catch(() => undefined);
  }
}
