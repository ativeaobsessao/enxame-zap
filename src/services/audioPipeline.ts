// ZapVoice Audio Pipeline implementation
// 48kHz mono, 128kbps, Gain 3.5x boost, Dynamics compressor, 64-bar waveform

export interface AudioPipelineConfig {
  sampleRate: number;
  channelCount: number;
  bitRate: number;
  gain: number;
  compressor: {
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
  };
  waveformBars: number;
}

export const AUDIO_CONFIG: AudioPipelineConfig = {
  sampleRate: 48000,
  channelCount: 1,
  bitRate: 128000,
  gain: 3.5,
  compressor: {
    threshold: -24,
    knee: 30,
    ratio: 12,
    attack: 0.003,
    release: 0.25,
  },
  waveformBars: 64,
};

export class AudioPipeline {
  private audioCtx: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private recordedChunks: Blob[] = [];
  private volumeHistory: number[] = [];
  private animFrameId: number | null = null;

  public getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: AUDIO_CONFIG.sampleRate });
    }
    return this.audioCtx;
  }

  // Generates 64 waveform bars from volume history or buffer
  public static generateWaveform(volumeHistory?: number[]): number[] {
    const bars = AUDIO_CONFIG.waveformBars;
    const waveform: number[] = [];
    if (volumeHistory && volumeHistory.length >= 4) {
      const step = volumeHistory.length / bars;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor(i * step);
        const vol = volumeHistory[Math.min(idx, volumeHistory.length - 1)] || 10;
        waveform.push(Math.min(100, Math.max(12, Math.floor(vol * 0.95 + Math.random() * 8))));
      }
    } else {
      // Natural voice waveform pattern
      for (let i = 0; i < bars; i++) {
        const envelope = Math.sin((i / bars) * Math.PI);
        const randomVariation = Math.random() * 35;
        waveform.push(Math.min(100, Math.max(12, Math.floor(envelope * 75 + randomVariation))));
      }
    }
    return waveform;
  }

  // Start live microphone recording with 3.5x gain boost & compressor
  public async startRecording(onVolumeUpdate?: (currentVol: number) => void): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: AUDIO_CONFIG.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    const gainNode = ctx.createGain();
    gainNode.gain.value = AUDIO_CONFIG.gain;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = AUDIO_CONFIG.compressor.threshold;
    compressor.knee.value = AUDIO_CONFIG.compressor.knee;
    compressor.ratio.value = AUDIO_CONFIG.compressor.ratio;
    compressor.attack.value = AUDIO_CONFIG.compressor.attack;
    compressor.release.value = AUDIO_CONFIG.compressor.release;

    const destination = ctx.createMediaStreamDestination();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;

    source.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(destination);
    compressor.connect(this.analyser);

    this.recordedChunks = [];
    this.volumeHistory = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: AUDIO_CONFIG.bitRate,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const monitorVolume = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(100, Math.floor((avg / 128) * 100));
      this.volumeHistory.push(normalized);
      if (onVolumeUpdate) {
        onVolumeUpdate(normalized);
      }
      this.animFrameId = requestAnimationFrame(monitorVolume);
    };

    this.mediaRecorder.start(100);
    monitorVolume();
  }

  // Stop recording and return PTT blob with waveform & duration
  public async stopRecording(): Promise<{ blob: Blob; waveform: number[]; duration: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder not initialized'));
      }

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/ogg';
        const rawBlob = new Blob(this.recordedChunks, { type: mimeType });
        const waveform = AudioPipeline.generateWaveform(this.volumeHistory);
        const duration = Math.max(1, Math.round((this.volumeHistory.length * 16) / 1000));
        resolve({ blob: rawBlob, waveform, duration });
      };

      this.mediaRecorder.stop();
    });
  }

  // Generate synthetic high quality demo audio blob (for browser environments without active mic)
  public static createDemoAudioBlob(durationSeconds = 3): { blob: Blob; waveform: number[]; duration: number } {
    const sampleRate = 48000;
    const numSamples = sampleRate * durationSeconds;
    const buffer = new Float32Array(numSamples);

    // Generate gentle harmonious voice-like chime
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const f1 = 440;
      const f2 = 554.37;
      const f3 = 659.25;
      const envelope = Math.exp(-t * 1.5) * (1 - Math.exp(-t * 50));
      buffer[i] = (Math.sin(2 * Math.PI * f1 * t) * 0.4 +
                   Math.sin(2 * Math.PI * f2 * t) * 0.3 +
                   Math.sin(2 * Math.PI * f3 * t) * 0.2) * envelope;
    }

    // Convert to 16-bit WAV PCM blob
    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);

    // RIFF identifier
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const waveform = AudioPipeline.generateWaveform();
    return { blob, waveform, duration: durationSeconds };
  }
}
