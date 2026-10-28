/**
 * Enxame Zap v2.9.0 - ogg-opus.js (ISOLATED World)
 * Pipeline nativo de áudio para OGG/Opus real sem dependência externa.
 * - Decodificação via decodeAudioData
 * - Resampling e mixdown para mono 48 kHz via OfflineAudioContext
 * - Normalização RMS a -16 dBFS com limitador suave a -1 dBFS (sem ganho fixo)
 * - Codificação com WebCodecs AudioEncoder ('opus', 48kHz, mono, frames de 20ms)
 * - Muxer OGG/Opus manual conforme RFC 7845 e RFC 3533 (OpusHead, OpusTags, granulepos exato, CRC32 Ogg)
 * - Cálculo de waveform real (64 barras por RMS sem Math.random) e duração exata
 * - Autoteste: EnxameOgg.selfTest()
 */
(function() {
  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][Ogg]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][Ogg]', ...args);
  const logError = (...args) => console.error('[Enxame][Ogg]', ...args);

  const CONFIG = {
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 64000,
    targetRmsDb: -16,
    peakCeilingDb: -1,
    waveformBars: 64,
    frameSamples: 960 // 20ms a 48kHz
  };

  // Tabela CRC32 do padrão Ogg (polinômio 0x04C11DB7)
  const OGG_CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r << 1) ^ ((r & 0x80000000) ? 0x04C11DB7 : 0);
    }
    OGG_CRC_TABLE[i] = r >>> 0;
  }

  function oggCrc(buffer, offset, length) {
    let crc = 0;
    for (let i = 0; i < length; i++) {
      const byte = buffer[offset + i];
      crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ byte) & 0xFF]) >>> 0;
    }
    return crc >>> 0;
  }

  function checkWebCodecsSupport() {
    if (typeof window.AudioEncoder !== 'function') {
      const msg = 'Navegador incompatível: WebCodecs (AudioEncoder) não suportado. Atualize para o Google Chrome 120+.';
      logError(msg);
      throw new Error(msg);
    }
  }

  /**
   * Decodifica qualquer arquivo de áudio para PCM mono 48 kHz.
   */
  async function decodeToMono48k(arrayBuffer) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API não suportada neste navegador.');

    const tempCtx = new AudioCtx({ sampleRate: CONFIG.sampleRate });
    let decodedBuffer = null;
    try {
      decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      try { await tempCtx.close(); } catch {}
    }

    if (!decodedBuffer) throw new Error('Falha ao decodificar dados de áudio.');

    const targetLength = Math.max(1, Math.ceil(decodedBuffer.duration * CONFIG.sampleRate));
    const offlineCtx = new OfflineAudioContext(1, targetLength, CONFIG.sampleRate);
    const srcNode = offlineCtx.createBufferSource();
    srcNode.buffer = decodedBuffer;
    srcNode.connect(offlineCtx.destination);
    srcNode.start(0);

    const rendered = await offlineCtx.startRendering();
    const pcm = rendered.getChannelData(0); // Float32Array a 48kHz mono
    return { pcm, duration: decodedBuffer.duration };
  }

  /**
   * Normalização RMS para -16 dB com limitador suave a -1 dBFS.
   */
  function normalizeAudio(pcm) {
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i++) {
      sumSq += pcm[i] * pcm[i];
    }
    const currentRms = Math.sqrt(sumSq / pcm.length) || 0.0001;
    const targetRmsLinear = Math.pow(10, CONFIG.targetRmsDb / 20); // ~0.1585
    let gain = targetRmsLinear / currentRms;

    // Teto de pico: -1 dBFS = ~0.89125
    const peakCeilingLinear = Math.pow(10, CONFIG.peakCeilingDb / 20);
    let maxPeak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > maxPeak) maxPeak = abs;
    }

    if (maxPeak * gain > peakCeilingLinear) {
      gain = peakCeilingLinear / maxPeak;
    }

    const outPcm = new Float32Array(pcm.length);
    const headroom = 1 - peakCeilingLinear;
    for (let i = 0; i < pcm.length; i++) {
      let s = pcm[i] * gain;
      if (s > peakCeilingLinear) {
        s = peakCeilingLinear + headroom * Math.tanh((s - peakCeilingLinear) / headroom);
      } else if (s < -peakCeilingLinear) {
        s = -peakCeilingLinear + headroom * Math.tanh((s + peakCeilingLinear) / headroom);
      }
      outPcm[i] = Math.max(-1, Math.min(1, s));
    }

    return outPcm;
  }

  /**
   * Calcula 64 barras de waveform a partir do PCM real (RMS por janela, 0-100).
   */
  function calculateRealWaveform(pcm) {
    const bars = CONFIG.waveformBars;
    const waveform = [];
    if (!pcm || pcm.length === 0) {
      return Array(bars).fill(10);
    }

    const windowSize = Math.max(1, Math.floor(pcm.length / bars));
    const rawRms = [];
    let maxRms = 0.0001;

    for (let b = 0; b < bars; b++) {
      const start = b * windowSize;
      const end = Math.min(start + windowSize, pcm.length);
      let sumSq = 0;
      let count = 0;
      for (let j = start; j < end; j++) {
        sumSq += pcm[j] * pcm[j];
        count++;
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      rawRms.push(rms);
      if (rms > maxRms) maxRms = rms;
    }

    for (let b = 0; b < bars; b++) {
      const norm = Math.round((rawRms[b] / maxRms) * 100);
      waveform.push(Math.max(4, Math.min(100, norm)));
    }

    return waveform;
  }

  /**
   * Constrói uma página Ogg completa com CRC32 calculado.
   */
  function buildOggPage({ headerType, granulePos, serial, sequence, segments }) {
    let payloadSize = 0;
    const segmentTable = [];

    for (const seg of segments) {
      let remaining = seg.length;
      let offset = 0;
      while (remaining >= 255) {
        segmentTable.push(255);
        remaining -= 255;
        offset += 255;
      }
      segmentTable.push(remaining);
      payloadSize += seg.length;
    }

    const headerSize = 27 + segmentTable.length;
    const pageTotal = headerSize + payloadSize;
    const page = new Uint8Array(pageTotal);
    const view = new DataView(page.buffer);

    // 0..3: "OggS"
    page[0] = 0x4F; page[1] = 0x67; page[2] = 0x67; page[3] = 0x53;
    // 4: Version 0
    page[4] = 0;
    // 5: Header type flag (0x02 BOS, 0x00 normal, 0x04 EOS)
    page[5] = headerType;
    // 6..13: Granule position (64-bit LE)
    const granLow = Number(granulePos & BigInt(0xFFFFFFFF));
    const granHigh = Number((granulePos >> BigInt(32)) & BigInt(0xFFFFFFFF));
    view.setUint32(6, granLow, true);
    view.setUint32(10, granHigh, true);
    // 14..17: Bitstream serial number
    view.setUint32(14, serial, true);
    // 18..21: Page sequence number
    view.setUint32(18, sequence, true);
    // 22..25: Checksum (inicialmente 0 para cálculo)
    view.setUint32(22, 0, true);
    // 26: Segment count
    page[26] = segmentTable.length;
    // 27..27+N: Segment table
    page.set(segmentTable, 27);

    // Cópia dos segmentos de dados
    let dataOffset = headerSize;
    for (const seg of segments) {
      page.set(seg, dataOffset);
      dataOffset += seg.length;
    }

    // Cálculo do CRC32 sobre toda a página
    const calculatedCrc = oggCrc(page, 0, pageTotal);
    view.setUint32(22, calculatedCrc, true);

    return page;
  }

  /**
   * Muxer Ogg para pacotes Opus codificados via WebCodecs.
   */
  function muxOggOpus(opusPackets, totalPcmSamples) {
    const serial = (Math.random() * 0xFFFFFFF) >>> 0;
    const pages = [];
    let sequence = 0;

    // --- Página 0: OpusHead (RFC 7845) ---
    const headPacket = new Uint8Array(19);
    const headView = new DataView(headPacket.buffer);
    headPacket.set([0x4F, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
    headPacket[8] = 1; // Version
    headPacket[9] = 1; // 1 Canal (Mono)
    headView.setUint16(10, 312, true); // Pre-skip (312 amostras a 48kHz)
    headView.setUint32(12, CONFIG.sampleRate, true); // 48000 Hz
    headView.setInt16(16, 0, true); // Output gain 0 dB
    headPacket[18] = 0; // Channel mapping 0

    pages.push(buildOggPage({
      headerType: 0x02, // BOS
      granulePos: BigInt(0),
      serial,
      sequence: sequence++,
      segments: [headPacket]
    }));

    // --- Página 1: OpusTags ---
    const vendorStr = 'Enxame Zap 2.9';
    const vendorBytes = new TextEncoder().encode(vendorStr);
    const tagsSize = 8 + 4 + vendorBytes.length + 4;
    const tagsPacket = new Uint8Array(tagsSize);
    const tagsView = new DataView(tagsPacket.buffer);
    tagsPacket.set([0x4F, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
    tagsView.setUint32(8, vendorBytes.length, true);
    tagsPacket.set(vendorBytes, 12);
    tagsView.setUint32(12 + vendorBytes.length, 0, true); // 0 comentários de usuário

    pages.push(buildOggPage({
      headerType: 0x00,
      granulePos: BigInt(0),
      serial,
      sequence: sequence++,
      segments: [tagsPacket]
    }));

    // --- Páginas de Áudio ---
    let currentGranule = BigInt(0);
    const numPackets = opusPackets.length;

    for (let i = 0; i < numPackets; i++) {
      const isLast = (i === numPackets - 1);
      currentGranule += BigInt(CONFIG.frameSamples);
      if (isLast && totalPcmSamples > 0) {
        currentGranule = BigInt(totalPcmSamples);
      }

      pages.push(buildOggPage({
        headerType: isLast ? 0x04 : 0x00, // 0x04 = EOS na última página
        granulePos: currentGranule,
        serial,
        sequence: sequence++,
        segments: [opusPackets[i]]
      }));
    }

    return new Blob(pages, { type: 'audio/ogg; codecs=opus' });
  }

  /**
   * Codifica PCM mono 48 kHz usando WebCodecs AudioEncoder e empacota em Ogg.
   */
  async function encodePcmToOggOpus(pcm) {
    checkWebCodecsSupport();

    const opusPackets = [];
    let encodeError = null;

    const encoder = new window.AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        opusPackets.push(data);
      },
      error: (err) => {
        logError('Erro no AudioEncoder:', err);
        encodeError = err;
      }
    });

    encoder.configure({
      codec: 'opus',
      sampleRate: CONFIG.sampleRate,
      numberOfChannels: CONFIG.numberOfChannels,
      bitrate: CONFIG.bitrate
    });

    const frameSize = CONFIG.frameSamples;
    const totalFrames = Math.ceil(pcm.length / frameSize);

    for (let f = 0; f < totalFrames; f++) {
      if (encodeError) throw encodeError;

      const start = f * frameSize;
      const end = Math.min(start + frameSize, pcm.length);
      const frameData = new Float32Array(frameSize);
      frameData.set(pcm.subarray(start, end));

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: CONFIG.sampleRate,
        numberOfFrames: frameSize,
        numberOfChannels: 1,
        timestamp: Math.round((f * frameSize / CONFIG.sampleRate) * 1000000),
        data: frameData
      });

      encoder.encode(audioData);
      audioData.close();
    }

    await encoder.flush();
    encoder.close();

    if (encodeError) throw encodeError;

    return muxOggOpus(opusPackets, pcm.length);
  }

  /**
   * Pipeline mestre único para qualquer entrada (Blob, File ou ArrayBuffer).
   */
  async function processToOggOpus(input) {
    let arrayBuffer = null;
    if (input instanceof ArrayBuffer) {
      arrayBuffer = input;
    } else if (input?.arrayBuffer) {
      arrayBuffer = await input.arrayBuffer();
    } else if (input instanceof Uint8Array) {
      arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    } else {
      throw new Error('Entrada de áudio inválida para processamento OGG/Opus.');
    }

    // 1. Decodificar para 48kHz mono
    const { pcm } = await decodeToMono48k(arrayBuffer);

    // 2. Normalização RMS -16 dB com limitador
    const normalizedPcm = normalizeAudio(pcm);

    // 3. Duração exata pelas amostras e Waveform real (64 barras)
    const exactDuration = Math.round((normalizedPcm.length / CONFIG.sampleRate) * 10) / 10;
    const waveform = calculateRealWaveform(normalizedPcm);

    // 4. Codificar para OGG/Opus real via WebCodecs
    const oggBlob = await encodePcmToOggOpus(normalizedPcm);

    logDebug(`OGG/Opus gerado com sucesso: ${oggBlob.size} bytes, duração=${exactDuration}s`);

    return {
      blob: oggBlob,
      waveform,
      duration: exactDuration,
      mime: 'audio/ogg; codecs=opus',
      format: 'ogg-opus',
      schema: 2
    };
  }

  /**
   * Autoteste (Tarefa 4): gera tom de 1s, codifica, valida e decodifica novamente.
   */
  async function selfTest() {
    try {
      checkWebCodecsSupport();
      logDebug('Iniciando selfTest EnxameOgg...');

      // Gera 1s de onda senoidal de 440 Hz
      const sampleRate = 48000;
      const durationSec = 1.0;
      const totalSamples = sampleRate * durationSec;
      const testPcm = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        testPcm[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3;
      }

      // Codifica para Ogg/Opus
      const oggBlob = await encodePcmToOggOpus(testPcm);
      const buffer = await oggBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Validação básica do cabeçalho Ogg
      if (bytes.length < 58) {
        throw new Error('Arquivo Ogg menor que o tamanho mínimo de cabeçalhos.');
      }
      const magicOgg = String.fromCharCode(...bytes.subarray(0, 4));
      if (magicOgg !== 'OggS') {
        throw new Error(`Magic inválido no início: esperado "OggS", obtido "${magicOgg}"`);
      }

      // Decodificação de volta com decodeAudioData do navegador para atestar compatibilidade
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const testCtx = new AudioCtx({ sampleRate });
      let reDecoded = null;
      try {
        reDecoded = await testCtx.decodeAudioData(buffer.slice(0));
      } finally {
        try { await testCtx.close(); } catch {}
      }

      if (!reDecoded || Math.abs(reDecoded.duration - 1.0) > 0.1) {
        throw new Error(`Duração decodificada inconsistente: ${reDecoded?.duration}s (esperado ~1.0s)`);
      }

      console.log('%c[Enxame][Ogg] SelfTest: PASS (1.0s 48kHz mono OGG/Opus validado)', 'color:#30d158;font-weight:bold;padding:2px 6px;border:1px solid #30d158;border-radius:6px');
      return { pass: true, duration: reDecoded.duration, size: oggBlob.size };
    } catch (err) {
      console.error('%c[Enxame][Ogg] SelfTest: FAIL - ' + err.message, 'color:#ff3b30;font-weight:bold');
      return { pass: false, error: err.message };
    }
  }

  // API Pública do módulo
  window.EnxameOgg = {
    processToOggOpus,
    calculateRealWaveform,
    selfTest,
    CONFIG
  };

  logDebug('Módulo lib/ogg-opus.js v2.9.0 carregado.');
})();
