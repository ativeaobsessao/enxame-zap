
/* Enxame Zap v2.1 - PTT Perfeito ZapVoice + Lixeira Obrigatória - 48kHz mono 128k Gain 3.5x + loudnorm */
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
    document.body.appendChild(t); setTimeout(()=>{ if(t && t.parentNode) t.remove(); }, 4000);
  }
  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ===== IndexedDB robusto =====
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
        req.onerror=()=>{ console.error('IDB open error', req.error); dbReadyPromise=null; rej(req.error); };
        req.onblocked=()=>{ console.warn('IDB blocked'); };
      } catch(err){ dbReadyPromise=null; rej(err); }
    });
    return dbReadyPromise;
  }
  async function ensureDB(){ if(db) return db; try { return await openDB(); } catch(e){ console.error('ensureDB fail', e); throw e; } }
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
        .then(res => {
          const caps = res.data?.capabilities || {};
          console.log('%c[Enxame v2.8] MAIN world respondeu ping:', 'background:#30d158;color:#fff;padding:3px 8px;border-radius:999px;font-weight:600', caps);
          updateWPPDot();
        })
        .catch(e => {
          console.warn('[Enxame v2.8] Ping inicial MAIN world:', e.message);
        });
    } catch(e){ console.warn('injectMainWorld fail', e); }
  }

  // ===== ENVIO TEXTO =====
  async function sendTextoInstant(text){
    const final=replaceVars(text);
    closeModal();
    toast('Enviando texto...');
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
        toast('Texto enviado • 1 clique');
        return { ok: true, strategy: 'DOM' };
      }
    } catch(e){ console.warn('DOM send fail', e); }
    const err = new Error('Erro ao enviar - abra o chat do lead');
    err.code = 'TEXT_SEND_FAILED';
    toast(err.message);
    throw err;
  }

  // ===== ENVIO ÁUDIO PTT PERFEITO v2.8 - VIA ENXAME BRIDGE CLIENT =====
  async function sendAudioHQInstant(blobOrItem){
    let blob = blobOrItem?.blob || blobOrItem;
    let preWaveform = blobOrItem?.waveform;
    let preDuration = blobOrItem?.duration;
    let preIsWebM = blobOrItem?.isWebM || (blob.type && blob.type.includes('webm'));
    closeModal();
    toast('Enviando PTT ZapVoice v2.8...');
    
    try {
      if(!window.EnxameBridge){
        const err = new Error('Ponte EnxameBridge não carregada');
        err.code = 'BRIDGE_NOT_FOUND';
        throw err;
      }

      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.EnxameBridge.request('send_media', {
        buffer: arrayBuffer,
        mime: blob.type,
        waveform: preWaveform || true,
        duration: preDuration || 5,
        isWebM: !!preIsWebM
      }, {
        timeoutMs: 25000,
        onProgress: (stage) => {
          if(stage === 'RESOLVING_CHAT') toast('Verificando chat ativo...');
          else if(stage === 'PREPARING_MEDIA') toast('Processando áudio PTT...');
          else if(stage === 'SENDING') toast('Transmitindo áudio via ZapVoice...');
        }
      });

      toast('Áudio PTT perfeito enviado • ZapVoice 48kHz mono 128k • sem encaminhado');
      return { ok: true, strategy: res.strategy, stage: res.stage, ms: res.ms };
    } catch(e){
      console.error('[Enxame v2.8] sendAudioHQInstant falhou:', e);
      toast('Erro envio PTT: ' + (e.message || String(e)));
      throw e;
    }
  }

  async function sendImagemInstant(blob, asDoc=false, caption=''){
    closeModal();
    if(!blob){
      const err = new Error('Nenhum arquivo de imagem fornecido');
      err.code = 'INVALID_BLOB';
      toast('Nenhuma imagem selecionada');
      throw err;
    }
    toast('Enviando...');
    try {
      if(!window.EnxameDomSender){
        const err = new Error('Módulo EnxameDomSender não carregado');
        err.code = 'DOM_SENDER_NOT_FOUND';
        throw err;
      }
      const res = await window.EnxameDomSender.send({
        kind: 'image',
        blob,
        asDocument: !!asDoc,
        caption: caption || ''
      });

      if(res.strategy === 'MENU_INTERCEPT_DOCUMENT' && res.ok){
        toast('Documento enviado (original)');
      } else {
        toast('Enviado');
      }

      if(res.confirmed && typeof res.confirmed.then === 'function'){
        res.confirmed.then((conf)=>{
          if(conf && !conf.verified){
            toast('Enviado, status ainda não confirmado');
          }
        }).catch(()=>{});
      }

      return res;
    } catch(err){
      console.error('[Enxame v2.8.3] sendImagemInstant falhou:', err);
      if(err.mayHaveSent){
        toast(`Erro [${err.code || 'SEND_ERROR'}]: pode ter sido enviado; confira o chat antes de tentar de novo`);
      } else {
        toast(`Erro no envio de imagem [${err.code || 'SEND_ERROR'}]: ${err.message || String(err)}`);
      }
      throw err;
    }
  }

  async function sendVideoInstant(blob, caption='', asDoc=false){
    closeModal();
    if(!blob){
      const err = new Error('Nenhum arquivo de vídeo fornecido');
      err.code = 'INVALID_BLOB';
      toast('Nenhum vídeo selecionado');
      throw err;
    }
    toast('Enviando...');
    try {
      if(!window.EnxameDomSender){
        const err = new Error('Módulo EnxameDomSender não carregado');
        err.code = 'DOM_SENDER_NOT_FOUND';
        throw err;
      }
      const res = await window.EnxameDomSender.send({
        kind: 'video',
        blob,
        asDocument: !!asDoc,
        caption: caption || ''
      });

      if(res.strategy === 'MENU_INTERCEPT_DOCUMENT' && res.ok){
        toast('Documento enviado (original)');
      } else {
        toast('Enviado');
      }

      if(res.confirmed && typeof res.confirmed.then === 'function'){
        res.confirmed.then((conf)=>{
          if(conf && !conf.verified){
            toast('Enviado, status ainda não confirmado');
          }
        }).catch(()=>{});
      }

      return res;
    } catch(err){
      console.error('[Enxame v2.8.3] sendVideoInstant falhou:', err);
      if(err.mayHaveSent){
        toast(`Erro [${err.code || 'SEND_ERROR'}]: pode ter sido enviado; confira o chat antes de tentar de novo`);
      } else {
        toast(`Erro no envio de vídeo [${err.code || 'SEND_ERROR'}]: ${err.message || String(err)}`);
      }
      throw err;
    }
  }

  // ===== BACKUP =====
  async function exportFunnelZip(funnelId=null){
    try {
      await ensureDB();
      const funis=funnelId ? [await idbGet('funis', funnelId)].filter(Boolean) : await idbGetAll('funis');
      if(!funis.length){ toast('Nenhum funil para exportar'); return; }
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
        const a=document.createElement('a'); a.href=url; a.download=`enxame_funil_${funil.nome.replace(/\s+/g,'_')}_v1.enxame.zip`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url), 10000);
        toast(`Backup ${funil.nome} baixado`);
      } else {
        for(const funil of funis) zip.file(`funis/${funil.nome.replace(/\s+/g,'_')}.json`, JSON.stringify(funil,null,2));
        const audios=await idbGetAll('audios'); const imgs=await idbGetAll('imagens'); const vids=await idbGetAll('videos');
        [...audios,...imgs,...vids].forEach(m=>{ if(m.blob) zip.file(`midias_geral/${m.id}_${(m.nome||'media').replace(/\s+/g,'_')}`, m.blob); });
        const blob=await zip.generateAsync({type:'blob'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`enxame_backup_completo_${new Date().toISOString().slice(0,10)}.zip`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
        toast('Backup completo exportado');
      }
    } catch(e){ console.error(e); toast('Erro export: '+e.message); }
  }
  async function importFunnelFromFile(file){
    try {
      if(file.name.endsWith('.zip')){ toast('Para .zip, extraia o funil.json'); return; }
      const txt=await file.text();
      const data=JSON.parse(txt);
      const list=Array.isArray(data) ? data : (data.nodes ? [data] : data.funis || [data]);
      await ensureDB();
      for(const f of list){ if(!f.id) f.id=uid(); await idbPut('funis', f); }
      toast(`${list.length} funil(is) importado(s)`);
      renderModal('funis');
    } catch(e){ console.error(e); toast('Erro importar: '+e.message); }
  }
  async function dispararFunil(funnelId){
    try {
      await ensureDB();
      const funil=await idbGet('funis', funnelId);
      if(!funil){ toast('Funil não encontrado'); return; }
      const sorted=[...(funil.nodes||[])].sort((a,b)=>(a.ordem||0)-(b.ordem||0));
      if(!sorted.length){ toast('Funil sem mensagens cadastradas'); return; }
      toast(`Disparando ${funil.nome} - ${sorted.length} passos`);
      for(let i=0;i<sorted.length;i++){
        const node=sorted[i];
        const delay=node.delay||(node.tipo==='audio'?2400:1200);
        const jitter=400+Math.random()*1200;
        if(i>0) await new Promise(r=>setTimeout(r, delay+jitter));
        try {
          if(node.tipo==='audio'){
            const m=await idbGet('audios', node.mediaId);
            if(m) await sendAudioHQInstant(m);
            else throw new Error('Áudio não encontrado no banco');
          }
          else if(node.tipo==='texto'){
            const m=node.mediaId ? await idbGet('textos', node.mediaId) : null;
            const textContent = m?.conteudo || node.conteudo || '';
            await sendTextoInstant(textContent);
          }
          else if(node.tipo==='imagem'){
            const m=await idbGet('imagens', node.mediaId);
            if(!m?.blob) throw new Error('Imagem não encontrada no banco');
            await sendImagemInstant(m.blob, !!node.asDocument, node.legenda || '');
          }
          else if(node.tipo==='video'){
            const m=await idbGet('videos', node.mediaId);
            if(!m?.blob) throw new Error('Vídeo não encontrado no banco');
            await sendVideoInstant(m.blob, node.legenda || '', !!node.asDocument);
          }
        } catch(stepErr){
          const code = stepErr.code || 'STEP_FAILED';
          const mayHaveSentAlert = stepErr.mayHaveSent ? ' (pode ter sido enviado; confira o chat antes de tentar de novo)' : '';
          toast(`Disparo interrompido no passo ${i+1} [${code}]: ${stepErr.message}${mayHaveSentAlert}`);
          console.error(`[Enxame v2.8.1] Disparo interrompido no passo ${i+1}:`, stepErr);
          return; // Interrompe no primeiro erro, sem retentar sozinho
        }
      }
      toast(`Funil ${funil.nome} concluído com sucesso`);
    } catch(e){
      console.error('[Enxame v2.8.1] Erro no funil:', e);
      toast(`Erro ao disparar funil: ${e.message || String(e)}`);
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
      console.log('[Enxame] hidden file selected', type, editingId, file.name, file.size);
      try {
        if(type==='audio'){
          toast('Processando áudio para PTT perfeito ZapVoice 48kHz 128k...');
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
              previewEl.innerHTML=`<audio controls src="${url}" style="width:100%;height:40px"></audio><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name)} • ${(processed.size/1024).toFixed(0)} KB • OGG Opus 48kHz mono 128k • ${duration?duration+'s':''} • PTT perfeito</div><div class="enxame-card-audio-wave" style="margin-top:8px">${(waveform||Array(18).fill(20)).slice(0,18).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*22}px"></div>`).join('')}</div>`;
            }
            toast('Áudio PTT perfeito carregado - clique Salvar');
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
                  previewEl.innerHTML=`<img src="${url}" style="width:100%;max-height:160px;object-fit:cover;border-radius:12px"><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name)}</div>`;
                } else if(type==='video'){
                  const url=URL.createObjectURL(file);
                  previewEl.innerHTML=`<video src="${url}" controls muted style="width:100%;max-height:160px;border-radius:12px"></video><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name)}</div>`;
                }
              }
              toast('Novo arquivo carregado - clique em Salvar alterações');
            } else {
              await ensureDB();
              const map={audio:'audios', imagem:'imagens', video:'videos'};
              const store=map[type];
              const existing=await idbGet(store, editingId);
              if(existing){
                existing.blob=file;
                existing.updatedAt=Date.now();
                await idbPut(store, existing);
                toast('Arquivo substituído com sucesso');
                updateBadges();
                renderModal(type);
              }
            }
          } else {
            window._enxamePendingFile=file;
            openMediaForm(type, null, file);
          }
        }
      } catch(err){ console.error(err); toast('Erro ao processar arquivo: '+err.message); }
      inp.value='';
      delete inp.dataset.editingId;
    });
    return inp;
  }

  // ===== Pills bar abaixo =====
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
    } catch(e){ console.warn('badges fail', e); }
  }
  async function updateWPPDot(){
    const dot=$('#enxame-wpp-dot'); if(!dot) return;
    try {
      if(!window.EnxameBridge){
        dot.style.background='#86868b';
        dot.title='Ponte Enxame não carregada';
        return;
      }
      const res = await window.EnxameBridge.request('capabilities', {}, { timeoutMs: 4000 });
      const caps = res.data || {};
      const ready = !!(caps.hasWpp || caps.hasStoreChat);
      if(ready){
        if(caps.hasActiveChat){
          dot.style.background='#30d158';
          dot.title='Pronto • Chat ativo detectado';
        } else {
          dot.style.background='#30d158';
          dot.title='Pronto • Abra uma conversa para enviar';
        }
      } else {
        dot.style.background='#ff9f0a';
        dot.title='Carregando WhatsApp Web...';
      }
    } catch(e){
      dot.style.background='#86868b';
      dot.title='Aguardando WhatsApp';
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
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="btn-export-all">📦 Exportar Tudo</button><label class="enxame-btn enxame-btn-secondary enxame-btn-small" style="cursor:pointer">📥 Importar<input type="file" id="import-funil" accept=".json,.zip,.enxame.zip" hidden></label><button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-new-funil">+ Novo Funil</button>`;
    } else if(type==='audio'){
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-add-${type}">📁 Importar áudio (vira PTT ZapVoice)</button><button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="btn-record-${type}">🔴 Gravar HQ 48kHz 128k</button>`;
    } else {
      toolbar.innerHTML=`<button class="enxame-btn enxame-btn-primary enxame-btn-small" id="btn-add-${type}">+ Adicionar ${getTitle(type)}</button>`;
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
      try { currentRecording.recorder?.stop(); currentRecording.stream?.getTracks().forEach(t=>t.stop()); currentRecording.originalStream?.getTracks().forEach(t=>t.stop()); } catch {}
      currentRecording=null;
    }
    if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
    const m=$('#enxame-modal'); if(m) m.remove(); window._enxamePendingEditForm=null;
  }
  function closeDeleteModal(){
    const m=$('#enxame-delete-modal'); if(m) m.remove();
  }
  function getTitle(t){ const m={audio:'Áudios PTT ZapVoice', texto:'Textos', imagem:'Imagens HD', video:'Vídeos HD', funis:'Seus Funis'}; return m[t]||t; }
  function getSubtitle(t){ const m={audio:'ZapVoice tech • OGG Opus 48kHz mono 128k • Gain 3.5x + loudnorm • Waveform 64 • PTT nativo', texto:'Use {{nome}} para personalizar • envio instantâneo • editável', imagem:'Resolução original • sem compressão • lightbox HD • editável', video:'Resolução original • envio 1 clique • editável', funis:'Funis com quadrados ligáveis • export .enxame.zip'}; return m[t]||''; }

  // ===== FORMS =====
  function openTextForm(existingItem){
    const body=$('#enxame-modal-body'); if(!body) return;
    const isEdit=!!existingItem;
    body.innerHTML=`
      <div class="enxame-form">
        <div class="enxame-form-row">
          <label class="enxame-form-label">Nome da mensagem</label>
          <input id="enxame-form-nome" class="enxame-form-input" placeholder="Ex: Boas vindas 1" value="${escapeHtml(existingItem?.nome||'')}" maxlength="60">
        </div>
        <div class="enxame-form-row">
          <label class="enxame-form-label">Conteúdo • use {{nome}} e {{nome_completo}}</label>
          <textarea id="enxame-form-conteudo" class="enxame-form-textarea" placeholder="Olá {{nome}}, tudo bem? Vi que você...">${escapeHtml(existingItem?.conteudo||'')}</textarea>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-form-cancel" style="flex:1">Cancelar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-form-save" style="flex:1">${isEdit?'Salvar alterações':'Salvar texto HQ'}</button>
        </div>
      </div>
    `;
    $('#enxame-form-cancel').onclick=()=>renderModal('texto');
    $('#enxame-form-save').onclick=async ()=>{
      const nome=$('#enxame-form-nome').value.trim();
      const conteudo=$('#enxame-form-conteudo').value.trim();
      if(!nome || nome.length<2){ toast('Nome obrigatório (mín 2 letras)'); return; }
      if(!conteudo || conteudo.length<2){ toast('Conteúdo obrigatório'); return; }
      try {
        await ensureDB();
        const obj={ id: existingItem?.id || uid(), nome, conteudo, createdAt: existingItem?.createdAt || Date.now(), updatedAt: Date.now() };
        await idbPut('textos', obj);
        toast(isEdit?'Texto atualizado':'Texto salvo em HQ');
        updateBadges();
        renderModal('texto');
      } catch(e){ console.error(e); toast('Erro ao salvar: '+e.message); }
    };
    setTimeout(()=>$('#enxame-form-nome')?.focus(), 100);
  }

  function openMediaForm(type, existingItem, pendingFile, suggestedName, preWaveform, preDuration){
    const body=$('#enxame-modal-body'); if(!body) return;
    const isEdit=!!existingItem;
    const file=pendingFile || existingItem?.blob || null;
    const nomeBase= existingItem?.nome || suggestedName || file?.name || `${type}_${Date.now()}`;
    let previewHtml='';
    if(file){
      try {
        const url=URL.createObjectURL(file);
        if(type==='audio'){
          const wf = preWaveform || existingItem?.waveform;
          const dur = preDuration || existingItem?.duration || '';
          previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><audio controls src="${url}" style="width:100%;height:40px"></audio><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'áudio PTT')} • ${(file.size/1024).toFixed(0)} KB • OGG Opus 48kHz mono 128k CBR • ${dur?dur+'s •':''} PTT ZapVoice</div>${wf?`<div class="enxame-card-audio-wave" style="margin-top:10px">${wf.slice(0,24).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*24}px"></div>`).join('')}</div><div style="font-size:10px;color:#30d158;margin-top:4px;font-weight:700">✓ Waveform ${wf.length} barras • PTT nativo sem encaminhado</div>`:''}</div>`;
        } else if(type==='imagem') previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><img src="${url}" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px"><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'imagem')}</div></div>`;
        else if(type==='video') previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview"><video src="${url}" controls muted style="width:100%;max-height:180px;border-radius:12px"></video><div style="font-size:11px;color:#86868b;margin-top:6px">${escapeHtml(file.name||'vídeo')}</div></div>`;
      } catch {}
    } else {
      previewHtml=`<div id="enxame-form-file-preview" class="enxame-form-file-preview" style="color:#86868b;font-size:13px">Nenhum arquivo selecionado</div>`;
    }

    body.innerHTML=`
      <div class="enxame-form">
        <div class="enxame-form-row">
          <label class="enxame-form-label">Nome da mensagem</label>
          <input id="enxame-form-nome" class="enxame-form-input" placeholder="${type==='audio'?'Ex: Áudio boas vindas PTT ZapVoice':'Ex: Mídia 1'}" value="${escapeHtml(existingItem?.nome||suggestedName||'')}" maxlength="80">
        </div>
        ${previewHtml}
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="enxame-btn enxame-btn-secondary enxame-btn-small" id="enxame-form-trocar" style="flex:1">📁 Trocar arquivo</button>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-form-cancel" style="flex:1">Cancelar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-form-save" style="flex:1">${isEdit?'Salvar alterações':'Salvar em alta'}</button>
        </div>
        ${type==='audio'?`<div style="margin-top:14px;background:#f0fdf4;border:0.5px solid #bbf7d0;border-radius:12px;padding:10px 12px"><div style="font-size:11px;font-weight:700;color:#15803d">✓ ZapVoice tech v2.1 - PTT Perfeito</div><div style="font-size:11px;color:#166534;margin-top:3px;line-height:1.35">48kHz mono • 128k CBR • Gain 3.5x + Compressor + loudnorm -16dB • Waveform 64 barras • Envio como se gravado agora • Sem arquivo não suportado • Sem encaminhada • iOS/Android 1x/2x OK</div></div>`:''}
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
      if(!nome || nome.length<2){ toast('Nome obrigatório'); return; }
      if(!finalFile){ toast('Selecione um arquivo'); return; }
      try {
        await ensureDB();
        const map={audio:'audios', imagem:'imagens', video:'videos'};
        const store=map[type];
        const obj={ id: existingItem?.id || uid(), nome, blob: finalFile, waveform: state?.waveform || preWaveform, duration: state?.duration || preDuration, createdAt: existingItem?.createdAt || Date.now(), updatedAt: Date.now() };
        await idbPut(store, obj);
        toast(isEdit ? `${getTitle(type)} atualizado` : `${getTitle(type)} salvo ZapVoice`);
        window._enxamePendingEditForm=null;
        window._enxamePendingFile=null;
        window._enxamePendingWaveform=null;
        window._enxamePendingDuration=null;
        updateBadges();
        renderModal(type);
      } catch(e){ console.error(e); toast('Erro ao salvar: '+e.message); }
    };
  }

  // ===== DELETE CONFIRM MODAL - LIXEIRA OBRIGATÓRIA v2.1 =====
  function openDeleteConfirmModal(itemId, itemType, itemName, storeName){
    closeDeleteModal();
    const overlay=document.createElement('div'); overlay.id='enxame-delete-modal';
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeDeleteModal(); });
    const card=document.createElement('div'); card.className='enxame-delete-card';
    card.innerHTML=`
      <div class="enxame-delete-icon">🗑️</div>
      <div class="enxame-delete-title">Excluir mensagem?</div>
      <div class="enxame-delete-sub">Você tem certeza que deseja excluir<br><b>"${escapeHtml(itemName||'esta mensagem')}"</b> de ${getTitle(itemType)}?<br>Esta ação não pode ser desfeita.</div>
      <div class="enxame-delete-actions">
        <button class="enxame-btn enxame-btn-secondary" id="enxame-delete-cancel" style="flex:1">Cancelar</button>
        <button class="enxame-btn enxame-btn-danger" id="enxame-delete-confirm" style="flex:1">🗑️ Excluir</button>
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
        toast(`"${itemName}" excluído`);
        closeDeleteModal();
        updateBadges();
        renderModal(itemType);
      } catch(e){
        console.error('delete fail', e);
        toast('Erro ao excluir: '+e.message);
        closeDeleteModal();
      }
    };
  }


  // ===== RECORDER UI APPLE v2.2 FAST - ZapVoice sem Página sem resposta =====
  function openProcessingModal(){
    const overlay=document.createElement('div'); overlay.id='enxame-processing-modal';
    overlay.innerHTML=`<div class="enxame-processing-card"><div class="enxame-processing-spinner"></div><div class="enxame-processing-title">Finalizando gravação ZapVoice...</div><div class="enxame-processing-sub">Processamento rápido sem travar • &lt;800ms</div></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }
  function closeProcessingModal(){ const m=$('#enxame-processing-modal'); if(m) m.remove(); }

  async function openAudioRecorderUI(){
    const body=$('#enxame-modal-body'); if(!body) return;
    if(!window.EnxameAudioPipeline || !window.EnxameAudioPipeline.startRecordingHQ){
      toast('Pipeline de áudio não carregado - recarregue a página');
      return;
    }
    body.innerHTML=`
      <div class="enxame-recorder">
        <div class="enxame-recorder-header">
          <div style="display:flex;align-items:center;gap:8px"><div class="enxame-rec-dot"></div><span style="font-weight:700;font-size:13px">Gravando ZapVoice 48kHz 128k FAST</span></div>
          <span id="enxame-rec-timer" style="font-variant-numeric:tabular-nums;font-weight:700">00:00</span>
        </div>
        <div class="enxame-recorder-sub">Gain 3.5x + Compressor • Fale normal, volume ficará alto e fiel • Não trava mais</div>
        <div class="enxame-recorder-wave" id="enxame-rec-wave">${Array(32).fill(0).map(()=>`<div class="enxame-rec-bar" style="height:6px"></div>`).join('')}</div>
        <div class="enxame-volume-area">
          <div class="enxame-volume-label"><span>Volume</span><span id="enxame-volume-pct">0%</span></div>
          <div class="enxame-volume-bg"><div id="enxame-volume-fill" class="enxame-volume-fill" style="width:0%"></div></div>
          <div id="enxame-volume-status" style="font-size:11px;color:#86868b;margin-top:6px">Fale para ver o volume subir...</div>
        </div>
        <div class="enxame-form-actions">
          <button class="enxame-btn enxame-btn-secondary" id="enxame-rec-cancel" style="flex:1">✕ Cancelar</button>
          <button class="enxame-btn enxame-btn-primary" id="enxame-rec-stop" style="flex:1.3">⏹️ Parar (rápido)</button>
        </div>
        <div style="margin-top:10px;background:#f0fdf4;border:0.5px solid #bbf7d0;border-radius:10px;padding:8px 10px"><div style="font-size:10px;font-weight:700;color:#15803d">✓ v2.2 FAST PATH - ZapVoice</div><div style="font-size:10px;color:#166534;margin-top:2px">Não faz re-encode pesado, envia WebM direto para WA-JS 4.7.1 converter • Sem Página sem resposta</div></div>
      </div>
    `;
    const waveEl=$('#enxame-rec-wave');
    const fillEl=$('#enxame-volume-fill');
    const pctEl=$('#enxame-volume-pct');
    const statusEl=$('#enxame-volume-status');
    const timerEl=$('#enxame-rec-timer');
    let startTime=Date.now();
    recordingTimerInt=setInterval(()=>{
      const elapsed=Math.floor((Date.now()-startTime)/1000);
      const m=String(Math.floor(elapsed/60)).padStart(2,'0');
      const s=String(elapsed%60).padStart(2,'0');
      if(timerEl) timerEl.textContent=`${m}:${s}`;
      if(elapsed>=120){
        toast('Limite 2min atingido - parando rápido');
        const stopBtn=$('#enxame-rec-stop'); if(stopBtn) stopBtn.click();
      }
    },200);

    try {
      currentRecording = await window.EnxameAudioPipeline.startRecordingHQ((vol)=>{
        if(fillEl) fillEl.style.width=`${vol}%`;
        if(pctEl) pctEl.textContent=`${vol}%`;
        if(vol<10){ fillEl.style.background='#86868b'; if(statusEl) statusEl.textContent='Muito baixo - chegue mais perto'; }
        else if(vol<30){ fillEl.style.background='#ff9f0a'; if(statusEl) statusEl.textContent='Baixo - fale mais alto'; }
        else if(vol<70){ fillEl.style.background='#30d158'; if(statusEl) statusEl.textContent='Perfeito! Volume alto e fiel'; }
        else { fillEl.style.background='#30d158'; if(statusEl) statusEl.textContent='Excelente! ZapVoice'; }
        if(waveEl){
          const bars=waveEl.children;
          for(let i=0;i<bars.length;i++){
            const h = 6 + (vol/100)*32 + Math.random()*6 + Math.sin(Date.now()/200 + i)*4;
            bars[i].style.height=`${Math.max(4,h)}px`;
            bars[i].style.opacity= vol>5 ? '1' : '0.3';
          }
        }
      });
      console.log('[Enxame v2.2] Gravação iniciada FAST', currentRecording);
    } catch(e){
      console.error('startRecording fail v2.2', e);
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">🎙️</div><div class="enxame-empty-title">Erro microfone</div><div class="enxame-empty-sub">${escapeHtml(e.message)} - Permita microfone.</div><button class="enxame-btn enxame-btn-primary enxame-btn-small" style="margin-top:12px" onclick="location.reload()">Recarregar</button></div>`;
      return;
    }

    $('#enxame-rec-cancel').onclick=()=>{
      try { currentRecording.recorder?.stop(); currentRecording.stream?.getTracks().forEach(t=>t.stop()); currentRecording.originalStream?.getTracks().forEach(t=>t.stop()); if(currentRecording.audioCtxVol) currentRecording.audioCtxVol.close(); if(currentRecording.audioCtx) currentRecording.audioCtx.close(); } catch {}
      currentRecording=null;
      if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
      toast('Gravação cancelada');
      renderModal('audio');
    };
    $('#enxame-rec-stop').onclick=async ()=>{
      const btn=$('#enxame-rec-stop');
      if(btn){ btn.textContent='⏳ Finalizando...'; btn.disabled=true; }
      const processingModal = openProcessingModal();
      if(recordingTimerInt){ clearInterval(recordingTimerInt); recordingTimerInt=null; }
      try {
        // v2.2 FAST PATH - stopFast resolve em <100ms, sem decode, sem travar
        const result = await Promise.race([
          currentRecording.stopFast(),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Timeout 2.5s - tente gravar <60s')), 2500))
        ]);
        console.log('[Enxame v2.2] stopFast OK', result.blob.size, result.duration, 'isWebM', result.isWebM);
        closeProcessingModal();
        toast(`Áudio gravado ${result.duration}s • ZapVoice FAST`);
        openMediaForm('audio', null, result.blob, `Gravação ${new Date().toLocaleTimeString()}`, result.waveform, result.duration);
      } catch(e){
        console.error('stopFast fail v2.2', e);
        closeProcessingModal();
        toast('Erro ao finalizar: '+e.message+' - Tente gravar menos tempo');
        renderModal('audio');
      } finally {
        currentRecording=null;
        if(processingModal) processingModal.remove();
      }
    };
  }


  async function renderModal(type){
    const body=$('#enxame-modal-body'); if(!body) return;
    body.innerHTML='<div style="padding:32px 20px;text-align:center;color:#86868b;font-size:13px">Carregando do IndexedDB...</div>';
    try { await ensureDB(); } catch(e){
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">⚠️</div><div class="enxame-empty-title">Erro IndexedDB</div><div class="enxame-empty-sub">${escapeHtml(e.message)} - Desative o Shield do Brave no WhatsApp Web e recarregue.</div><button class="enxame-btn enxame-btn-primary enxame-btn-small" style="margin-top:12px" onclick="location.reload()">Recarregar</button></div>`;
      return;
    }
    if(type==='funis'){
      try {
        const funis=await idbGetAll('funis');
        if(!funis.length){ body.innerHTML='<div class="enxame-empty"><div class="enxame-empty-icon">⚡</div><div class="enxame-empty-title">Nenhum funil ainda</div><div class="enxame-empty-sub">Clique em + Novo Funil para criar seu primeiro funil com quadrados ligáveis. Tudo salvo em IndexedDB + backup automático .enxame.zip</div></div>'; return; }
        body.innerHTML='';
        funis.forEach(f=>{
          const div=document.createElement('div'); div.className='enxame-funil-item';
          div.innerHTML=`<div><div class="enxame-funil-name">${escapeHtml(f.nome)}</div><div class="enxame-funil-steps">${f.nodes?.length||0} passos • ${f.edges?.length||0} ligações</div></div><div style="display:flex;gap:8px"><button class="enxame-btn enxame-btn-secondary enxame-btn-small" data-export="${f.id}">Exportar</button><button class="enxame-btn enxame-btn-primary enxame-btn-small" data-disparar="${f.id}">Disparar</button><button class="enxame-btn enxame-btn-danger enxame-btn-small" data-delete-funil="${f.id}" title="Excluir funil">🗑️</button></div>`;
          body.appendChild(div);
        });
        body.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportFunnelZip(b.dataset.export));
        body.querySelectorAll('[data-disparar]').forEach(b=>b.onclick=()=>{ dispararFunil(b.dataset.disparar); });
        body.querySelectorAll('[data-delete-funil]').forEach(b=>b.onclick=async ()=>{
          const f=await idbGet('funis', b.dataset.deleteFunil);
          if(f) openDeleteConfirmModal(f.id, 'funis', f.nome, 'funis');
        });
      } catch(e){ body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-title">Erro ao carregar funis</div><div class="enxame-empty-sub">${escapeHtml(e.message)}</div></div>`; }
      return;
    }
    const storeMap={audio:'audios', texto:'textos', imagem:'imagens', video:'videos'};
    const store=storeMap[type];
    try {
      const items=await idbGetAll(store);
      if(!items.length){
        body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">${type==='audio'?'🎙️':type==='texto'?'📝':type==='imagem'?'🖼️':'🎬'}</div><div class="enxame-empty-title">Nenhum ${getTitle(type)} salvo</div><div class="enxame-empty-sub">${type==='audio'?'Grave em HQ 48kHz mono 128k ZapVoice com Gain 3.5x + loudnorm ou importe - tudo vira PTT perfeito.':'Clique em + Adicionar para salvar em resolução máxima. Depois edite nome e arquivo se precisar.'}</div></div>`;
        return;
      }
      body.innerHTML='';
      const grid=document.createElement('div'); grid.className='enxame-grid';
      items.forEach(item=>{
        const card=document.createElement('div'); card.className='enxame-card';
        let contentHtml='';
        if(type==='audio'){
          const size=item.blob ? `${(item.blob.size/1024).toFixed(0)} KB` : '';
          const url=item.blob ? URL.createObjectURL(item.blob) : '';
          const wf=item.waveform||[];
          const waveHtml = wf.length ? `<div class="enxame-card-audio-wave">${wf.slice(0,18).map(v=>`<div class="enxame-wave-bar" style="height:${4+ (v/100)*20}px"></div>`).join('')}</div>` : `<div class="enxame-card-audio-wave">${Array(18).fill(0).map(()=>`<div class="enxame-wave-bar" style="height:${8+Math.random()*18}px"></div>`).join('')}</div>`;
          contentHtml=`${waveHtml}<audio controls src="${url}" style="width:100%;height:40px"></audio><div class="enxame-card-meta">${escapeHtml(size)} • OGG Opus 48kHz mono 128k • ${item.duration?item.duration+'s •':''} ZapVoice • tocável</div>`;
        } else if(type==='texto'){
          const preview=(item.conteudo||'').slice(0,120);
          contentHtml=`<div class="enxame-card-text-preview">${escapeHtml(preview)}${(item.conteudo||'').length>120?'...':''}</div>`;
        } else if(type==='imagem'){
          const url=URL.createObjectURL(item.blob);
          contentHtml=`<img src="${url}" loading="lazy"><div class="enxame-card-meta">${(item.blob.size/1024/1024).toFixed(2)} MB • original HD</div>`;
        } else if(type==='video'){
          const url=URL.createObjectURL(item.blob);
          contentHtml=`<video src="${url}" muted></video><div class="enxame-card-meta">${(item.blob.size/1024/1024).toFixed(2)} MB • original</div>`;
        }
        card.innerHTML=`
          <div class="enxame-card-top">
            <div class="enxame-card-name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</div>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="enxame-card-delete" data-delete="${item.id}" title="Excluir mensagem">🗑️</button>
              <button class="enxame-card-menu" data-edit="${item.id}" title="Editar">✏️</button>
            </div>
          </div>
          <div class="enxame-card-content">${contentHtml}</div>
          <div class="enxame-card-actions">
            <button class="enxame-btn enxame-btn-secondary enxame-btn-small" data-edit="${item.id}" style="flex:1">Editar</button>
            <button class="enxame-btn enxame-btn-primary enxame-btn-small" data-send="${item.id}" style="flex:1.3">▶ Enviar</button>
          </div>
        `;
        grid.appendChild(card);
      });
      body.appendChild(grid);
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
          } catch(err){
            console.warn('[Enxame v2.8] Falha ao enviar item:', err);
          }
        };
      });
    } catch(e){
      console.error('renderModal error', e);
      body.innerHTML=`<div class="enxame-empty"><div class="enxame-empty-icon">❌</div><div class="enxame-empty-title">Erro ao carregar</div><div class="enxame-empty-sub">${escapeHtml(e.message)} - Tente fechar e abrir novamente.</div></div>`;
    }
  }

  (async()=>{
    injectMainWorld();
    ensureHiddenFileInput();
    try { await ensureDB(); } catch(e){ console.warn('DB init fail', e); }
    const observer=new MutationObserver(()=>{ ensurePillsBar(); });
    observer.observe(document.body, {childList:true, subtree:true});
    ensurePillsBar();
    setInterval(()=>{ ensurePillsBar(); updateBadges(); }, 2500);
    setInterval(()=>{ updateWPPDot(); }, 5000);
    updateWPPDot();
    console.log('%cEnxame Zap v2.8.0 ZapVoice - Ponte v1 + PTT Seguro','background:#1d1d1f;color:#fff;padding:8px 14px;border-radius:999px;font-weight:700');
  })();
})();
