
/* Enxame Builder - canvas infinito + quadrados ligáveis + IndexedDB + backup zip */
const DB_NAME='enxame_zap_db', DB_VERSION=2;
let db=null;
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
let funnel={id: new URLSearchParams(location.search).get('id') || uid(), nome:'Novo Funil', nodes:[], edges:[], createdAt: Date.now()};
let selectedNodeId=null;
let dragState=null;
let connectFrom=null;

function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded=(e)=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('audios')) d.createObjectStore('audios',{keyPath:'id'});
      if(!d.objectStoreNames.contains('textos')) d.createObjectStore('textos',{keyPath:'id'});
      if(!d.objectStoreNames.contains('imagens')) d.createObjectStore('imagens',{keyPath:'id'});
      if(!d.objectStoreNames.contains('videos')) d.createObjectStore('videos',{keyPath:'id'});
      if(!d.objectStoreNames.contains('funis')) d.createObjectStore('funis',{keyPath:'id'});
    };
    req.onsuccess=()=>{ db=req.result; res(db); };
    req.onerror=()=>rej(req.error);
  });
}
function idbPut(store,obj){ return new Promise((res,rej)=>{ const tx=db.transaction(store,'readwrite'); tx.objectStore(store).put(obj); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
function idbGetAll(store){ return new Promise((res,rej)=>{ const tx=db.transaction(store,'readonly'); const req=tx.objectStore(store).getAll(); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }
function idbGet(store,id){ return new Promise((res,rej)=>{ const tx=db.transaction(store,'readonly'); const req=tx.objectStore(store).get(id); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }

const canvas = document.getElementById('canvas');
const cardsLayer = document.getElementById('cards-layer');
const svg = document.getElementById('edges-svg');

function toast(msg){
  let t=document.getElementById('builder-toast');
  if(t) t.remove();
  t=document.createElement('div'); t.id='builder-toast';
  t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:12px 18px;border-radius:999px;font-size:13px;font-weight:600;z-index:9999';
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), 2800);
}

async function loadFunnel(){
  if(!db) await openDB();
  const urlId = new URLSearchParams(location.search).get('id');
  if(urlId){
    const existing = await idbGet('funis', urlId);
    if(existing){ funnel=existing; document.getElementById('funnel-name').value=funnel.nome; }
  }
  renderAll();
}

function renderAll(){
  renderNodes();
  renderEdges();
  updateStats();
  renderMediaList();
}

function renderNodes(){
  cardsLayer.innerHTML='';
  document.getElementById('canvas-hint').style.display = funnel.nodes.length ? 'none' : 'block';
  funnel.nodes.forEach((node, idx)=>{
    const el=document.createElement('div');
    el.className='enxame-node'+(selectedNodeId===node.id?' selected':'');
    el.dataset.id=node.id;
    el.style.left=(node.x||(120+idx*300))+'px';
    el.style.top=(node.y||(120+ (idx%2)*180))+'px';
    const ordem = funnel.nodes.indexOf(node)+1;
    const titles=['Primeira Mensagem','Segunda Mensagem','Terceira Mensagem','Quarta Mensagem','Quinta Mensagem','Sexta Mensagem'];
    const title = titles[ordem-1] || `Mensagem ${ordem}`;
    const typeLabel={audio:'Áudio HQ', texto:'Texto', imagem:'Imagem HD', video:'Vídeo HD'}[node.tipo] || node.tipo;
    let preview='';
    if(node.tipo==='audio'){
      preview=`<div class="enxame-node-wave">${Array(16).fill(0).map(()=>`<div style="height:${6+Math.random()*14}px"></div>`).join('')}</div><div style="font-size:11px;color:#86868b;margin-top:6px">${node.nome||'Áudio • OGG Opus'}${node.mediaId?' • salvo':''}</div><audio controls style="width:100%;margin-top:8px" ${node.previewUrl?`src="${node.previewUrl}"`:''}></audio>`;
    } else if(node.tipo==='texto'){
      const snippet=(node.conteudo||'Clique para editar texto com {{nome}}').slice(0,100);
      preview=`<div style="font-size:12px;line-height:1.4;color:#1d1d1f;white-space:pre-wrap">${snippet}</div>`;
    } else if(node.tipo==='imagem'){
      preview=node.previewUrl?`<img src="${node.previewUrl}">`:`<div style="font-size:12px;color:#86868b">Imagem • clique para escolher em HD</div>`;
    } else if(node.tipo==='video'){
      preview=node.previewUrl?`<video src="${node.previewUrl}" muted></video>`:`<div style="font-size:12px;color:#86868b">Vídeo • clique para escolher em HD</div>`;
    }
    el.innerHTML=`
      <div class="enxame-node-dot top" data-dot="in" data-id="${node.id}"></div>
      <div class="enxame-node-header"><span class="enxame-node-title">${title}</span><span class="enxame-node-type">${typeLabel}</span></div>
      <div class="enxame-node-preview">${preview}</div>
      <div class="enxame-node-dot bottom" data-dot="out" data-id="${node.id}"></div>
    `;
    // drag
    el.addEventListener('mousedown', (e)=>{
      if(e.target.classList.contains('enxame-node-dot')) return;
      if(e.target.tagName==='AUDIO' || e.target.tagName==='VIDEO') return;
      dragState={id:node.id, startX:e.clientX, startY:e.clientY, origX:node.x||0, origY:node.y||0, el};
      el.style.cursor='grabbing';
    });
    el.addEventListener('click', (e)=>{
      if(e.target.classList.contains('enxame-node-dot')) return;
      selectNode(node.id);
    });
    // dots connect
    el.querySelectorAll('.enxame-node-dot').forEach(dot=>{
      dot.addEventListener('click', (e)=>{
        e.stopPropagation();
        const type=dot.dataset.dot;
        const id=dot.dataset.id;
        if(type==='out'){
          connectFrom=id;
          document.querySelectorAll('.enxame-node-dot').forEach(d=>d.classList.remove('active'));
          dot.classList.add('active');
          toast('Agora clique no ponto de cima do próximo card para ligar');
        } else if(type==='in' && connectFrom && connectFrom!==id){
          // create edge
          if(!funnel.edges.find(ed=>ed.de===connectFrom && ed.para===id)){
            funnel.edges.push({de:connectFrom, para:id});
            renderEdges(); updateStats();
          }
          connectFrom=null;
          document.querySelectorAll('.enxame-node-dot').forEach(d=>d.classList.remove('active'));
        }
      });
    });
    cardsLayer.appendChild(el);
  });
}

function renderEdges(){
  svg.innerHTML='';
  funnel.edges.forEach(edge=>{
    const fromNode=funnel.nodes.find(n=>n.id===edge.de);
    const toNode=funnel.nodes.find(n=>n.id===edge.para);
    if(!fromNode || !toNode) return;
    const fromEl=cardsLayer.querySelector(`[data-id="${edge.de}"]`);
    const toEl=cardsLayer.querySelector(`[data-id="${edge.para}"]`);
    if(!fromEl || !toEl) return;
    const fromX=(fromNode.x||0)+130;
    const fromY=(fromNode.y||0)+ fromEl.offsetHeight;
    const toX=(toNode.x||0)+130;
    const toY=(toNode.y||0);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    const midY=(fromY+toY)/2;
    path.setAttribute('d', `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`);
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#1d1d1f');
    path.setAttribute('stroke-width','2');
    path.setAttribute('stroke-dasharray','6 6');
    path.setAttribute('opacity','0.9');
    svg.appendChild(path);
  });
}

function selectNode(id){
  selectedNodeId=id;
  document.querySelectorAll('.enxame-node').forEach(el=>el.classList.toggle('selected', el.dataset.id===id));
  const node=funnel.nodes.find(n=>n.id===id);
  if(!node) return;
  document.getElementById('inspector-empty').style.display='none';
  document.getElementById('inspector-content').style.display='block';
  document.getElementById('inspector-title').textContent=`${['Primeira','Segunda','Terceira','Quarta','Quinta','Sexta'][funnel.nodes.indexOf(node)]||''} Mensagem`;
  document.getElementById('inspector-type').textContent={audio:'Áudio HQ PTT Nativo', texto:'Texto com {{nome}}', imagem:'Imagem HD Original', video:'Vídeo HD Original'}[node.tipo];
  document.getElementById('field-delay').value=node.delay||2000;
  document.getElementById('field-sim-gravando').checked=node.simularGravando!==false;
  document.getElementById('field-as-document').checked=!!node.asDocument;
  const mediaDiv=document.getElementById('inspector-media');
  mediaDiv.innerHTML='';
  if(node.tipo==='texto'){
    const ta=document.createElement('textarea'); ta.placeholder='Digite seu texto com {{nome}}'; ta.value=node.conteudo||''; ta.oninput=()=>{ node.conteudo=ta.value; renderNodes(); };
    mediaDiv.appendChild(ta);
  } else {
    const btn=document.createElement('button'); btn.className='btn secondary'; btn.style.width='100%'; btn.textContent=node.mediaId ? 'Trocar arquivo (mantém HD)' : 'Escolher arquivo em alta';
    const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.hidden=true;
    if(node.tipo==='audio') fileInput.accept='audio/*';
    if(node.tipo==='imagem') fileInput.accept='image/*';
    if(node.tipo==='video') fileInput.accept='video/*';
    btn.onclick=()=>fileInput.click();
    fileInput.onchange=async ()=>{
      const file=fileInput.files[0]; if(!file) return;
      const id=uid();
      const storeMap={audio:'audios', imagem:'imagens', video:'videos'};
      await idbPut(storeMap[node.tipo], {id, nome:file.name, blob:file, createdAt:Date.now()});
      node.mediaId=id;
      node.nome=file.name;
      node.previewUrl=URL.createObjectURL(file);
      if(node.tipo==='audio'){
        node.conteudo=file.name;
      }
      renderNodes(); renderMediaList(); toast(`${node.tipo} salvo em alta no IndexedDB`);
    };
    mediaDiv.appendChild(btn); mediaDiv.appendChild(fileInput);
    if(node.previewUrl){
      const prev=document.createElement('div'); prev.style.marginTop='10px';
      if(node.tipo==='audio') prev.innerHTML=`<audio controls src="${node.previewUrl}" style="width:100%"></audio>`;
      else if(node.tipo==='imagem') prev.innerHTML=`<img src="${node.previewUrl}" style="width:100%;border-radius:12px">`;
      else if(node.tipo==='video') prev.innerHTML=`<video src="${node.previewUrl}" style="width:100%;border-radius:12px" controls muted></video>`;
      mediaDiv.appendChild(prev);
    }
  }
}

function updateStats(){
  document.getElementById('funnel-stats').textContent=`${funnel.nodes.length} passos • ${funnel.edges.length} ligações • backup automático ativo`;
}

async function renderMediaList(){
  const list=document.getElementById('media-list');
  list.innerHTML='';
  const audios=await idbGetAll('audios');
  const textos=await idbGetAll('textos');
  const imagens=await idbGetAll('imagens');
  const videos=await idbGetAll('videos');
  [...audios, ...textos, ...imagens, ...videos].slice(0,20).forEach(m=>{
    const div=document.createElement('div'); div.className='media-chip'; div.textContent=m.nome||m.conteudo?.slice(0,30)||m.id;
    div.onclick=()=>{
      if(!selectedNodeId){ toast('Selecione um card no canvas primeiro'); return; }
      const node=funnel.nodes.find(n=>n.id===selectedNodeId);
      if(!node) return;
      // assign
      node.mediaId=m.id;
      if(m.blob) node.previewUrl=URL.createObjectURL(m.blob);
      if(m.conteudo) node.conteudo=m.conteudo;
      renderNodes(); selectNode(selectedNodeId);
      toast('Mídia vinculada ao card');
    };
    list.appendChild(div);
  });
}

// Drag canvas nodes
document.addEventListener('mousemove', (e)=>{
  if(!dragState) return;
  const dx=e.clientX-dragState.startX;
  const dy=e.clientY-dragState.startY;
  const node=funnel.nodes.find(n=>n.id===dragState.id);
  if(node){
    node.x=dragState.origX+dx;
    node.y=dragState.origY+dy;
    dragState.el.style.left=node.x+'px';
    dragState.el.style.top=node.y+'px';
    renderEdges();
  }
});
document.addEventListener('mouseup', ()=>{ dragState=null; });

// Library drag to canvas
document.querySelectorAll('.lib-item').forEach(item=>{
  item.addEventListener('dragstart', (e)=>{
    e.dataTransfer.setData('text/plain', item.dataset.type);
  });
});
canvas.addEventListener('dragover', (e)=>{ e.preventDefault(); });
canvas.addEventListener('drop', (e)=>{
  e.preventDefault();
  const type=e.dataTransfer.getData('text/plain');
  if(!type) return;
  const rect=canvas.getBoundingClientRect();
  const x=e.clientX-rect.left+canvas.scrollLeft-130;
  const y=e.clientY-rect.top+canvas.scrollTop-40;
  const newNode={id:uid(), tipo:type, x, y, ordem:funnel.nodes.length+1, delay: type==='audio'?2500:1500, simularGravando:true, conteudo: type==='texto'?'Olá {{nome}}! Tudo bem?':''};
  funnel.nodes.push(newNode);
  renderAll();
  selectNode(newNode.id);
});

document.getElementById('funnel-name').addEventListener('input', (e)=>{ funnel.nome=e.target.value; });

// Save + auto backup
document.getElementById('btn-save').onclick=async ()=>{
  funnel.updatedAt=Date.now();
  // Ensure ordem by edges chain - simple topological by creation + edges
  // Recalculate ordem based on chain
  const visited=new Set();
  let order=0;
  function dfs(id){
    if(visited.has(id)) return;
    visited.add(id);
    const node=funnel.nodes.find(n=>n.id===id);
    if(node){ node.ordem=++order; }
    funnel.edges.filter(ed=>ed.de===id).forEach(ed=>dfs(ed.para));
  }
  // start from nodes without incoming
  const incoming=new Set(funnel.edges.map(e=>e.para));
  const starts=funnel.nodes.filter(n=>!incoming.has(n.id));
  (starts.length?starts:funnel.nodes).forEach(n=>dfs(n.id));
  await idbPut('funis', funnel);
  updateStats();
  // auto backup JSON to Downloads
  const json=JSON.stringify(funnel,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`enxame_funil_${funnel.nome.replace(/\s+/g,'_')}_auto_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 8000);
  toast(`Funil ${funnel.nome} salvo + backup automático baixado`);
};

// Export zip
document.getElementById('btn-export-zip').onclick=async ()=>{
  const zip=new JSZip();
  zip.file('funil.json', JSON.stringify(funnel,null,2));
  for(const node of funnel.nodes){
    if(node.mediaId){
      const storeMap={audio:'audios', texto:'textos', imagem:'imagens', video:'videos'};
      const store=storeMap[node.tipo];
      if(!store) continue;
      const media=await idbGet(store, node.mediaId);
      if(media?.blob){
        zip.file(`midias/${node.tipo}_${node.id}_${(media.nome||'media').replace(/\s+/g,'_')}`, media.blob);
      } else if(media?.conteudo){
        zip.file(`midias/${node.tipo}_${node.id}.txt`, media.conteudo);
      }
    } else if(node.conteudo){
      zip.file(`midias/${node.tipo}_${node.id}_texto.txt`, node.conteudo);
    }
  }
  const blob=await zip.generateAsync({type:'blob'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`enxame_funil_${funnel.nome.replace(/\s+/g,'_')}_v1.enxame.zip`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 10000);
  toast('Export .enxame.zip com funil.json + /midias/ em alta baixado');
};

// Import
document.getElementById('btn-import').onclick=()=>document.getElementById('file-import').click();
document.getElementById('file-import').onchange=async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  try {
    const txt=await file.text();
    const data=JSON.parse(txt);
    funnel=data;
    if(!funnel.id) funnel.id=uid();
    await idbPut('funis', funnel);
    document.getElementById('funnel-name').value=funnel.nome;
    renderAll();
    toast('Funil importado e restaurado com previews');
  } catch(err){ toast('Erro ao importar: '+err.message); }
};

document.getElementById('btn-back').onclick=()=>{ window.close(); };

document.getElementById('field-delay').oninput=(e)=>{
  const node=funnel.nodes.find(n=>n.id===selectedNodeId); if(node) node.delay=parseInt(e.target.value)||2000;
};
document.getElementById('field-sim-gravando').onchange=(e)=>{
  const node=funnel.nodes.find(n=>n.id===selectedNodeId); if(node) node.simularGravando=e.target.checked;
};
document.getElementById('field-as-document').onchange=(e)=>{
  const node=funnel.nodes.find(n=>n.id===selectedNodeId); if(node) node.asDocument=e.target.checked;
};
document.getElementById('btn-delete-node').onclick=()=>{
  if(!selectedNodeId) return;
  if(!confirm('Remover este card?')) return;
  funnel.nodes=funnel.nodes.filter(n=>n.id!==selectedNodeId);
  funnel.edges=funnel.edges.filter(ed=>ed.de!==selectedNodeId && ed.para!==selectedNodeId);
  selectedNodeId=null;
  document.getElementById('inspector-content').style.display='none';
  document.getElementById('inspector-empty').style.display='grid';
  renderAll();
};

document.getElementById('zoom-in').onclick=()=>{ cardsLayer.style.transform=`scale(${(parseFloat(cardsLayer.dataset.scale||1)+0.1).toFixed(1)})`; cardsLayer.dataset.scale=parseFloat(cardsLayer.style.transform.match(/scale\((.*)\)/)[1]); };
document.getElementById('zoom-out').onclick=()=>{ cardsLayer.style.transform=`scale(${Math.max(0.5, (parseFloat(cardsLayer.dataset.scale||1)-0.1)).toFixed(1)})`; };

(async()=>{ await openDB(); await loadFunnel(); })();
