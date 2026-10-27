const DB_NAME = 'enxame_zap_db';
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('audios')) d.createObjectStore('audios', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('textos')) d.createObjectStore('textos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('imagens')) d.createObjectStore('imagens', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('funis')) d.createObjectStore('funis', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCounts() {
  try {
    const db = await openDB();
    const tx = db.transaction(['audios', 'imagens', 'videos', 'funis'], 'readonly');
    const audios = await new Promise((r) => {
      const req = tx.objectStore('audios').getAll();
      req.onsuccess = () => r(req.result.length);
      req.onerror = () => r(0);
    });
    const funis = await new Promise((r) => {
      const req = tx.objectStore('funis').getAll();
      req.onsuccess = () => r(req.result.length);
      req.onerror = () => r(0);
    });
    const imagens = await new Promise((r) => {
      const req = tx.objectStore('imagens').getAll();
      req.onsuccess = () => r(req.result.length);
      req.onerror = () => r(0);
    });
    const videos = await new Promise((r) => {
      const req = tx.objectStore('videos').getAll();
      req.onsuccess = () => r(req.result.length);
      req.onerror = () => r(0);
    });
    document.getElementById('count-audios').textContent = audios;
    document.getElementById('count-funis').textContent = funis;
    document.getElementById('count-midias').textContent = imagens + videos;
  } catch (e) {
    console.warn('[Enxame][Popup] Erro ao carregar contadores:', e);
  }
}
getCounts();

document.getElementById('open-whatsapp').onclick = () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  } else {
    window.open('https://web.whatsapp.com', '_blank');
  }
};

document.getElementById('open-builder').onclick = () => {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
    chrome.tabs.create({ url: chrome.runtime.getURL('builder.html') });
  } else {
    window.location.href = '/';
  }
};

document.getElementById('export-all').onclick = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction('funis', 'readonly');
    const funis = await new Promise((r) => {
      const req = tx.objectStore('funis').getAll();
      req.onsuccess = () => r(req.result);
    });
    if (!funis.length) {
      alert('Nenhum funil encontrado para exportação');
      return;
    }
    const blob = new Blob([JSON.stringify(funis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enxame_backup_completo_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    alert('Erro ao exportar: ' + err.message);
  }
};

document.getElementById('import-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const txt = await file.text();
    const data = JSON.parse(txt);
    const db = await openDB();
    const list = Array.isArray(data) ? data : [data];
    for (const f of list) {
      const tx = db.transaction('funis', 'readwrite');
      tx.objectStore('funis').put(f);
      await new Promise((r) => (tx.oncomplete = r));
    }
    alert(`${list.length} funil(is) importado(s) com sucesso`);
    getCounts();
  } catch (err) {
    alert('Erro ao importar: ' + err.message);
  }
};
