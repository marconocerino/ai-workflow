// AI Workflow audio capture (VAI-302): runs on the audio thread of the hidden audio window and
// hands the microphone's samples to the page in ~20 ms batches. Writes no output (silence).
class AiwCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(Math.round(sampleRate / 50));
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let i = 0;
      while (i < channel.length) {
        const n = Math.min(channel.length - i, this.batch.length - this.filled);
        this.batch.set(channel.subarray(i, i + n), this.filled);
        this.filled += n;
        i += n;
        if (this.filled === this.batch.length) {
          this.port.postMessage(this.batch);
          this.batch = new Float32Array(this.batch.length);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('aiw-capture', AiwCapture);
