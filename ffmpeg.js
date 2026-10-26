
/* Enxame Zap v2.2 - FFmpeg - NÃO carrega WASM durante gravação - evita Página sem resposta */
(function(){
  console.log('[Enxame] FFmpeg v2.2 FAST carregado - sem WASM na gravação');

  const EnxameFFmpeg = {};
  let ffmpegInstance=null;
  let ffmpegLoading=null;

  async function loadFFmpeg(isRecordingPath){
    if(isRecordingPath){
      console.log('[Enxame v2.2] FFmpeg skip - caminho gravação FAST não usa WASM');
      return null;
    }
    if(ffmpegInstance) return ffmpegInstance;
    if(ffmpegLoading) return ffmpegLoading;
    ffmpegLoading = (async ()=>{
      try {
        if(window.FFmpeg){
          ffmpegInstance = window.FFmpeg.createFFmpeg({log:false});
          await ffmpegInstance.load();
          console.log('[Enxame] FFmpeg.wasm carregado');
          return ffmpegInstance;
        }
      } catch(e){ console.warn('FFmpeg.wasm fail', e); }
      return null;
    })();
    return ffmpegLoading;
  }

  async function convertToOggOpus(blob, opts={}){
    const isRecording = opts.isRecording || opts.isWebM || blob.type.includes('webm') && blob.size < 5000000;
    if(isRecording){
      // FAST PATH ZapVoice: gravação WebM não precisa conversão, retorna como está
      console.log('[Enxame v2.2] convertToOggOpus FAST SKIP - gravação WebM direta', blob.size);
      return blob;
    }
    console.log('[Enxame v2.2] convertToOggOpus importado', blob.type, blob.size);
    // Para importados, tenta wasm mas via worker, senão retorna OGG forced
    const ff = await loadFFmpeg(false);
    if(ff){
      try {
        const inputName='input.webm';
        const outputName='output.ogg';
        const data = new Uint8Array(await blob.arrayBuffer());
        ff.FS('writeFile', inputName, data);
        await ff.run('-i', inputName, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'off', '-application', 'voip', outputName);
        const outData = ff.FS('readFile', outputName);
        return new Blob([outData.buffer], {type:'audio/ogg; codecs=opus'});
      } catch(e){ console.warn('FFmpeg wasm run fail', e); }
    }
    // Fallback rápido - OGG forced, WA-JS converte
    return new Blob([blob], {type:'audio/ogg; codecs=opus'});
  }

  async function convertToOggOpusFast(blob){
    // Compat
    return convertToOggOpus(blob, {isRecording:true});
  }

  EnxameFFmpeg.convertToOggOpus = convertToOggOpus;
  EnxameFFmpeg.convertToOggOpusFast = convertToOggOpusFast;
  window.EnxameFFmpeg = EnxameFFmpeg;
})();
