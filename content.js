/* Enxame Zap v2.9.1 - Interface Apple Simplificada */
(function(){
  const DB_NAME='enxame_zap_db';
  const DB_VERSION=3;
  let db=null;
  let dbReadyPromise=null;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  function toast(msg){
    let t=$('#enxame-toast'); if(t) t.remove();
    t=document.createElement('div'); t.id='enxame-toast'; t.className='enxame-toast'; t.textContent=msg;
    document.body.appendChild(t); setTimeout(()=>{ if(t && t.parentNode) t.remove(); }, 3500);
  }
  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ===== IndexedDB =====
  function openDB(){
    if(dbReadyPromise) return dbReadyPromise;
    dbReadyPromise = new Promise((res, rej)=>{
      try {
        const req=indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded=(e)=>{
          const d=e.target.result;
          if(!d.objectStoreNames.contains('audios')) d.createObjectStore('audios',{keyPath:'id'});
          if(!d.objectStoreNames.contains('textos')) d.createObjectStore('textos',{keyPath:'id'});
          if(!d.objectStoreNames.contains('imagens')) d.createObjectStore('imagens',{keyPath:'id'});
          if(!d.objectStoreNames.contains('videos')) d.createObjectStore('videos',{keyPath:'id'});
          if(!d.objectStoreNames.contains('funis')) d.createObjectStore('funis',{keyPath:'id'});
        };
        req.onsuccess=()=>{ db=req.result; db.onclose=()=>{ db=null; dbReadyPromise=null; }; res(db); };
        req.onerror=()=>{ dbReadyPromise=null; rej(req.error); };
        req.onblocked=()=>{};
      } catch(err){ dbReadyPromise=null; rej(err); }
    });
    return dbReadyPromise;
  }
  async function ensureDB(){ if(db) return db; try { return await openDB(); } catch(e){ throw e; } }
  async function idbPut(store, obj){
    await ensureDB();
    return new Promise((res,rej)=>{
      try {
        const tx=db.transaction(store,'readwrite');
        tx.oncomplete=()=>res();
        tx.onerror=()=>rej(tx.error);
        tx.onabort=()=>rej(tx.error||new Error('abort'));
        const st=tx.objectStore(store);
        const req=st.put(obj);
        req.onerror=()=>rej(req.error);
      } catch(e){ rej(e); }
    });
  }
  async function idbGetAll(store){
    await ensureDB();
    return new Promise((res,rej)=>{
      try {
        const tx=db.transaction(store,'readonly');
        const req=tx.objectStore(store).getAll();
        req.onsuccess=()=>res(req.result||[]);
        req.onerror=()=>rej(req.error);
      } catch(e){ rej(e); }
    });
  }
  async function idbGet(store,id){
    await ensureDB();
    return new Promise((res,rej)=>{
      try {
        const tx=db.transaction(store,'readonly');
        const req=tx.objectStore(store).get(id);
        req.onsuccess=()=>res(req.result);
        req.onerror=()=>rej(req.error);
      } catch(e){ rej(e); }
    });
  }
  async function idbDel(store,id){
    await ensureDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(store,'readwrite');
      tx.oncomplete=()=>res();
      tx.onerror=()=>rej(tx.error);
      tx.objectStore(store).delete(id);
    });
  }

  const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  function getContactName(){
    try {
      const h=document.querySelector('header span[title]') || document.querySelector('[data-testid="conversation-info-header-chat-title"]') || document.querySelector('header [title]');
      return (h?.getAttribute('title') || h?.textContent?.trim() || 'lead').trim();
    } catch { return 'lead'; }
  }
  function replaceVars(text){
    const full=getContactName(); const primeiro=full.split(' ')[0]||'você';
    return (text||'').replace(/\{\{nome\}\}/gi, primeiro).replace(/\{\{nome_completo\}\}/gi, full);
  }

  function injectMainWorld(){
    try {
      if(!window.EnxameBridge) return;
      window.EnxameBridge.request('ping', {}, { timeoutMs: 5000 })
        .then(() => { updateWPPDot(); })
        .catch(() => {});
    } catch(e){}
  }

  // ===== ENVIO TEXTO =====
  async function sendTextoInstant(text){
    const final=replaceVars(text);
    closeModal();
    toast('Enviando...');
    try {
      const sels=['div[contenteditable="true"][data-tab="10"]','div[contenteditable="true"][data-lexical-editor="true"]','footer div[contenteditable="true"]','[data-testid="conversation-compose-box-input"]'];
      let input=null; for(const sel of sels){ input=document.querySelector(sel); if(input) break; }
      if(input){
        input.focus();
        document.execCommand('insertText', false, final);
        input.dispatchEvent(new InputEvent('input',{bubbles:true}));
        await new Promise(r=>setTimeout(r, 90));
        const btn=document.querySelector('[data-testid="compose-btn-send"]') || document.querySelector('span[data-icon="send"]')?.closest('button') || document.querySelector('button[aria-label="Enviar"]');
        if(btn) btn.click(); else { input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true})); }
        toast('Enviado');
        return { ok: true, strategy: 'DOM' };
      }
    } catch(e){}
    const err = new Error('Abra uma conversa para enviar (NO_CHAT_OPEN)');
    err.code = 'NO_CHAT_OPEN';
    toast(err.message);
    throw err;
  }

  // ===== ENVIO ÁUDIO =====
  async function sendAudioHQInstant(blobOrItem){
    let item = (blobOrItem && blobOrItem.blob) ? blobOrItem : null;
    let blob = item ? item.blob : blobOrItem;
    let preWaveform = item?.waveform;
    let preDuration = item?.duration;
    let preIsWebM = item?.isWebM || (blob?.type && blob.type.includes('webm'));

    if(item && item.id && (item.schema !== 2 || item.format !== 'ogg-opus' || preIsWebM)){
      try {
        if(window.EnxameAudioPipeline?.processFileForPTT){
          toast('Processando...');
          const processed = await window.EnxameAudioPipeline.processFileForPTT(blob);
          item.blob = processed.blob;
          item.waveform = processed.waveform;
          item.duration = processed.duration;
          item.format = 'ogg-opus';
          item.schema = 2;
          item.isWebM = false;
          item.updatedAt = Date.now();
          await idbPut('audios', item);
          blob = item.blob;
          preWaveform = item.waveform;
          preDuration = item.duration;
          preIsWebM = false;
        }
      } catch(mErr){}
    }

    closeModal();
    toast('Enviando...');
    
    try {
      if(!window.EnxameBridge){
        const err = new Error('Ponte não conectada (BRIDGE_NOT_FOUND)');
        err.code = 'BRIDGE_NOT_FOUND';
        throw err;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.EnxameBridge.request('send_media', {
        buffer: arrayBuffer,
        mime: blob.type || 'audio/ogg; codecs=opus',
        waveform: preWaveform || true,
        duration: preDuration || 5,
        isWebM: !!preIsWebM
      }, {
        timeoutMs: 25000,
        onProgress: () => {
          toast('Enviando...');
        }
      });

      toast('Enviado');
      return { ok: true, strategy: res.strategy, stage: res.stage, ms: res.ms };
    } catch(e){
      const errCode = e.code || 'SEND_FAILED';
      toast(`Erro ao enviar (${errCode})`);
      throw e;
    }
  }

  async function sendImagemInstant(blob, asDoc=false, caption=''){
    closeModal();
    if(!blob){
      const err = new Error('Selecione uma imagem (INVALID_BLOB)');
      err.code = 'INVALID_BLOB';
      toast(err.message);
      throw err;
    }
    toast('Enviando...');
    try {
      if(!window.EnxameDomSender){
        const err = new Error('Módulo de envio indisponível (DOM_SENDER_NOT_FOUND)');
        err.code = 'DOM_SENDER_NOT_FOUND';
        throw err;
      }
      const res = await window.EnxameDomSender.send({
        kind: 'image',
        blob,
        asDocument: !!asDoc,
        caption: caption || ''
      });

      toast('Enviado');

      if(res.confirmed && typeof res.confirmed.then === 'function'){
        res.confirmed.then((conf)=>{
          if(conf && !conf.verified){
            toast('Enviado');
          }
        }).catch(()=>{});
      }

      return res;
    } catch(err){
      const code = err.code || 'SEND_ERROR';
      if(err.mayHaveSent){
        toast(`Pode ter sido enviado (${code})`);
      } else {
        toast(`Erro ao enviar (${code})`);
      }
      throw err;
    }
  }

  async function sendVideoInstant(blob, caption='', asDoc=false){
    closeModal();
    if(!blob){
      const err = new Error('Selecione um vídeo (INVALID_BLOB)');
      err.code = 'INVALID_BLOB';
      toast(err.message);
      throw err;
    }
    toast('Enviando...');
    try {
      if(!window.EnxameDomSender){
        const err = new Error('Módulo de envio indisponível (DOM_SENDER_NOT_FOUND)');
        err.code = 'DOM_SENDER_NOT_FOUND';
        throw err;
      }
      const res = await window.EnxameDomSender.send({
        kind: 'video',
        blob,
        asDocument: !!asDoc,
        caption: caption || ''
      });

      toast('Enviado');

      if(res.confirmed && typeof res.confirmed.then === 'function'){
        res.confirmed.then((conf)=>{
          if(conf && !conf.verified){
            toast('Enviado');
          }
        }).catch(()=>{});
      }

      return res;
    } catch(err){
      const code = err.code || 'SEND_ERROR';
      if(err.mayHaveSent){
        toast(`Pode ter sido enviado (${code})`);
      } else {
        toast(`Erro ao enviar (${code})`);
      }
      throw err;
    }
  }

  // ===== BACKUP =====
  async function exportFunnelZip(funnelId=null){
    try {
      await ensureDB();
      const funis=funnelId ? [await idbGet('funis', funnelId)].filter(Boolean) : await idbGetAll('funis');
      if(!funis.length){ toast('Nenhum funil encontrado (EMPTY)'); return; }
      const zip=new JSZip();
      if(funnelId){
        const funil=funis[0];
        zip.file('funil.json', JSON.stringify(funil, null, 2));
        for(const node of funil.nodes){
          if(node.mediaId){
            const map={audio:'audios', texto:'textos', imagem:'imagens', video:'videos'};
            const store=map[node.tipo]||'audios';
            const media=await idbGet(store, node.mediaId);
            if(media?.blob) zip.file(`midias/${node.tipo}_${node.id}_${(media.nome||'media').replace(/\s+/g,'_')}`, media.blob);
            else if(media?.conteudo) zip.file(`midias/${node.tipo}_${node.id}.txt`, media.conteudo);
          } else if(node.conteudo) zip.file(`midias/${node.tipo}_${node.id}.txt`, node.conteudo);
        }
        const blob=await zip.generateAsync({type:'blob'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`funil_${funil.nome.replace(/\s+/g,'_')}.zip`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 10000);
        toast('Download iniciado');
      } else {
        for(const funil of funis) zip.file(`funis/${funil.nome.replace(/\s+/g,'_')}.json`, JSON.stringify(funil,null,2));
        const audios=await idbGetAll('audios'); const imgs=await idbGetAll('imagens'); const vids=await idbGetAll('videos');
        [...audios,...imgs,...vids].forEach(m=>{ if(m.blob) zip.file(`midias_geral/${m.id}_${(m.nome||'media').replace(/\s+/g,'_')}`, m.blob); });
        const blob=await zip.generateAsync({type:'blob'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`backup_${new Date().toISOString().slice(0,10)}.zip`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
        toast('Download iniciado');
      }
    } catch(e){ toast('Erro ao exportar (EXPORT_ERROR)'); }
  }
  async function importFunnelFromFile(file){
    try {
      if(file.name.endsWith('.zip')){ toast('Extraia o arquivo antes de importar'); return; }
      const txt=await file.text();
      const data=JSON.parse(txt);
      const list=Array.isArray(data) ? data : (data.nodes ? [data] : data.funis || [data]);
      await ensureDB();
      for(const f of list){ if(!f.id) f.id=uid(); await idbPut('funis', f); }
      toast('Importado');
      renderModal('funis');
    } catch(e){ toast('Erro ao importar (IMPORT_ERROR)'); }
  }
  async function dispararFunil(funnelId){
    try {
      await ensureDB();
      const funil=await idbGet('funis', funnelId);
      if(!funil){ toast('Funil não encontrado (NOT_FOUND)'); return; }
      const sorted=[...(funil.nodes||[])].sort((a,b)=>(a.ordem||0)-(b.ordem||0));
      if(!sorted.length){ toast('Funil sem mensagens (EMPTY)'); return; }
      toast('Disparando funil...');
      for(let i=0;i<sorted.length;i++){
        const node=sorted[i];
        const delay=node.delay||(node.tipo==='audio'?2400:1200);
        const jitter=400+Math.random()*1200;
        if(i>0) await new Promise(r=>setTimeout(r, delay+jitter));
        try {
          if(node.tipo==='audio'){
            const m=await idbGet('audios', node.mediaId);
            if(m) await sendAudioHQInstant(m);
            else throw new Error('Áudio não encontrado');
          }
          else if(node.tipo==='texto'){
            const m=node.mediaId ? await idbGet('textos', node.mediaId) : null;
            const textContent = m?.conteudo || node.conteudo || '';
            await sendTextoInstant(textContent);
          }
          else if(node.tipo==='imagem'){
            const m=await idbGet('imagens', node.mediaId);
            if(!m?.blob) throw new Error('Imagem não encontrada');
            await sendImagemInstant(m.blob, !!node.asDocument, node.legenda || '');
          }
          else if(node.tipo==='video'){
            const m=await idbGet('videos', node.mediaId);
            if(!m?.blob) throw new Error('Vídeo não encontrado');
            await sendVideoInstant(m.blob, node.legenda || '', !!node.asDocument);
          }
        } catch(stepErr){
          const code = stepErr.code || 'STEP_FAILED';
          toast(`Interrompido no passo ${i+1} (${code})`);
          return;
        }
      }
      toast('Funil concluído');
    } catch(e){
      toast('Erro no funil (FUNNEL_ERROR)');
    }
  }

  // ===== Hidden file input =====
  function ensureHiddenFileInput(){
    if($('#enxame-hidden-file')) return $('#enxame-hidden-file');
    const inp=document.createElement('input');
    inp.type='file'; inp.id='enxame-hidden-file'; inp.style.display='none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async (e)=>{
      const file=e.target.files[0];
      if(!file) return;
      const type=inp.dataset.type;
      const editingId=inp.dataset.editingId||null;
      try {
        if(type==='audio'){
          toast('Processando...');
          let processed = file;
          let waveform=null, duration=null;
          if(window.EnxameAudioPipeline?.processFileForPTT){
            const res = await window.EnxameAudioPipeline.processFileForPTT(file);
            processed = res.blob;
            waveform = res.waveform;
            duration = res.duration;
          }
          if(editingId && window._enxamePendingEditForm && window._enxamePendingEditForm.id===editingId){
            window._enxamePendingEditForm.pendingFile=processed;
            window._enxamePendingEditForm.waveform=waveform;
            window._enxamePendingEditForm.duration=duration;
            const previewEl=$('#enxame-form-file-preview');
            if(previewEl){
              const url=URL.createObjectURL(processed);
              const durStr = duration ? (String(duration).replace('.', ',') + ' s') : '';
              const sizeStr = processed.size ? `${Math.round(processed.size / 1024)} KB` : '';
              const metaStr = [durStr, sizeStr].filter(Boolean).join(' · ');
              previewEl.innerHTML=`<audio controls src="${url}" style="width:100%;height:40px"></audio><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name)} · ${escapeHtml(metaStr)}</div><div class="enxame-card-audio-wave" style="margin-top:8px">${(waveform||Array(18).fill(20)).slice(0,18).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*22}px"></div>`).join('')}</div>`;
            }
            toast('Carregado');
          } else {
            window._enxamePendingFile=processed;
            window._enxamePendingWaveform=waveform;
            window._enxamePendingDuration=duration;
            openMediaForm(type, null, processed, null, waveform, duration);
          }
        } else {
          if(editingId){
            if(window._enxamePendingEditForm && window._enxamePendingEditForm.id===editingId){
              window._enxamePendingEditForm.pendingFile=file;
              const previewEl=$('#enxame-form-file-preview');
              if(previewEl){
                if(type==='imagem'){
                  const url=URL.createObjectURL(file);
                  previewEl.innerHTML=`<img src="${url}" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px"><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name)}</div>`;
                } else if(type==='video'){
                  const url=URL.createObjectURL(file);
                  previewEl.innerHTML=`<video src="${url}" controls muted style="width:100%;max-height:160px;border-radius:12px"></video><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name)}</div>`;
                }
              }
              toast('Carregado');
            } else {
              await ensureDB();
              const map={audio:'audios', imagem:'imagens', video:'videos'};
              const store=map[type];
              const existing=await idbGet(store, editingId);
              if(existing){
                existing.blob=file;
                existing.updatedAt=Date.now();
                await idbPut(store, existing);
                toast('Salvo');
                updateBadges();
                renderModal(type);
              }
            }
          } else {
            window._enxamePendingFile=file;
            openMediaForm(type, null, file);
          }
        }
      } catch(err){ toast('Erro ao processar (FILE_ERROR)'); }
      inp.value='';
      delete inp.dataset.editingId;
    });
    return inp;
  }

  // ===== Pills bar =====
  function ensurePillsBar(){
    if($('#enxame-pills-bar')) return;
    const footer=document.querySelector('footer') || document.querySelector('[data-testid="conversation-compose-box"]');
    if(!footer){ setTimeout(ensurePillsBar, 800); return; }
    const container=footer.parentElement || footer.parentNode;
    if(!container){ setTimeout(ensurePillsBar, 800); return; }
    if(container.querySelector('#enxame-pills-bar')) return;
    const bar=document.createElement('div'); bar.id='enxame-pills-bar';
    const pills=[
      {id:'audio', icon:'🎙️', label:'Áudio'},
      {id:'texto', icon:'📝', label:'Texto'},
      {id:'imagem', icon:'🖼️', label:'Imagem'},
      {id:'video', icon:'🎬', label:'Vídeo'},
      {id:'funis', icon:'⚡', label:'Funis', primary:true},
    ];
    pills.forEach(p=>{
      const btn=document.createElement('button'); btn.className='enxame-pill'+(p.primary?' enxame-pill-active':''); btn.dataset.type=p.id;
      const badge=`<span class="enxame-badge" id="badge-${p.id}">0</span>`;
      const dot=p.id==='funis'?` <span class="enxame-status-dot" id="enxame-wpp-dot" title="Pronto"></span>`:'';
      btn.innerHTML=`<span class="enxame-pill-icon">${p.icon}</span>${p.label} ${badge}${dot}`;
      btn.onclick=()=>openModal(p.id);
      bar.appendChild(btn);
    });
    if(footer.nextSibling) container.insertBefore(bar, footer.nextSibling);
    else container.appendChild(bar);
    updateBadges();
    updateWPPDot();
    setTimeout(()=>{ const last=bar.lastElementChild; if(last) last.scrollIntoView({behavior:'smooth', block:'nearest', inline:'end'}); }, 300);
  }
  async function updateBadges(){
    try {
      await ensureDB();
      const stores=['audios','textos','imagens','videos','funis'];
      const ids=['audio','texto','imagem','video','funis'];
      for(let i=0;i<stores.length;i++){
        try {
          const all=await idbGetAll(stores[i]);
          const el=document.getElementById(`badge-${ids[i]}`);
          if(el) el.textContent=all.length;
        } catch {}
      }
    } catch(e){}
  }
  async function updateWPPDot(){
    const dot=$('#enxame-wpp-dot'); if(!dot) return;
    try {
      if(!window.EnxameBridge){
        dot.style.background='#86868b';
        dot.title='Ponte desconectada';
        return;
      }
      const res = await window.EnxameBridge.request('capabilities', {}, { timeoutMs: 4000 });
      const caps = res.data || {};
      const ready = !!(caps.hasWpp || caps.hasStoreChat);
      if(ready){
        dot.style.background='#30d158';
        dot.title='Pronto';
      } else {
        dot.style.background='#ff9f0a';
        dot.title='Carregando...';
      }
    } catch(e){
      dot.style.background='#86868b';
      dot.title='Aguardando';
    }
  }

  // ===== MODAL APPLE =====
  let currentModalType=null;
  let currentRecording=null;
  let recordingTimerInt=null;
  function openModal(type){
    currentModalType=type;
    closeModal();
    const overlay=document.createElement('div'); overlay.id='enxame-modal';
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeModal(); });
    const card=document.createElement('div'); card.className='enxame-modal-card';
    const header=document.createElement('div'); header.className='enxame-modal-header';
    header.innerHTML=`<div class="enxame-modal-title-wrap"><div class="enxame-modal-title">${getTitle(type)}</div><div class="enxame-modal-subtitle">${getSubtitle(type)}</div></div><button class="enxame-modal-close">✕</button>`;
    header.querySelector('.enxame-modal-close').onclick=closeModal;
    const toolbar=document.createElement('div'); toolbar.className='enxame-toolbar';
    if(type==='funis'){
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="btn-export-all">Exportar tudo</button><label class="enxame-btn enxame-btn-secondary enxame-btn-small" style="cursor:pointer">Importar<input type="file" id="import-funil" accept=".json,.zip,.enxame.zip" hidden></label><button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-new-funil">Novo funil</button>`;
    } else if(type==='audio'){
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="btn-add-audio">Importar áudio</button><button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-record-audio">Gravar áudio</button>`;
    } else {
      const addLabels = { texto: 'Adicionar texto', imagem: 'Adicionar imagem', video: 'Adicionar vídeo' };
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-add-${type}">${addLabels[type] || 'Adicionar'}</button>`;
    }
    const body=document.createElement('div'); body.className='enxame-modal-body'; body.id='enxame-modal-body';
    card.appendChild(header); card.appendChild(toolbar); card.appendChild(body);
    overlay.appendChild(card); document.body.appendChild(overlay);
    if(type==='funis'){
      $('#btn-export-all').onclick=()=>exportFunnelZip();
      $('#btn-new-funil').onclick=()=>{ closeModal(); if(chrome?.runtime?.sendMessage) chrome.runtime.sendMessage({type:'ENXAME_OPEN_BUILDER'}); else window.open(chrome.runtime.getURL('builder.html'), '_blank'); };
      $('#import-funil').onchange=(e)=>{ if(e.target.files[0]) importFunnelFromFile(e.target.files[0]); };
    } else {
      const addBtn=$('#btn-add-'+type);
      if(addBtn){
        addBtn.onclick=()=>{
          if(type==='texto'){
            openTextForm(null);
          } else {
            const hidden=ensureHiddenFileInput();
            hidden.dataset.type=type;
            delete hidden.dataset.editingId;
            hidden.accept= type==='audio' ? 'audio/*' : type==='imagem' ? 'image/*' : 'video/*';
            hidden.click();
          }
        };
      }
      if(type==='audio'){
        const recBtn=$('#btn-record-'+type);
        if(recBtn) recBtn.onclick=()=>openAudioRecorderUI();
      }
    }
    renderModal(type);
  }
  function closeModal(){
    if(currentRecording){
      try { currentRecording.dispose?.(); } catch {}
      currentRecording=null;
    }
    if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
    const m=$('#enxame-modal'); if(m) m.remove(); window._enxamePendingEditForm=null;
  }
  function closeDeleteModal(){
    const m=$('#enxame-delete-modal'); if(m) m.remove();
  }
  function getTitle(t){
    const m={audio:'Áudios', texto:'Textos', imagem:'Imagens', video:'Vídeos', funis:'Funis'};
    return m[t]||t;
  }
  function getSubtitle(t){
    const m={
      audio:'Grave ou importe',
      texto:'Use {{nome}} para personalizar',
      imagem:'Envio em resolução original',
      video:'Envio em resolução original',
      funis:'Sequências de mensagens'
    };
    return m[t]||'';
  }

  // ===== FORMS =====
  function openTextForm(existingItem){
    const body=$('#enxame-modal-body'); if(!body) return;
    const isEdit=!!existingItem;
    body.innerHTML=`
      <div class="enxame-form">
        <div class="enxame-form-row">
          <label class="enxame-form-label">Nome</label>
          <input id="enxame-form-nome" class="enxame-form-input" placeholder="Ex.: Mensagem inicial" value="${escapeHtml(existingItem?.nome||'')}" maxlength="60">
        </div>
        <div class="enxame-form-row">
          <label class="enxame-form-label">Conteúdo</label>
          <textarea id="enxame-form-conteudo" class="enxame-form-textarea" placeholder="Olá {{nome}}, tudo bem?">${escapeHtml(existingItem?.conteudo||'')}</textarea>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-form-cancel" style="flex:1">Cancelar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-form-save" style="flex:1">Salvar</button>
        </div>
      </div>
    `;
    $('#enxame-form-cancel').onclick=()=>renderModal('texto');
    $('#enxame-form-save').onclick=async ()=>{
      const nome=$('#enxame-form-nome').value.trim();
      const conteudo=$('#enxame-form-conteudo').value.trim();
      if(!nome){ toast('Digite um nome (VALIDATION_ERROR)'); return; }
      if(!conteudo){ toast('Digite o conteúdo (VALIDATION_ERROR)'); return; }
      try {
        await ensureDB();
        const obj={ id: existingItem?.id || uid(), nome, conteudo, createdAt: existingItem?.createdAt || Date.now(), updatedAt: Date.now() };
        await idbPut('textos', obj);
        toast('Salvo');
        updateBadges();
        renderModal('texto');
      } catch(e){ toast('Erro ao salvar (SAVE_ERROR)'); }
    };
    setTimeout(()=>$('#enxame-form-nome')?.focus(), 100);
  }

  function openMediaForm(type, existingItem, pendingFile, suggestedName, preWaveform, preDuration){
    const body=$('#enxame-modal-body'); if(!body) return;
    const isEdit=!!existingItem;
    const file=pendingFile || existingItem?.blob || null;
    let previewHtml='';
    if(file){
      try {
        const url=URL.createObjectURL(file);
        if(type==='audio'){
          const dur = preDuration || existingItem?.duration;
          const durStr = dur ? (String(dur).replace('.', ',') + ' s') : '';
          const sizeStr = file.size ? `${Math.round(file.size / 1024)} KB` : '';
          const metaStr = [durStr, sizeStr].filter(Boolean).join(' · ');
          const wf = preWaveform || existingItem?.waveform;
          previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><audio controls src="${url}" style="width:100%;height:40px"></audio><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'Áudio')} · ${escapeHtml(metaStr)}</div>${wf?`<div class="enxame-card-audio-wave" style="margin-top:10px">${wf.slice(0,24).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*24}px"></div>`).join('')}</div>`:''}</div>`;
        } else if(type==='imagem') previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><img src="${url}" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px"><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'Imagem')}</div></div>`;
        else if(type==='video') previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><video src="${url}" controls muted style="width:100%;max-height:180px;border-radius:12px"></video><div style="font-size:12px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'Vídeo')}</div></div>`;
      } catch {}
    } else {
      previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview" style="color:#86868b;font-size:13px">Nenhum arquivo selecionado</div>`;
    }

    body.innerHTML=`
      <div class="enxame-form">
        <div class="enxame-form-row">
          <label class="enxame-form-label">Nome</label>
          <input id="enxame-form-nome" class="enxame-form-input" placeholder="Nome do item" value="${escapeHtml(existingItem?.nome||suggestedName||'')}" maxlength="80">
        </div>
        ${previewHtml}
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="enxame-form-trocar" style="flex:1">Trocar arquivo</button>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-form-cancel" style="flex:1">Cancelar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-form-save" style="flex:1">Salvar</button>
        </div>
      </div>
    `;
    window._enxamePendingEditForm={ id: existingItem?.id || null, type, pendingFile: file, existingItem, waveform: preWaveform || existingItem?.waveform, duration: preDuration || existingItem?.duration };

    $('#enxame-form-cancel').onclick=()=>{
      window._enxamePendingEditForm=null;
      window._enxamePendingFile=null;
      window._enxamePendingWaveform=null;
      renderModal(type);
    };
    $('#enxame-form-trocar').onclick=()=>{
      const hidden=ensureHiddenFileInput();
      hidden.dataset.type=type;
      if(existingItem) hidden.dataset.editingId=existingItem.id;
      hidden.accept= type==='audio' ? 'audio/*' : type==='imagem' ? 'image/*' : 'video/*';
      hidden.click();
    };
    $('#enxame-form-save').onclick=async ()=>{
      const nome=$('#enxame-form-nome').value.trim();
      const state=window._enxamePendingEditForm;
      const finalFile=state?.pendingFile || file;
      if(!nome){ toast('Digite um nome (VALIDATION_ERROR)'); return; }
      if(!finalFile){ toast('Selecione um arquivo (VALIDATION_ERROR)'); return; }
      try {
        await ensureDB();
        const map={audio:'audios', imagem:'imagens', video:'videos'};
        const store=map[type];
        const obj={
          id: existingItem?.id || uid(),
          nome,
          blob: finalFile,
          waveform: state?.waveform || preWaveform,
          duration: state?.duration || preDuration,
          schema: type === 'audio' ? 2 : (existingItem?.schema || 1),
          format: type === 'audio' ? 'ogg-opus' : (existingItem?.format || type),
          createdAt: existingItem?.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        await idbPut(store, obj);
        toast('Salvo');
        window._enxamePendingEditForm=null;
        window._enxamePendingFile=null;
        window._enxamePendingWaveform=null;
        window._enxamePendingDuration=null;
        updateBadges();
        renderModal(type);
      } catch(e){ toast('Erro ao salvar (SAVE_ERROR)'); }
    };
  }

  // ===== DELETE CONFIRM MODAL =====
  function openDeleteConfirmModal(itemId, itemType, itemName, storeName){
    closeDeleteModal();
    const overlay=document.createElement('div'); overlay.id='enxame-delete-modal';
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeDeleteModal(); });
    const card=document.createElement('div'); card.className='enxame-delete-card';
    card.innerHTML=`
      <div class="enxame-delete-icon">🗑️</div>
      <div class="enxame-delete-title">Excluir?</div>
      <div class="enxame-delete-sub">Deseja excluir "${escapeHtml(itemName||'este item')}"?</div>
      <div class="enxame-delete-actions">
        <button class="enxame-btn enxame-btn-secondary" id="enxame-delete-cancel" style="flex:1">Cancelar</button>
        <button class="enxame-btn enxame-btn-danger" id="enxame-delete-confirm" style="flex:1">Excluir</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    $('#enxame-delete-cancel').onclick=closeDeleteModal;
    $('#enxame-delete-confirm').onclick=async ()=>{
      const btn=$('#enxame-delete-confirm');
      if(btn){ btn.textContent='Excluindo...'; btn.disabled=true; }
      try {
        await ensureDB();
        await idbDel(storeName, itemId);
        toast('Excluído');
        closeDeleteModal();
        updateBadges();
        renderModal(itemType);
      } catch(e){
        toast('Erro ao excluir (DELETE_ERROR)');
        closeDeleteModal();
      }
    };
  }

  // ===== RECORDER UI APPLE =====
  function openProcessingModal(){
    const overlay=document.createElement('div'); overlay.id='enxame-processing-modal';
    overlay.innerHTML=`<div class="enxame-processing-card"><div class="enxame-processing-spinner"></div><div class="enxame-processing-title">Processando...</div></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }
  function closeProcessingModal(){ const m=$('#enxame-processing-modal'); if(m) m.remove(); }

  async function openAudioRecorderUI(){
    const body=$('#enxame-modal-body'); if(!body) return;
    if(!window.EnxameAudioPipeline || !window.EnxameAudioPipeline.startRecordingHQ){
      toast('Microfone indisponível (MIC_ERROR)');
      return;
    }
    body.innerHTML=`
      <div class="enxame-recorder">
        <div class="enxame-recorder-header">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="enxame-rec-dot" id="enxame-rec-dot"></div>
            <span id="enxame-rec-status" style="font-weight:700;font-size:14px">Gravando</span>
          </div>
          <span id="enxame-rec-timer" style="font-variant-numeric:tabular-nums;font-weight:700;font-size:14px">00:00</span>
        </div>
        <div class="enxame-recorder-wave" id="enxame-rec-wave">${Array(32).fill(0).map(()=>`<div class="enxame-rec-bar" style="height:6px"></div>`).join('')}</div>
        <div class="enxame-volume-area">
          <div class="enxame-volume-label"><span>Volume</span><span id="enxame-volume-pct">0%</span></div>
          <div class="enxame-volume-bg"><div id="enxame-volume-fill" class="enxame-volume-fill" style="width:0%"></div></div>
          <div id="enxame-volume-status" style="font-size:11.5px;color:#86868b;margin-top:6px">Fale para ver o volume</div>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-rec-cancel" style="flex:1">Cancelar</button>
          <button class="enxame-btn enxame-btn-secondary" id="enxame-rec-pause" style="flex:1">Pausar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-rec-stop" style="flex:1.2">Parar</button>
        </div>
      </div>
    `;
    const dotEl=$('#enxame-rec-dot');
    const statusTextEl=$('#enxame-rec-status');
    const waveEl=$('#enxame-rec-wave');
    const fillEl=$('#enxame-volume-fill');
    const pctEl=$('#enxame-volume-pct');
    const statusEl=$('#enxame-volume-status');
    const timerEl=$('#enxame-rec-timer');
    const pauseBtn=$('#enxame-rec-pause');

    recordingTimerInt=setInterval(()=>{
      if(!currentRecording) return;
      const elapsedMs = currentRecording.elapsedMs ? currentRecording.elapsedMs() : 0;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const m=String(Math.floor(elapsedSec/60)).padStart(2,'0');
      const s=String(elapsedSec%60).padStart(2,'0');
      if(timerEl) timerEl.textContent=`${m}:${s}`;
      if(elapsedSec>=120){
        toast('Limite atingido');
        const stopBtn=$('#enxame-rec-stop'); if(stopBtn) stopBtn.click();
      }
    }, 150);

    try {
      currentRecording = await window.EnxameAudioPipeline.startRecordingHQ((vol)=>{
        if(!currentRecording || currentRecording.isPaused?.()) return;
        if(fillEl) fillEl.style.width=`${vol}%`;
        if(pctEl) pctEl.textContent=`${vol}%`;
        if(vol<10){ fillEl.style.background='#86868b'; if(statusEl) statusEl.textContent='Fale mais perto'; }
        else if(vol<30){ fillEl.style.background='#ff9f0a'; if(statusEl) statusEl.textContent='Bom'; }
        else if(vol<75){ fillEl.style.background='#30d158'; if(statusEl) statusEl.textContent='Ótimo'; }
        else { fillEl.style.background='#ff3b30'; if(statusEl) statusEl.textContent='Volume alto'; }
        if(waveEl){
          const bars=waveEl.children;
          for(let i=0;i<bars.length;i++){
            const h = 6 + (vol/100)*32 + Math.sin(Date.now()/200 + i)*4;
            bars[i].style.height=`${Math.max(4,h)}px`;
            bars[i].style.opacity= vol>5 ? '1' : '0.35';
          }
        }
      });
    } catch(e){
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">🎙️</div><div class="enxame-empty-title">Erro no microfone</div><div class="enxame-empty-sub">Permita o acesso ao microfone (MIC_ERROR)</div><button class="enxame-btn enxame-btn-primary enxame-btn-small" style="margin-top:12px" onclick="location.reload()">Recarregar</button></div>`;
      return;
    }

    if(pauseBtn){
      pauseBtn.onclick=()=>{
        if(!currentRecording) return;
        if(currentRecording.isPaused?.()){
          currentRecording.resume?.();
          pauseBtn.textContent='Pausar';
          if(statusTextEl) statusTextEl.textContent='Gravando';
          if(dotEl) dotEl.classList.remove('enxame-rec-paused');
          if(waveEl) waveEl.classList.remove('enxame-rec-paused');
        } else {
          currentRecording.pause?.();
          pauseBtn.textContent='Continuar';
          if(statusTextEl) statusTextEl.textContent='Pausado';
          if(dotEl) dotEl.classList.add('enxame-rec-paused');
          if(waveEl) waveEl.classList.add('enxame-rec-paused');
          if(fillEl) fillEl.style.width='0%';
          if(pctEl) pctEl.textContent='0%';
          if(statusEl) statusEl.textContent='Pausado';
        }
      };
    }

    $('#enxame-rec-cancel').onclick=()=>{
      try { currentRecording?.dispose?.(); } catch {}
      currentRecording=null;
      if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
      toast('Gravação cancelada');
      renderModal('audio');
    };

    $('#enxame-rec-stop').onclick=async ()=>{
      if(!currentRecording) return;
      const recordedMs = currentRecording.elapsedMs ? currentRecording.elapsedMs() : 0;
      if(recordedMs < 1000){
        toast('Gravação muito curta');
        try { currentRecording.dispose?.(); } catch {}
        currentRecording=null;
        if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
        renderModal('audio');
        return;
      }

      const btn=$('#enxame-rec-stop');
      if(btn){ btn.textContent='Processando...'; btn.disabled=true; }
      const processingModal = openProcessingModal();
      if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
      try {
        const result = await Promise.race([
          currentRecording.stopFast(),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timeout')), 35000))
        ]);
        closeProcessingModal();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const defaultName = `Gravação ${timeStr}`;
        openMediaForm('audio', null, result.blob, defaultName, result.waveform, result.duration);
      } catch(e){
        closeProcessingModal();
        toast('Erro ao processar áudio (AUDIO_PROCESS_ERROR)');
        renderModal('audio');
      } finally {
        currentRecording=null;
        if(processingModal) processingModal.remove();
      }
    };
  }

  async function renderModal(type){
    const body=$('#enxame-modal-body'); if(!body) return;
    body.innerHTML='<div style="padding:32px 20px;text-align:center;color:#86868b;font-size:13px">Carregando...</div>';
    try { await ensureDB(); } catch(e){
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">⚠️</div><div class="enxame-empty-title">Erro ao carregar banco</div><div class="enxame-empty-sub">Recarregue a página (DB_ERROR)</div><button class="enxame-btn enxame-btn-primary enxame-btn-small" style="margin-top:12px" onclick="location.reload()">Recarregar</button></div>`;
      return;
    }
    if(type==='funis'){
      try {
        const funis=await idbGetAll('funis');
        if(!funis.length){
          body.innerHTML='<div class="enxame-empty"><div class="enxame-empty-icon">⚡</div><div class="enxame-empty-title">Nenhum funil ainda</div><div class="enxame-empty-sub">Toque em Novo funil.</div></div>';
          return;
        }
        body.innerHTML='';
        funis.forEach(f=>{
          const div=document.createElement('div'); div.className='enxame-funil-item';
          div.innerHTML=`<div><div class="enxame-funil-name">${escapeHtml(f.nome)}</div><div class="enxame-funil-steps">${f.nodes?.length||0} passos • ${f.edges?.length||0} ligações</div></div><div style="display:flex;gap:8px"><button class="enxame-btn enxame-btn-secondary enxame-btn-small" data-export="${f.id}">Exportar</button><button class="enxame-btn enxame-btn-primary enxame-btn-small" data-disparar="${f.id}">Disparar</button><button class="enxame-btn enxame-btn-danger enxame-btn-small" data-delete-funil="${f.id}" title="Excluir">🗑️</button></div>`;
          body.appendChild(div);
        });
        body.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportFunnelZip(b.dataset.export));
        body.querySelectorAll('[data-disparar]').forEach(b=>b.onclick=()=>{ dispararFunil(b.dataset.disparar); });
        body.querySelectorAll('[data-delete-funil]').forEach(b=>b.onclick=async ()=>{
          const f=await idbGet('funis', b.dataset.deleteFunil);
          if(f) openDeleteConfirmModal(f.id, 'funis', f.nome, 'funis');
        });
      } catch(e){ body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-title">Erro ao carregar (LOAD_ERROR)</div></div>`; }
      return;
    }
    const storeMap={audio:'audios', texto:'textos', imagem:'imagens', video:'videos'};
    const store=storeMap[type];
    try {
      const items=await idbGetAll(store);
      if(!items.length){
        const emptyLabels = {
          audio: 'Nenhum áudio ainda. Toque em Gravar áudio.',
          texto: 'Nenhum texto ainda. Toque em Adicionar texto.',
          imagem: 'Nenhuma imagem ainda. Toque em Adicionar imagem.',
          video: 'Nenhum vídeo ainda. Toque em Adicionar vídeo.'
        };
        body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">${type==='audio'?'🎙️':type==='texto'?'📝':type==='imagem'?'🖼️':'🎬'}</div><div class="enxame-empty-title">${getTitle(type)}</div><div class="enxame-empty-sub">${emptyLabels[type] || 'Nenhum item ainda.'}</div></div>`;
        return;
      }
      body.innerHTML='';
      const grid=document.createElement('div'); grid.className='enxame-grid';
      items.forEach(item=>{
        const card=document.createElement('div'); card.className='enxame-card';
        let contentHtml='';
        if(type==='audio'){
          const url=item.blob ? URL.createObjectURL(item.blob) : '';
          const wf=item.waveform||[];
          const waveHtml = wf.length
            ? `<div class="enxame-card-audio-wave">${wf.slice(0,24).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*20}px"></div>`).join('')}</div>`
            : `<div class="enxame-card-audio-wave">${Array(24).fill(0).map(()=>`<div class="enxame-wave-bar" style="height:10px"></div>`).join('')}</div>`;

          const durStr = item.duration ? (String(item.duration).replace('.', ',') + ' s') : '';
          const sizeStr = item.blob ? `${Math.round(item.blob.size / 1024)} KB` : '';
          const metaStr = [durStr, sizeStr].filter(Boolean).join(' · ');

          contentHtml = `
            ${waveHtml}
            <audio controls src="${url}"></audio>
            <div class="enxame-card-meta">${escapeHtml(metaStr)}</div>
          `;
          card.innerHTML = `
            <div class="enxame-card-top">
              <div class="enxame-card-name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</div>
              <button class="enxame-card-delete" data-delete="${item.id}" title="Excluir">🗑️</button>
            </div>
            <div class="enxame-card-content">${contentHtml}</div>
            <div class="enxame-card-actions">
              <button class="enxame-btn enxame-btn-primary enxame-card-action-primary" data-send="${item.id}">Enviar</button>
              <div class="enxame-card-action-secondary-row">
                <button class="enxame-btn enxame-btn-secondary" data-edit="${item.id}">Editar</button>
                <button class="enxame-btn enxame-btn-secondary" data-download="${item.id}">Baixar</button>
              </div>
            </div>
          `;
        } else if(type==='texto'){
          const preview=(item.conteudo||'').slice(0,120);
          contentHtml=`<div class="enxame-card-text-preview">${escapeHtml(preview)}${(item.conteudo||'').length>120?'...':''}</div>`;
          card.innerHTML = `
            <div class="enxame-card-top">
              <div class="enxame-card-name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</div>
              <button class="enxame-card-delete" data-delete="${item.id}" title="Excluir">🗑️</button>
            </div>
            <div class="enxame-card-content">${contentHtml}</div>
            <div class="enxame-card-actions">
              <button class="enxame-btn enxame-btn-primary enxame-card-action-primary" data-send="${item.id}">Enviar</button>
              <div class="enxame-card-action-secondary-row">
                <button class="enxame-btn enxame-btn-secondary" data-edit="${item.id}">Editar</button>
              </div>
            </div>
          `;
        } else if(type==='imagem'){
          const url=URL.createObjectURL(item.blob);
          const sizeMb = item.blob ? (item.blob.size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB' : '';
          contentHtml=`<img src="${url}" loading="lazy"><div class="enxame-card-meta">${escapeHtml(sizeMb)}</div>`;
          card.innerHTML = `
            <div class="enxame-card-top">
              <div class="enxame-card-name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</div>
              <button class="enxame-card-delete" data-delete="${item.id}" title="Excluir">🗑️</button>
            </div>
            <div class="enxame-card-content">${contentHtml}</div>
            <div class="enxame-card-actions">
              <button class="enxame-btn enxame-btn-primary enxame-card-action-primary" data-send="${item.id}">Enviar</button>
              <div class="enxame-card-action-secondary-row">
                <button class="enxame-btn enxame-btn-secondary" data-edit="${item.id}">Editar</button>
              </div>
            </div>
          `;
        } else if(type==='video'){
          const url=URL.createObjectURL(item.blob);
          const sizeMb = item.blob ? (item.blob.size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB' : '';
          contentHtml=`<video src="${url}" muted></video><div class="enxame-card-meta">${escapeHtml(sizeMb)}</div>`;
          card.innerHTML = `
            <div class="enxame-card-top">
              <div class="enxame-card-name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</div>
              <button class="enxame-card-delete" data-delete="${item.id}" title="Excluir">🗑️</button>
            </div>
            <div class="enxame-card-content">${contentHtml}</div>
            <div class="enxame-card-actions">
              <button class="enxame-btn enxame-btn-primary enxame-card-action-primary" data-send="${item.id}">Enviar</button>
              <div class="enxame-card-action-secondary-row">
                <button class="enxame-btn enxame-btn-secondary" data-edit="${item.id}">Editar</button>
              </div>
            </div>
          `;
        }
        grid.appendChild(card);
      });
      body.appendChild(grid);

      body.querySelectorAll('[data-download]').forEach(btn=>{
        btn.onclick=async ()=>{
          const id=btn.dataset.download;
          const item=await idbGet('audios', id);
          if(!item || !item.blob){ toast('Item não encontrado (NOT_FOUND)'); return; }
          let blobToDownload = item.blob;
          if(item.schema !== 2 || item.format !== 'ogg-opus'){
            try {
              toast('Processando...');
              const processed = await window.EnxameAudioPipeline.processFileForPTT(item.blob);
              item.blob = processed.blob;
              item.waveform = processed.waveform;
              item.duration = processed.duration;
              item.format = 'ogg-opus';
              item.schema = 2;
              item.updatedAt = Date.now();
              await idbPut('audios', item);
              blobToDownload = item.blob;
            } catch(e){}
          }
          const url = URL.createObjectURL(blobToDownload);
          const a = document.createElement('a');
          a.href = url;
          const safeName=(item.nome||'audio').replace(/[/\\?%*:|"<>]/g, '_');
          a.download = safeName.endsWith('.ogg') ? safeName : `${safeName}.ogg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(()=>URL.revokeObjectURL(url), 10000);
          toast('Download iniciado');
        };
      });

      body.querySelectorAll('[data-edit]').forEach(btn=>{
        btn.onclick=async ()=>{
          const id=btn.dataset.edit;
          const item=await idbGet(store, id);
          if(!item) return;
          if(type==='texto') openTextForm(item);
          else openMediaForm(type, item, item.blob, null, item.waveform, item.duration);
        };
      });
      body.querySelectorAll('[data-delete]').forEach(btn=>{
        btn.onclick=async ()=>{
          const id=btn.dataset.delete;
          const item=await idbGet(store, id);
          if(!item) return;
          openDeleteConfirmModal(item.id, type, item.nome, store);
        };
      });
      body.querySelectorAll('[data-send]').forEach(btn=>{
        btn.onclick=async ()=>{
          const id=btn.dataset.send;
          const item=await idbGet(store, id);
          if(!item) return;
          try {
            if(type==='audio') await sendAudioHQInstant(item);
            else if(type==='texto') await sendTextoInstant(item.conteudo);
            else if(type==='imagem') await sendImagemInstant(item.blob, false);
            else if(type==='video') await sendVideoInstant(item.blob);
          } catch(err){}
        };
      });
    } catch(e){
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">❌</div><div class="enxame-empty-title">Erro ao carregar</div><div class="enxame-empty-sub">Tente fechar e abrir novamente (LOAD_ERROR)</div></div>`;
    }
  }

  (async()=>{
    injectMainWorld();
    ensureHiddenFileInput();
    try { await ensureDB(); } catch(e){}
    const observer=new MutationObserver(()=>{ ensurePillsBar(); });
    observer.observe(document.body, {childList:true, subtree:true});
    ensurePillsBar();
    setInterval(()=>{ ensurePillsBar(); updateBadges(); }, 2500);
    setInterval(()=>{ updateWPPDot(); }, 5000);
    updateWPPDot();
    console.log('[Enxame] v2.9.1 carregado');
  })();
})();
