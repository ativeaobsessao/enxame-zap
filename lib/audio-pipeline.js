/* Enxame Zap v2.9.1 - Audio Pipeline com Suporte a Pausar e Continuar */
(function() {
  console.log('[Enxame] AudioPipeline v2.9.1 carregado');

  const EnxameAudioPipeline = {};
  const CONFIG = {
    sampleRate: 48000,
    channelCount: 1,
    noiseSuppression: true,
    autoGainControl: true,
    echoCancellation: false,
    waveformBars: 64,
    maxRecordingSec: 120
  };

  /**
   * Processamento único para arquivo importado ou gravação.
   * Converte para OGG/Opus real 48kHz mono normalizado (-16 dBFS).
   */
  async function processFileForPTT(fileOrBlob, opts = {}) {
    if (!window.EnxameOgg || typeof window.EnxameOgg.processToOggOpus !== 'function') {
      throw new Error('Módulo EnxameOgg não disponível no ambiente.');
    }
    return await window.EnxameOgg.processToOggOpus(fileOrBlob);
  }

  async function processRecordingFast(blob, volumeHistory, recordedDurationSec) {
    if (!window.EnxameOgg || typeof window.EnxameOgg.processToOggOpus !== 'function') {
      throw new Error('Módulo EnxameOgg não disponível no ambiente.');
    }
    const result = await window.EnxameOgg.processToOggOpus(blob);
    result.isRecording = true;
    if (typeof recordedDurationSec === 'number' && recordedDurationSec > 0) {
      result.duration = Math.round(recordedDurationSec * 10) / 10;
    }
    return result;
  }

  /**
   * Inicia gravação de microfone com cancelamento de ruído, AGC e suporte a pause/resume.
   * Fornece pause(), resume(), isPaused(), elapsedMs() e dispose().
   */
  async function startRecordingHQ(onVolume) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: CONFIG.echoCancellation,
        noiseSuppression: CONFIG.noiseSuppression,
        autoGainControl: CONFIG.autoGainControl,
        sampleRate: CONFIG.sampleRate,
        channelCount: CONFIG.channelCount
      }
    });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
      ? 'audio/webm; codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg');

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    let volumeCallbackInt = null;
    let isDisposed = false;
    let isPausedState = false;
    let accumulatedRecordedMs = 0;
    let activeSegmentStart = Date.now();
    let startTime = activeSegmentStart;

    // Analyser para visualização de volume em tempo real
    let audioCtxVol = null;
    let analyser = null;
    let dataArray = null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxVol = new AudioCtx();
        analyser = audioCtxVol.createAnalyser();
        analyser.fftSize = 256;
        const sourceVol = audioCtxVol.createMediaStreamSource(stream);
        sourceVol.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch (e) {
      console.warn('[Enxame] Falha ao inicializar analyser de volume:', e);
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.start(100);

    function isPaused() {
      return isPausedState || recorder.state === 'paused';
    }

    function elapsedMs() {
      if (isPaused()) {
        return accumulatedRecordedMs;
      }
      return accumulatedRecordedMs + (activeSegmentStart ? (Date.now() - activeSegmentStart) : 0);
    }

    function pause() {
      if (!isPausedState && recorder.state === 'recording') {
        try {
          recorder.pause();
        } catch (e) {
          console.warn('[Enxame] Falha ao acionar pause no recorder:', e);
        }
        isPausedState = true;
        if (activeSegmentStart) {
          accumulatedRecordedMs += (Date.now() - activeSegmentStart);
          activeSegmentStart = 0;
        }
      }
    }

    function resume() {
      if (isPausedState && recorder.state === 'paused') {
        try {
          recorder.resume();
        } catch (e) {
          console.warn('[Enxame] Falha ao acionar resume no recorder:', e);
        }
        isPausedState = false;
        activeSegmentStart = Date.now();
      }
    }

    function volLoop() {
      if (isDisposed || isPaused() || !analyser || !dataArray) return;
      try {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const vol = Math.min(100, Math.floor((avg / 255) * 100 * 1.8));
        if (onVolume) onVolume(vol);
      } catch {}
    }
    volumeCallbackInt = setInterval(volLoop, 120);

    /**
     * Libera completamente todos os recursos (microfone, contextos de áudio, timers).
     */
    function dispose() {
      if (isDisposed) return;
      isDisposed = true;

      if (volumeCallbackInt) {
        clearInterval(volumeCallbackInt);
        volumeCallbackInt = null;
      }
      try {
        if (audioCtxVol && audioCtxVol.state !== 'closed') {
          audioCtxVol.close().catch(() => {});
        }
      } catch {}
      try {
        if (stream) {
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch {}
          });
        }
      } catch {}
    }

    return {
      recorder,
      stream,
      originalStream: stream,
      audioCtxVol,
      startTime,
      dispose,
      pause,
      resume,
      isPaused,
      elapsedMs,
      stopFast: async () => {
        if (!isPaused() && activeSegmentStart) {
          accumulatedRecordedMs += (Date.now() - activeSegmentStart);
          activeSegmentStart = 0;
        }
        const totalRecordedSec = Math.max(0.1, Math.round((accumulatedRecordedMs / 1000) * 10) / 10);

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            dispose();
            reject(new Error('Timeout ao finalizar gravação'));
          }, 35000);

          recorder.onstop = async () => {
            clearTimeout(timeout);
            dispose();
            try {
              const recordedBlob = new Blob(chunks, { type: mimeType });
              const result = await processRecordingFast(recordedBlob, null, totalRecordedSec);
              resolve(result);
            } catch (err) {
              reject(err);
            }
          };

          recorder.onerror = (e) => {
            clearTimeout(timeout);
            dispose();
            reject(e.error || new Error('Erro no gravador de áudio'));
          };

          if (recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch (e) {
              clearTimeout(timeout);
              dispose();
              reject(e);
            }
          } else {
            clearTimeout(timeout);
            dispose();
            const recordedBlob = new Blob(chunks, { type: mimeType });
            processRecordingFast(recordedBlob, null, totalRecordedSec).then(resolve).catch(reject);
          }
        });
      },
      stop: async function() {
        return this.stopFast();
      }
    };
  }

  EnxameAudioPipeline.CONFIG = CONFIG;
  EnxameAudioPipeline.processFileForPTT = processFileForPTT;
  EnxameAudioPipeline.processRecordingFast = processRecordingFast;
  EnxameAudioPipeline.startRecordingHQ = startRecordingHQ;

  window.EnxameAudioPipeline = EnxameAudioPipeline;
})();
