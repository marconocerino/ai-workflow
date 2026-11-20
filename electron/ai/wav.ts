import { SAMPLE_RATE } from '../../shared/audio';

const HEADER_BYTES = 44;

/**
 * Wraps 16-bit mono little-endian PCM in a WAV (RIFF) header, in memory (VAI-303).
 * The audio is never written to disk.
 */
export function pcmToWav(pcm: ArrayBuffer, sampleRate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(HEADER_BYTES + pcm.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  out.set(new Uint8Array(pcm), HEADER_BYTES);
  return out;
}
