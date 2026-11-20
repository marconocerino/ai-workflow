import type { OpenSource } from './engine';

/** Path of the AudioWorklet module (public/audio-capture-worklet.js). */
export const WORKLET_URL = '/audio-capture-worklet.js';

function constraints(deviceId: string): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      // Dictation is close-talk speech: no echo cancellation (nothing plays back), but light
      // noise suppression and auto gain help speech-to-text.
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  };
}

/**
 * Audio context + worklet, created once when the audio window starts and suspended while the
 * mic is closed, so opening the mic is only getUserMedia (a shorter cold start, fewer clipped
 * first words).
 */
let shared: Promise<AudioContext> | null = null;

export function warmUpAudio(): Promise<AudioContext> {
  shared ??= (async () => {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule(WORKLET_URL);
    await ctx.suspend();
    return ctx;
  })();
  return shared;
}

/** The real microphone: getUserMedia → AudioWorklet → float frames (VAI-302). */
export const openBrowserSource: OpenSource = async (deviceId, onFrames) => {
  const ctx = await warmUpAudio();
  let stream: MediaStream;
  let fellBack = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw e;
    // The chosen device is gone (e.g. headset unplugged): use System default.
    stream = await navigator.mediaDevices.getUserMedia(constraints(''));
    fellBack = true;
  }
  try {
    const input = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'aiw-capture');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrames(e.data);
    input.connect(node);
    node.connect(ctx.destination); // the node outputs silence; this just keeps it running
    await ctx.resume();
    return {
      fellBack,
      source: {
        sampleRate: ctx.sampleRate,
        close: () => {
          node.port.onmessage = null;
          input.disconnect();
          node.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          void ctx.suspend();
        },
      },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
};
