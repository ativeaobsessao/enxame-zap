/**
 * Enxame Zap v2.10.1 - main-vmic.js (MAIN World)
 * Microfone virtual para envio nativo de áudio PTT (mensagem de voz) sem WA-JS.
 * Intercepta navigator.mediaDevices.getUserMedia e MediaDevices.prototype.getUserMedia.
 */
(function() {
  if (window.__ENXAME_VMIC_LOADED__) {
    return;
  }
  window.__ENXAME_VMIC_LOADED__ = true;

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][VMIC]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][VMIC]', ...args);

  let armedState = null;
  let activeAudioContext = null;
  let activeTracks = [];
  let isPlaying = false;

  function emitProgress(id, stage) {
    if (!id) return;
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'progress',
      id,
      stage
    }, '*');
  }

  function emitResponse(id, ok, opts = {}) {
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'res',
      id,
      ok: !!ok,
      strategy: 'VMIC',
      stage: opts.stage || null,
      mayHaveSent: !!opts.mayHaveSent,
      error: opts.error ? {
        code: opts.error.code || 'UNKNOWN_ERROR',
        message: opts.error.message || String(opts.error)
      } : null,
      data: opts.data || null
    }, '*');
  }

  function cleanupPlayback() {
    isPlaying = false;
    if (activeTracks && activeTracks.length) {
      activeTracks.forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      activeTracks = [];
    }
    if (activeAudioContext) {
      try { activeAudioContext.close(); } catch (e) {}
      activeAudioContext = null;
    }
    if (armedState && armedState.timer) {
      clearTimeout(armedState.timer);
    }
    armedState = null;
  }

  /**
   * Decodifica o áudio e valida amplitude mínima (peak >= 0.01).
   * Lança VMIC_SILENT_AUDIO se o áudio for inaudível ou mudo.
   */
  async function decodeAndValidate(audioData) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) {
      const err = new Error('AudioContext indisponível no navegador');
      err.code = 'AUDIO_CONTEXT_UNAVAILABLE';
      throw err;
    }

    const testCtx = new AudioCtxClass();
    let audioBuffer;
    try {
      audioBuffer = await testCtx.decodeAudioData(audioData);
    } finally {
      try { await testCtx.close(); } catch (e) {}
    }

    let maxPeak = 0;
    const numChannels = audioBuffer.numberOfChannels;
    for (let c = 0; c < numChannels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }

    if (maxPeak < 0.01) {
      const err = new Error('Áudio mudo ou sem volume detectado');
      err.code = 'VMIC_SILENT_AUDIO';
      throw err;
    }

    return audioBuffer;
  }

  /**
   * Handler de streaming virtual quando o WhatsApp chama getUserMedia.
   */
  async function handleVirtualMic(constraints) {
    const arm = armedState;
    armedState = null; // Uso único: consumido imediatamente

    if (!arm || !arm.audioBuffer) {
      if (originalGetUserMedia) {
        return originalGetUserMedia(constraints);
      }
      throw new Error('Nenhum áudio armado no microfone virtual');
    }

    logDebug(`[VMIC] getUserMedia interceptado para requisição ${arm.reqId}`);
    emitProgress(arm.reqId, 'consumed');

    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtxClass();
    activeAudioContext = ctx;

    const dest = ctx.createMediaStreamDestination();
    const stream = dest.stream;
    activeTracks = stream.getTracks();

    const leadInSec = 0.35; // 350ms lead-in silencioso
    const tailSec = 0.30;   // 300ms tail silencioso

    const source = ctx.createBufferSource();
    source.buffer = arm.audioBuffer;
    source.connect(dest);

    const startTime = ctx.currentTime + leadInSec;
    source.start(startTime);
    isPlaying = true;

    source.onended = () => {
      setTimeout(() => {
        isPlaying = false;
        logDebug(`[VMIC] Playback finalizado para requisição ${arm.reqId}`);
        emitProgress(arm.reqId, 'playback_ended');
      }, Math.round(tailSec * 1000));
    };

    return stream;
  }

  // Interceptação de MediaDevices.prototype.getUserMedia e navigator.mediaDevices.getUserMedia
  const originalGetUserMedia = (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
    ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    : (window.MediaDevices && window.MediaDevices.prototype && typeof window.MediaDevices.prototype.getUserMedia === 'function')
      ? window.MediaDevices.prototype.getUserMedia
      : null;

  if (window.MediaDevices && window.MediaDevices.prototype && typeof window.MediaDevices.prototype.getUserMedia === 'function') {
    const origProtoGUM = window.MediaDevices.prototype.getUserMedia;
    window.MediaDevices.prototype.getUserMedia = function(constraints) {
      // Intercepta SOMENTE se armado e áudio requisitado sem vídeo
      if (armedState && armedState.active && constraints && constraints.audio && !constraints.video) {
        return handleVirtualMic(constraints);
      }
      return origProtoGUM.apply(this, arguments);
    };
  }

  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    const origNavGUM = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = function(constraints) {
      if (armedState && armedState.active && constraints && constraints.audio && !constraints.video) {
        return handleVirtualMic(constraints);
      }
      return origNavGUM.apply(this, arguments);
    };
  }

  // Listener da ponte
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__enxame !== 1 || msg.v !== 1 || msg.dir !== 'req') return;

    const { id, kind, payload } = msg;

    if (kind === 'vmic_status') {
      emitResponse(id, true, {
        stage: 'STATUS',
        data: {
          loaded: true,
          armed: !!(armedState && armedState.active),
          playing: isPlaying
        }
      });
      return;
    }

    if (kind === 'vmic_disarm') {
      cleanupPlayback();
      emitResponse(id, true, { stage: 'DISARMED' });
      return;
    }

    if (kind === 'vmic_arm') {
      try {
        cleanupPlayback();

        let rawBuffer = payload?.buffer;
        if (!rawBuffer && payload?.blob instanceof Blob) {
          rawBuffer = await payload.blob.arrayBuffer();
        }

        if (!rawBuffer || !(rawBuffer instanceof ArrayBuffer)) {
          const err = new Error('Buffer de áudio inválido ou ausente para armar microfone virtual');
          err.code = 'BAD_PAYLOAD';
          throw err;
        }

        // decodeAudioData pode desacoplar o buffer; usamos slice(0) para segurança
        const audioBuffer = await decodeAndValidate(rawBuffer.slice(0));

        const ttlMs = typeof payload?.ttlMs === 'number' && payload.ttlMs > 0 ? payload.ttlMs : 25000;
        const timer = setTimeout(() => {
          if (armedState && armedState.reqId === id) {
            logWarn(`[VMIC] Armamento expirou sem consumo (VMIC_ARM_EXPIRED) para ${id}`);
            cleanupPlayback();
          }
        }, ttlMs);

        armedState = {
          active: true,
          reqId: id,
          audioBuffer,
          duration: audioBuffer.duration,
          timer,
          armedAt: Date.now()
        };

        logDebug(`[VMIC] Microfone armado com sucesso para ${id}. Duração: ${audioBuffer.duration}s`);
        emitResponse(id, true, {
          stage: 'ARMED',
          data: {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels
          }
        });
      } catch (err) {
        cleanupPlayback();
        emitResponse(id, false, {
          stage: 'ARM_FAILED',
          error: {
            code: err.code || 'ARM_FAILED',
            message: err.message || 'Falha ao armar microfone virtual'
          }
        });
      }
      return;
    }
  });

  logDebug('Microfone virtual v2.10.1 (main-vmic.js) inicializado no mundo MAIN.');
})();
