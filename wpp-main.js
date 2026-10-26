/* Enxame Zap v2.7 - BLUEPRINT DEFINITIVO - Fix Store.Chat nao disponivel + WPP nao disponivel + chatId :9 + Remove WAWebChatModels error spam - ZapVoice tech */
(function(){
  console.log('%c[Enxame v2.7] wpp-main.js MAIN world - BLUEPRINT DEFINITIVO Store+WPP+DOM','background:#000;color:#30d158;padding:5px 12px;border-radius:999px;font-weight:800');

  let Store = null;
  let webpackRequire = null;

  function getWebpackRequire(){
    if(webpackRequire) return webpackRequire;
    try{
      if(window.webpackChunkwhatsapp_web_client && Array.isArray(window.webpackChunkwhatsapp_web_client)){
        try{
          let req=null;
          window.webpackChunkwhatsapp_web_client.push([
            [Math.random().toString(36)],
            {},
            function(e){ req=e; }
          ]);
          if(req && (req.m || req.c)){
            webpackRequire=req;
            console.log('[Enxame v2.7] webpackRequire via push runtime (e) - m:', !!req.m, 'c:', !!req.c);
            return req;
          }
        }catch(e){ console.warn('[Enxame v2.7] push method1 fail', e.message); }
        try{
          let req=null;
          const id='enxame_req_'+Date.now();
          window.webpackChunkwhatsapp_web_client.push([
            [[id]],
            { [id]: function(o, e, r){ req=r; } },
            [[id]]
          ]);
          if(req && (req.m || req.c)){
            webpackRequire=req;
            console.log('[Enxame v2.7] webpackRequire via module capture require - m:', !!req.m);
            return req;
          }
        }catch(e){ console.warn('[Enxame v2.7] push method2 fail', e.message); }
      }
      const chunkNames = Object.keys(window).filter(k=>k.startsWith('webpackChunk') && Array.isArray(window[k]));
      for(let cn of chunkNames){
        try{
          const chunk = window[cn];
          if(!chunk || !chunk.push) continue;
          let req=null;
          chunk.push([
            [Math.random().toString(36)],
            {},
            function(e){ req=e; }
          ]);
          if(req && (req.m || req.c)){
            webpackRequire=req;
            console.log('[Enxame v2.7] webpackRequire via '+cn+' push runtime');
            return req;
          }
        }catch{}
      }
      if(window.webpackRequire && window.webpackRequire.m){
        webpackRequire=window.webpackRequire;
        console.log('[Enxame v2.7] webpackRequire via window.webpackRequire');
        return webpackRequire;
      }
    }catch(e){ console.warn('[Enxame v2.7] getWebpackRequire fail', e); }
    return null;
  }

  function findInCache(pred){
    try{
      const req = getWebpackRequire();
      if(!req || !req.c) return null;
      for(let id in req.c){
        try{
          const mod = req.c[id];
          if(!mod || !mod.exports) continue;
          const exp = mod.exports;
          if(pred(exp)) return exp;
          if(exp.default && pred(exp.default)) return exp.default;
          for(let k in exp){
            try{
              const v = exp[k];
              if(v && pred(v)) return v;
            }catch{}
          }
        }catch{}
      }
    }catch{}
    return null;
  }

  function findInModules(pred){
    try{
      const req = getWebpackRequire();
      if(!req || !req.m) return null;
      let checked=0;
      for(let id in req.m){
        checked++;
        if(checked>2000) break;
        try{
          const mod = req(id);
          if(!mod) continue;
          if(pred(mod)) return mod;
          if(mod.default && pred(mod.default)) return mod.default;
          for(let k in mod){
            try{
              const v = mod[k];
              if(!v) continue;
              if(pred(v)) return v;
              if(v.default && pred(v.default)) return v.default;
            }catch{}
          }
        }catch{}
      }
    }catch{}
    return null;
  }

  function extractStore(){
    if(window.Store && window.Store.Chat && window.Store.Chat.getModelsArray){ Store=window.Store; return Store; }
    if(Store && Store.Chat && Store.Chat.getModelsArray) return Store;
    try{
      if(window.WPP?.whatsapp?.ChatStore){
        Store = { Chat: window.WPP.whatsapp.ChatStore, Wap: window.WPP.whatsapp.Wap };
        if(Store.Chat) {
          console.log('[Enxame v2.7] Store via WPP.whatsapp.ChatStore models:', Store.Chat.models?.length || Store.Chat.getModelsArray?.()?.length);
          return Store;
        }
      }
      let chatCol = findInCache(m=> m && typeof m.getModelsArray==='function' && m.models && (m.models.length===0 || m.models[0]?.id?._serialized));
      if(!chatCol){
        chatCol = findInCache(m=> m && m.models && Array.isArray(m.models) && m.models.length>0 && m.models[0]?.id?._serialized && typeof m.get==='function');
      }
      if(!chatCol){
        chatCol = findInModules(m=> m && typeof m.getModelsArray==='function' && m.models);
      }
      if(!chatCol){
        chatCol = findInModules(m=> m && m.models && Array.isArray(m.models) && m.models.length>0 && m.models[0]?.id?._serialized);
      }
      if(!chatCol){
        chatCol = findInCache(m=> m && m.Chat && m.Chat.getModelsArray);
        if(chatCol) chatCol = chatCol.Chat;
      }
      if(!chatCol){
        chatCol = findInModules(m=> m && m.Chat && typeof m.Chat.getModelsArray==='function');
        if(chatCol) chatCol = chatCol.Chat;
      }
      let tmp={};
      if(chatCol){
        tmp.Chat=chatCol;
        console.log('[Enxame v2.7] Store.Chat ENCONTRADO models:', chatCol.models?.length || chatCol.getModelsArray?.()?.length || 'unknown');
      }
      let contact = findInCache(m=> m && m.Contact && m.Contact.modelClass) || findInModules(m=> m && m.Contact && m.Contact.modelClass);
      if(contact) tmp.Contact = contact.Contact;
      let msg = findInCache(m=> m && m.Msg && m.Msg.modelClass) || findInModules(m=> m && m.Msg && m.Msg.modelClass);
      if(msg) tmp.Msg = msg.Msg;
      let wap = findInCache(m=> m && typeof m.sendFileMessage==='function') || findInModules(m=> m && typeof m.sendFileMessage==='function');
      if(wap) tmp.Wap = wap;
      let mediaPrep = findInCache(m=> m && typeof m.prepRawMedia==='function') || findInModules(m=> m && typeof m.prepRawMedia==='function');
      if(mediaPrep) tmp.MediaPrep = mediaPrep;
      let sendToChat = findInCache(m=> m && typeof m.sendToChat==='function') || findInModules(m=> m && typeof m.sendToChat==='function');
      if(sendToChat) tmp.SendToChat = sendToChat;
      if(tmp.Chat){
        Store=tmp;
        window.Store=window.Store||{};
        Object.assign(window.Store, tmp);
        window.WPP = window.WPP||{};
        window.WPP.chat = window.WPP.chat||{};
        if(!window.WPP.chat.sendFileMessage){
          window.WPP.chat.sendFileMessage = async (chatId, file, opts)=>{
            console.log('[Enxame v2.7] WPP shim sendFileMessage -> Store', chatId, file.size);
            return await sendPttViaStore(chatId, file, opts);
          };
        }
        if(!window.WPP.whatsapp){
          window.WPP.whatsapp={ ChatStore: tmp.Chat, Wap: tmp.Wap };
        }
        return Store;
      }
    }catch(e){ console.warn('[Enxame v2.7] extractStore fail', e); }
    return null;
  }

  async function waitForStore(timeout=30000){
    const start=Date.now();
    let attempts=0;
    while(Date.now()-start<timeout){
      attempts++;
      const s=extractStore();
      if(s && s.Chat && (s.Chat.getModelsArray || s.Chat.models)){
        if(attempts>1) console.log('[Enxame v2.7] Store encontrado após '+attempts+' tentativas');
        return s;
      }
      if(window.WPP?.chat?.sendFileMessage) return window.WPP.whatsapp?.ChatStore || window.Store || s;
      if(window.Store?.Chat?.getModelsArray){ Store=window.Store; return Store; }
      if(attempts%8===0) console.log('[Enxame v2.7] aguardando Store... tentativa '+attempts+' webpack? '+(!!getWebpackRequire())+' cache? '+(!!getWebpackRequire()?.c));
      await new Promise(r=>setTimeout(r,500));
    }
    console.warn('[Enxame v2.7] waitForStore timeout após '+attempts+' tentativas');
    return Store||window.Store||null;
  }

  function normalizeChatId(chatId){
    if(!chatId) return null;
    let id = chatId.trim();
    if(id.includes('_')){
      const parts=id.split('_');
      for(let p of parts){
        if(p.includes('@c.us')||p.includes('@g.us')){
          id=p;
          break;
        }
      }
    }
    id = id.replace(/:\d+@/, '@');
    let m = id.match(/(\d+@c\.us)/);
    if(m) return m[1];
    m = id.match(/(\d+-\d+@g\.us)/);
    if(m) return m[1];
    m = id.match(/(120\d+@g\.us)/);
    if(m) return m[1];
    if(id.includes('@c.us')||id.includes('@g.us')) return id;
    return null;
  }

  function extractChatIdFromDOM(){
    try{
      const els=document.querySelectorAll('[data-id]');
      for(let el of els){
        const dataId=el.getAttribute('data-id');
        if(!dataId) continue;
        let m = dataId.match(/^(?:true|false)_([^_]+@(?:c|g)\.us)/);
        if(m && m[1]){
          const norm = normalizeChatId(m[1]);
          if(norm) return norm;
        }
        const parts=dataId.split('_');
        for(let p of parts){
          if(p.includes('@c.us')||p.includes('@g.us')){
            const norm = normalizeChatId(p);
            if(norm) return norm;
          }
        }
      }
      try{
        const html=document.documentElement.innerHTML;
        let gm = html.match(/"id":"(\d+@c\.us)"/);
        if(gm) return gm[1];
        let gg = html.match(/"id":"(\d+-\d+@g\.us)"/);
        if(gg) return gg[1];
      }catch{}
    }catch(e){ console.warn('[Enxame v2.7] extractChatIdFromDOM fail', e); }
    return null;
  }

  function getChatId(){
    const log=(via,id)=>{ const n=normalizeChatId(id); if(n){ console.log('[Enxame v2.7] getChatId OK via '+via, n, '(raw:'+id+')'); return n; } return id; };
    try{ const a=window.WPP?.chat?.getActiveChat?.(); if(a?.id?._serialized) return log('WPP.chat.getActiveChat', a.id._serialized); }catch{}
    try{ const id1=window.WPP?.chat?.getActiveChatId?.(); if(id1?._serialized) return log('getActiveChatId obj', id1._serialized); if(typeof id1==='string'&&id1.includes('@')) return log('getActiveChatId str', id1); }catch{}
    try{ const id2=window.WPP?.whatsapp?.ChatStore?.getActive?.(); if(id2?.id?._serialized) return log('ChatStore.getActive', id2.id._serialized); }catch{}
    try{
      const s=Store||window.Store||window.WPP?.whatsapp?.ChatStore;
      if(s){
        const models=s.getModelsArray? s.getModelsArray(): s.models;
        if(models && models.length){
          let active=models.find(c=>c.active)||models.find(c=>c.isActive)||models.find(c=>c.__x_active);
          if(active?.id?._serialized) return log('Store.active', active.id._serialized);
          if(active?.id) return log('Store.active toString', active.id.toString());
        }
      }
    }catch{}
    try{ if(window.Store?.Chat?.active?.id?._serialized) return log('Store.Chat.active', window.Store.Chat.active.id._serialized); }catch{}
    try{
      const domId=extractChatIdFromDOM();
      if(domId) return log('DOM data-id ROBUSTO normalized', domId);
    }catch{}
    try{
      const hashMatch=location.hash.match(/chat\/([^&?#]+)/);
      if(hashMatch){ const dec=decodeURIComponent(hashMatch[1]); if(dec.includes('@')) return log('location.hash', dec); }
    }catch{}
    console.warn('[Enxame v2.7] getChatId FALHOU - WPP? '+!!window.WPP?.chat?.sendFileMessage+' Store? '+(!!(Store||window.Store?.Chat))+' DOM? '+!!document.querySelector('[data-id]'));
    return null;
  }

  async function waitForWPP(timeout=12000){
    const start=Date.now();
    while(Date.now()-start<timeout){
      if(window.WPP?.chat?.sendFileMessage||window.WPP?.chat?.sendAudioMessage) return true;
      if(Store?.Chat||window.Store?.Chat) return true;
      await new Promise(r=>setTimeout(r,300));
    }
    return false;
  }

  async function sendPttViaWPP(chatId,file,opts){
    let waveformOpt=true;
    if(opts.waveform&&Array.isArray(opts.waveform)&&opts.waveform.length>=10) waveformOpt=opts.waveform;
    const normalized = normalizeChatId(chatId) || chatId;
    console.log('[Enxame v2.7] Envio via WPP', {chatId:normalized, raw:chatId, size:file.size, type:file.type, waveform:Array.isArray(waveformOpt)?waveformOpt.length+' barras':waveformOpt});
    if(window.WPP?.chat?.sendFileMessage){
      const result=await window.WPP.chat.sendFileMessage(normalized, file, {type:'audio', isPtt:true, mimetype:'audio/ogg; codecs=opus', waveform:waveformOpt});
      console.log('[Enxame v2.7] WPP sendFileMessage OK', result);
      return result;
    }
    if(window.WPP?.chat?.sendAudioMessage){
      const result=await window.WPP.chat.sendAudioMessage(normalized, file, {isPtt:true, mimetype:'audio/ogg; codecs=opus', waveform:waveformOpt});
      console.log('[Enxame v2.7] WPP sendAudioMessage OK', result);
      return result;
    }
    throw new Error('WPP nao disponivel');
  }

  async function sendPttViaStore(chatId,file,opts){
    const s=Store||window.Store;
    if(!s||!s.Chat) throw new Error('Store.Chat nao disponivel - webpack extraction falhou');
    const normalized = normalizeChatId(chatId) || chatId;
    console.log('[Enxame v2.7] Tentando via Store fallback', {chatId:normalized, raw:chatId, size:file.size});
    let chat=null;
    try{
      if(s.Chat.get) chat=s.Chat.get(normalized);
      if(!chat && s.Chat.getModelsArray) chat=s.Chat.getModelsArray().find(c=>c.id._serialized===normalized || c.id.toString()===normalized || c.id._serialized===chatId);
      if(!chat && s.Chat.models) chat=s.Chat.models.find(c=>c.id._serialized===normalized || c.id.toString()===normalized);
      if(!chat && normalized!==chatId && s.Chat.get) chat=s.Chat.get(chatId);
    }catch(e){ console.warn('[Enxame v2.7] Store.Chat.get fail', e); }
    if(!chat) throw new Error('Chat '+normalized+' nao encontrado no Store');
    if(typeof chat.sendFileMessage==='function'){
      const result=await chat.sendFileMessage(file, {type:'audio', isPtt:true, waveform:opts.waveform||true, duration:opts.duration});
      console.log('[Enxame v2.7] Store chat.sendFileMessage OK', result);
      return result;
    }
    if(s.Wap && typeof s.Wap.sendFileMessage==='function'){
      const result=await s.Wap.sendFileMessage(normalized, file, {type:'audio', isPtt:true});
      console.log('[Enxame v2.7] Store Wap.sendFileMessage OK', result);
      return result;
    }
    const mod = findInCache(m=>typeof m.sendFileMessage==='function') || findInModules(m=>typeof m.sendFileMessage==='function');
    if(mod){
      const result=await mod.sendFileMessage(normalized, file, {type:'audio', isPtt:true, waveform:opts.waveform||true});
      console.log('[Enxame v2.7] Modulo generico sendFileMessage OK', result);
      return result;
    }
    throw new Error('Nenhum metodo Store conseguiu enviar');
  }

  async function sendPttInPageWorld(file,opts){
    await waitForStore(15000);
    const chatId=getChatId();
    if(!chatId){
      const hasDOM=!!document.querySelector('[data-id]');
      const hasStore=!!(Store||window.Store?.Chat||window.WPP?.chat?.sendFileMessage);
      try{
        const dump=[...document.querySelectorAll('[data-id]')].slice(0,3).map(e=>e.getAttribute('data-id'));
        console.error('[Enxame v2.7] DUMP data-id para debug:', dump);
      }catch{}
      throw new Error('Abra um chat no WhatsApp para enviar audio. DOM? '+hasDOM+' Store/WPP? '+hasStore);
    }
    await waitForWPP(8000);
    try{ return await sendPttViaWPP(chatId,file,opts); }catch(e){ console.warn('[Enxame v2.7] WPP falhou, tentando Store - motivo:', e.message); }
    try{ return await sendPttViaStore(chatId,file,opts); }catch(e){ console.error('[Enxame v2.7] Store fallback falhou', e); throw new Error('Falha envio: '+e.message+' - Recarregue F5 e aguarde 10s'); }
  }

  window.addEventListener('message', async (event)=>{
    if(event.source!==window) return;
    const data=event.data;
    if(!data||data.__fromEnxameWPP) return;
    if(data.type==='ENXAME_SEND_PTT'){
      const {taskId,buffer,mime,waveform,duration,isWebM}=data;
      console.log('[Enxame v2.7] Ponte recebeu ENXAME_SEND_PTT', {taskId,size:buffer?.byteLength,mime,isWebM,duration});
      try{
        if(!buffer||!(buffer instanceof ArrayBuffer)) throw new Error('Buffer invalido');
        const blob=new Blob([buffer],{type:mime||'audio/webm; codecs=opus'});
        const file=new File([blob],isWebM?'ptt-'+Date.now()+'.webm':'ptt-'+Date.now()+'.ogg',{type:mime||'audio/webm; codecs=opus'});
        const result=await sendPttInPageWorld(file,{waveform,duration,isWebM});
        window.postMessage({type:'ENXAME_SEND_PTT_RESULT',taskId,ok:true,resultId:result?.id||result?.ack||'ok',__fromEnxameWPP:true},'*');
      }catch(err){
        console.error('[Enxame v2.7] Ponte erro envio', err);
        window.postMessage({type:'ENXAME_SEND_PTT_RESULT',taskId,ok:false,error:err.message||String(err),__fromEnxameWPP:true},'*');
      }
    }
    if(data.type==='ENXAME_PING'){
      const s=Store||window.Store||window.WPP?.whatsapp?.ChatStore;
      const hasWPP=!!window.WPP?.chat?.sendFileMessage;
      const hasStore=!!(s&&s.Chat&& (s.Chat.getModelsArray||s.Chat.models));
      const hasDOM=!!document.querySelector('[data-id]');
      const chatId=hasStore||hasDOM?getChatId():null;
      const req=getWebpackRequire();
      window.postMessage({type:'ENXAME_PONG',taskId:data.taskId,ready:hasWPP||hasStore||!!chatId,hasWPP,hasStore,hasDOM,chatId,webpackM:!!req?.m,webpackC:!!req?.c,__fromEnxameWPP:true},'*');
    }
    if(data.type==='ENXAME_DEBUG_DUMP'){
      const ids=[...document.querySelectorAll('[data-id]')].slice(0,20).map(e=>e.getAttribute('data-id'));
      const req=getWebpackRequire();
      window.postMessage({type:'ENXAME_DEBUG_DUMP_RESULT',taskId:data.taskId,ids,webpackM:!!req?.m,webpackC:!!req?.c,storeChat:!!(Store||window.Store?.Chat),wpp:!!window.WPP?.chat?.sendFileMessage,__fromEnxameWPP:true},'*');
    }
  });

  window.__ENXAME_WPP_READY__=false;
  let checkCount=0;
  const checkReady=setInterval(async ()=>{
    checkCount++;
    const s=extractStore();
    const hasWPP=!!window.WPP?.chat?.sendFileMessage;
    const hasStore=!!(s&&s.Chat);
    if(hasWPP||hasStore){
      window.__ENXAME_WPP_READY__=true;
      console.log('%c[Enxame v2.7] PRONTO - WPP? '+hasWPP+' Store? '+hasStore+' - ponte ZapVoice 48kHz mono 128k','background:#30d158;color:#fff;padding:5px 12px;border-radius:999px;font-weight:800');
      clearInterval(checkReady);
    }
    if(checkCount>80) clearInterval(checkReady);
  },500);
  setTimeout(()=>clearInterval(checkReady),35000);
  [600,1500,3500,7000,12000,20000].forEach(t=>setTimeout(()=>{ extractStore(); }, t));
  console.log('[Enxame v2.7] Listener ponte ativo + Store extractor v2.7 sem WAWebChatModels + DOM normalized');
})();
