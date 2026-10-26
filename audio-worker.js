
/* Enxame Zap v2.2 - Audio Worker - Processamento pesado fora da main thread - Evita Página sem resposta */
self.onmessage = async function(e){
  const {type, buffer, fileName, volumeHistory, taskId} = e.data || {};
  try {
    if(type==='processRecordingFast'){
      // Fast path ZapVoice - gravação: NÃO decode, só waveform do volumeHistory já capturado
      // volumeHistory é array de vol 0-100 capturado durante gravação
      const waveform = [];
      const bars = 64;
      if(volumeHistory && volumeHistory.length){
        // Mapeia volumeHistory para 64 barras
        const step = volumeHistory.length / bars;
        for(let i=0;i<bars;i++){
          const idx = Math.floor(i*step);
          const vol = volumeHistory[Math.min(idx, volumeHistory.length-1)] || 10;
          waveform.push(Math.min(100, Math.max(4, vol + (Math.random()*6-3))));
        }
      } else {
        for(let i=0;i<bars;i++) waveform.push(10 + Math.floor(Math.random()*60));
      }
      // Retorna blob intacto, WA-JS 4.7.1 vai converter
      self.postMessage({taskId, success:true, waveform, isRecording:true});
      return;
    }

    if(type==='processFileHeavy'){
      // Heavy path para importados - tenta decode leve se possível
      // Como Worker não tem AudioContext em alguns browsers, faz waveform estimado por tamanho
      // Isso evita bloquear main thread
      let waveform = [];
      const bars = 64;
      // Tenta usar OfflineAudioContext se disponível no worker
      try {
        if(self.OfflineAudioContext){
          // Decode simples - pode falhar se codec não suportado no worker
          const audioCtx = new self.OfflineAudioContext(1, 48000*10, 48000);
          // Não temos decoder de opus no worker, então fallback para estimado
          throw new Error('opus decode not in worker, use estimated');
        }
      } catch {}

      // Fallback estimado rápido - não bloqueia
      // Gera waveform baseado no tamanho do buffer (variação)
      const seed = buffer ? buffer.byteLength % 100 : 50;
      for(let i=0;i<bars;i++){
        const v = 8 + Math.abs(Math.sin(i*0.3 + seed*0.01))*60 + Math.random()*12;
        waveform.push(Math.min(100, Math.floor(v)));
      }
      // Não re-encoda aqui, retorna flag para main thread usar fast OGG forced
      self.postMessage({taskId, success:true, waveform, isRecording:false, size: buffer ? buffer.byteLength : 0});
      return;
    }

    self.postMessage({taskId, success:false, error:'unknown type '+type});
  } catch(err){
    self.postMessage({taskId, success:false, error: err.message});
  }
};

console.log('[Enxame Worker v2.2] Audio Worker carregado - ZapVoice fast path');
