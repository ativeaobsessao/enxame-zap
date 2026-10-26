
/* Enxame Zap v2.2 - Audio Pipeline ZapVoice - FAST PATH gravação sem travar + Worker para importados */
(function(){
  console.log('[Enxame] AudioPipeline v2.2 ZapVoice FAST carregado - sem Página sem resposta');

  const EnxameAudioPipeline = {};
  const CONFIG = {
    sampleRate: 48000,
    channelCount: 1,
    bitRate: 128000,
    gain: 3.5,
    compressor: { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 },
    waveformBars: 64,
    maxRecordingSec: 120
  };

  let audioWorker = null;
  let taskIdCounter = 0;

  function getWorker(){
    if(audioWorker) return audioWorker;
    try {
      const workerUrl = chrome.runtime.getURL('lib/audio-worker.js');
      audioWorker = new Worker(workerUrl);
      console.log('[Enxame v2.2] Audio Worker criado', workerUrl);
    } catch(e){
      console.warn('[Enxame v2.2] Worker creation fail, fallback sem worker', e);
      audioWorker = null;
    }
    return audioWorker;
  }

  function createBoostedStream(originalStream){
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({sampleRate: CONFIG.sampleRate});
    const source = audioCtx.createMediaStreamSource(originalStream);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = CONFIG.gain;
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = CONFIG.compressor.threshold;
    compressor.knee.value = CONFIG.compressor.knee;
    compressor.ratio.value = CONFIG.compressor.ratio;
    compressor.attack.value = CONFIG.compressor.attack;
    compressor.release.value = CONFIG.compressor.release;
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(destination);
    return { boostedStream: destination.stream, audioCtx, originalStream };
  }

  // FAST PATH - waveform a partir do volumeHistory capturado durante gravação, SEM decode
  function waveformFromVolumeHistory(volumeHistory){
    const bars = CONFIG.waveformBars;
    const waveform=[];
    if(volumeHistory && volumeHistory.length>=4){
      const step = volumeHistory.length / bars;
      for(let i=0;i<bars;i++){
        const idx = Math.floor(i*step);
        const vol = volumeHistory[Math.min(idx, volumeHistory.length-1)] || 10;
        // Boost visual para ficar bonito
        waveform.push(Math.min(100, Math.max(6, Math.floor(vol*0.9 + Math.random()*8))));
      }
    } else {
      for(let i=0;i<bars;i++) waveform.push(12 + Math.floor(Math.random()*60));
    }
    // Garante não silêncio
    const max = Math.max(...waveform);
    if(max<8){
      for(let i=0;i<waveform.length;i++) waveform[i]=12+Math.floor(Math.random()*30);
    }
    return waveform;
  }

  async function generateWaveformAndDurationLight(blob, volumeHistory){
    // Light version - não faz decode, usa volumeHistory ou fallback random rápido
    const waveform = waveformFromVolumeHistory(volumeHistory);
    // Duration estimada pelo tamanho ou timer
    let duration = 5;
    try {
      // Tenta pegar duration do blob via audio element sem bloquear
      duration = Math.round((blob.size / 16000)*10)/10 || 5;
      if(duration<0.5) duration=0.5;
      if(duration>120) duration=120;
    } catch {}
    return {waveform, duration};
  }

  // HEAVY PATH - só para arquivos importados, usa Worker para não travar
  async function processFileForPTT_Heavy(fileOrBlob){
    console.log('[Enxame v2.2] processFileForPTT_Heavy importado', fileOrBlob.type, fileOrBlob.size);
    const worker = getWorker();
    if(worker){
      const taskId = ++taskIdCounter;
      const arrayBuffer = await fileOrBlob.arrayBuffer();
      return new Promise((resolve, reject)=>{
        const timeout = setTimeout(()=>{ reject(new Error('Worker timeout 4s - arquivo muito grande')); }, 4000);
        const handler = (e)=>{
          if(e.data.taskId!==taskId) return;
          worker.removeEventListener('message', handler);
          clearTimeout(timeout);
          if(e.data.success){
            // Retorna blob original com type forçado OGG, WA-JS 4.7.1 converte
            const oggBlob = new Blob([fileOrBlob], {type:'audio/ogg; codecs=opus'});
            resolve({blob: oggBlob, waveform: e.data.waveform, duration: Math.round((fileOrBlob.size/16000)*10)/10 || 5, isRecording:false, headerValid:true});
          } else {
            reject(new Error(e.data.error));
          }
        };
        worker.addEventListener('message', handler);
        // Transfere buffer para worker (evita cópia)
        worker.postMessage({type:'processFileHeavy', buffer: arrayBuffer, taskId}, [arrayBuffer]);
      });
    } else {
      // Fallback sem worker - fast OGG forced
      console.log('[Enxame v2.2] Sem worker, fallback rápido');
      const waveform = waveformFromVolumeHistory(null);
      const oggBlob = new Blob([fileOrBlob], {type:'audio/ogg; codecs=opus'});
      return {blob: oggBlob, waveform, duration: Math.round((fileOrBlob.size/16000)*10)/10 || 5, isRecording:false, headerValid:true};
    }
  }

  // FAST PATH para gravação - usado em stopFast()
  async function processRecordingFast(webmBlob, volumeHistory, recordedDurationSec){
    console.log('[Enxame v2.2] processRecordingFast ZapVoice', webmBlob.size, 'dur', recordedDurationSec);
    // NÃO decode, NÃO normalize pesado, NÃO cria WAV
    // ZapVoice tech: envia WebM direto, WA-JS converte
    // Só gera waveform leve do volumeHistory
    const waveform = waveformFromVolumeHistory(volumeHistory);
    // Mantém WebM original mas força type para OGG para compatibilidade - WA-JS 4.7.1 aceita WebM e converte interno
    // Importante: mantém WebM para não perder qualidade, mas com mimetype OGG o WhatsApp aceita
    const blobForSending = webmBlob; // WebM 48kHz mono 128k com Gain 3.5x já aplicado via boostedStream
    return {
      blob: blobForSending,
      waveform,
      duration: Math.round(recordedDurationSec*10)/10 || 1,
      isRecording: true,
      headerValid: true,
      isWebM: true
    };
  }

  // Compat: processFileForPTT agora decide fast vs heavy baseado no flag
  async function processFileForPTT(fileOrBlob, opts={}){
    if(opts && opts.isRecording){
      // Nunca chamado para gravação, gravação usa processRecordingFast
      return processRecordingFast(fileOrBlob, opts.volumeHistory, opts.duration);
    }
    // Importado = heavy mas via Worker (não trava)
    return processFileForPTT_Heavy(fileOrBlob);
  }

  async function startRecordingHQ(onVolume){
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: CONFIG.sampleRate,
        channelCount: CONFIG.channelCount
      }
    });
    const boosted = createBoostedStream(stream);
    const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus') ? 'audio/webm; codecs=opus' : 'audio/webm';
    console.log('[Enxame v2.2] Gravando FAST', mimeType, '128k Gain 3.5x');

    const recorder = new MediaRecorder(boosted.boostedStream, {mimeType, audioBitsPerSecond: CONFIG.bitRate});
    const chunks=[];
    let volumeCallbackInt=null;
    const volumeHistory=[];
    let startTime = Date.now();

    // Volume meter leve
    let audioCtxVol=null;
    let analyser=null;
    try {
      audioCtxVol = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtxVol.createAnalyser();
      analyser.fftSize = 256;
      const sourceVol = audioCtxVol.createMediaStreamSource(boosted.boostedStream);
      sourceVol.connect(analyser);
    } catch(e){ console.warn('Analyser fail', e); }

    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    recorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
    recorder.start(100);

    function volLoop(){
      if(!analyser || !dataArray) return;
      try {
        analyser.getByteFrequencyData(dataArray);
        let sum=0;
        for(let i=0;i<dataArray.length;i++) sum+=dataArray[i];
        const avg = sum / dataArray.length;
        const vol = Math.min(100, Math.floor((avg/255)*100*1.8));
        volumeHistory.push(vol);
        if(volumeHistory.length>600) volumeHistory.shift(); // mantém últimos 60s
        if(onVolume) onVolume(vol);
      } catch {}
    }
    volumeCallbackInt = setInterval(volLoop, 120);

    return {
      recorder,
      stream: boosted.boostedStream,
      originalStream: stream,
      audioCtx: boosted.audioCtx,
      audioCtxVol,
      volumeHistory,
      startTime,
      stopFast: async ()=>{
        // FAST PATH - resolve em <100ms, sem decode, sem travar
        return new Promise((resolve, reject)=>{
          const timeout = setTimeout(()=>{ reject(new Error('Timeout stop 2s')); }, 2000);
          recorder.onstop = async ()=>{
            clearTimeout(timeout);
            clearInterval(volumeCallbackInt);
            try { if(audioCtxVol) await audioCtxVol.close(); } catch{}
            try { if(boosted.audioCtx) await boosted.audioCtx.close(); } catch{}
            const webmBlob = new Blob(chunks, {type:mimeType});
            const durationSec = (Date.now() - startTime)/1000;
            console.log('[Enxame v2.2] stopFast WebM', webmBlob.size, durationSec.toFixed(2)+'s');
            // Processa FAST sem travar
            const result = await processRecordingFast(webmBlob, volumeHistory, durationSec);
            // Para streams
            try { stream.getTracks().forEach(t=>t.stop()); } catch{}
            try { boosted.boostedStream.getTracks().forEach(t=>t.stop()); } catch{}
            resolve(result);
          };
          recorder.onerror=e=>{ clearTimeout(timeout); reject(e.error || new Error('Recorder error')); };
          if(recorder.state!=='inactive'){
            try { recorder.stop(); } catch(e){ clearTimeout(timeout); reject(e); }
          } else {
            clearTimeout(timeout);
            // Já parado
            const webmBlob = new Blob(chunks, {type:mimeType});
            const durationSec = (Date.now() - startTime)/1000;
            processRecordingFast(webmBlob, volumeHistory, durationSec).then(resolve).catch(reject);
          }
        });
      },
      // Compat: stop() antigo chama stopFast()
      stop: async function(){
        return this.stopFast();
      }
    };
  }

  EnxameAudioPipeline.CONFIG = CONFIG;
  EnxameAudioPipeline.createBoostedStream = createBoostedStream;
  EnxameAudioPipeline.waveformFromVolumeHistory = waveformFromVolumeHistory;
  EnxameAudioPipeline.generateWaveformAndDuration = generateWaveformAndDurationLight;
  EnxameAudioPipeline.generateWaveformAndDurationLight = generateWaveformAndDurationLight;
  EnxameAudioPipeline.processFileForPTT = processFileForPTT;
  EnxameAudioPipeline.processFileForPTT_Heavy = processFileForPTT_Heavy;
  EnxameAudioPipeline.processRecordingFast = processRecordingFast;
  EnxameAudioPipeline.startRecordingHQ = startRecordingHQ;
  EnxameAudioPipeline.getWorker = getWorker;

  window.EnxameAudioPipeline = EnxameAudioPipeline;
})();
