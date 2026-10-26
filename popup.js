// Fallback for chrome extension APIs in web context
if (typeof window.chrome === 'undefined') window.chrome = {};
if (!window.chrome.runtime) {
  window.chrome.runtime = {
    getURL: (path) => path.startsWith('/') ? path : '/' + path,
    onMessage: { addListener: () => {} },
    sendMessage: (msg, cb) => { if (cb) cb({ ok: true }); }
  };
}
if (!window.chrome.tabs) {
  window.chrome.tabs = {
    create: ({ url }) => { window.open(url, '_blank') || (window.location.href = url); }
  };
}

const DB_NAME='enxame_zap_db', DB_VERSION=2;
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
    req.onsuccess=()=>res(req.result);
    req.onerror=()=>rej(req.error);
  });
}
async function getCounts(){
  const db=await openDB();
  const tx=db.transaction(['audios','imagens','videos','funis'],'readonly');
  const audios=await new Promise(r=>{ const req=tx.objectStore('audios').getAll(); req.onsuccess=()=>r(req.result.length); });
  const funis=await new Promise(r=>{ const db2=db; const tx2=db2.transaction('funis','readonly'); const req=tx2.objectStore('funis').getAll(); req.onsuccess=()=>r(req.result.length); });
  const imagens=await new Promise(r=>{ const tx2=db.transaction('imagens','readonly'); const req=tx2.objectStore('imagens').getAll(); req.onsuccess=()=>r(req.result.length); });
  const videos=await new Promise(r=>{ const tx2=db.transaction('videos','readonly'); const req=tx2.objectStore('videos').getAll(); req.onsuccess=()=>r(req.result.length); });
  document.getElementById('count-audios').textContent=audios;
  document.getElementById('count-funis').textContent=funis;
  document.getElementById('count-midias').textContent=imagens+videos;
}
getCounts();

document.getElementById('open-whatsapp').onclick=()=>chrome.tabs.create({url:'https://web.whatsapp.com'});
document.getElementById('open-builder').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('builder.html')});
document.getElementById('export-all').onclick=async ()=>{
  const db=await openDB();
  const funis=await new Promise(r=>{ const tx=db.transaction('funis','readonly'); const req=tx.objectStore('funis').getAll(); req.onsuccess=()=>r(req.result); });
  if(!funis.length){ alert('Nenhum funil para exportar'); return; }
  // Use JSZip if available in popup? We inject simple download of jsons
  const blob=new Blob([JSON.stringify(funis,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`enxame_backup_completo_${new Date().toISOString().slice(0,10)}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
};
document.getElementById('import-file').onchange=async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  try {
    const txt=await file.text();
    const data=JSON.parse(txt);
    const db=await openDB();
    const list=Array.isArray(data)?data:[data];
    for(const f of list){
      const tx=db.transaction('funis','readwrite'); tx.objectStore('funis').put(f);
      await new Promise(r=>tx.oncomplete=r);
    }
    alert(`${list.length} funil(is) importado(s)`);
    getCounts();
  } catch(err){ alert('Erro: '+err.message); }
};
