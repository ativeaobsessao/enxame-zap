import { Funnel, MediaItem, NodeType } from '../types';

export const DB_NAME = 'enxame_zap_db';
export const DB_VERSION = 3;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const d = (e.target as IDBOpenDBRequest).result;
        if (!d.objectStoreNames.contains('audios')) d.createObjectStore('audios', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('textos')) d.createObjectStore('textos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('imagens')) d.createObjectStore('imagens', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('funis')) d.createObjectStore('funis', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        dbInstance = req.result;
        dbInstance.onclose = () => {
          dbInstance = null;
          dbPromise = null;
        };
        resolve(dbInstance);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

export async function idbPut<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function idbGet<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function idbDel(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function getCounts() {
  const db = await openDB();
  const tx = db.transaction(['audios', 'textos', 'imagens', 'videos', 'funis'], 'readonly');

  const countStore = (name: string): Promise<number> =>
    new Promise((resolve) => {
      const req = tx.objectStore(name).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });

  const [audios, textos, imagens, videos, funis] = await Promise.all([
    countStore('audios'),
    countStore('textos'),
    countStore('imagens'),
    countStore('videos'),
    countStore('funis'),
  ]);

  return { audios, textos, imagens, videos, funis, totalMedia: audios + textos + imagens + videos };
}

export function generateUID(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Seed initial default funnel if user has none
export async function seedInitialFunnelIfEmpty(): Promise<Funnel> {
  const funnels = await idbGetAll<Funnel>('funis');
  if (funnels.length > 0) {
    return funnels[0];
  }

  const n1Id = generateUID();
  const n2Id = generateUID();
  const n3Id = generateUID();

  const sampleFunnel: Funnel = {
    id: generateUID(),
    nome: 'Funil de Alta Conversão PTT',
    nodes: [
      {
        id: n1Id,
        tipo: 'texto',
        x: 100,
        y: 120,
        ordem: 1,
        conteudo: 'Olá, {{nome}}! Tudo bem com você? Vi que você solicitou mais detalhes no nosso site.',
        delay: 2000,
        simularGravando: true,
      },
      {
        id: n2Id,
        tipo: 'audio',
        x: 440,
        y: 120,
        ordem: 2,
        nome: 'Apresentação PTT ZapVoice (48kHz HQ)',
        conteudo: 'Apresentacao_ZapVoice.ogg',
        delay: 3500,
        simularGravando: true,
      },
      {
        id: n3Id,
        tipo: 'imagem',
        x: 780,
        y: 120,
        ordem: 3,
        nome: 'Demonstrativo_Exclusivo.png',
        delay: 2500,
        simularGravando: true,
        asDocument: false,
      },
    ],
    edges: [
      { de: n1Id, para: n2Id },
      { de: n2Id, para: n3Id },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await idbPut('funis', sampleFunnel);
  return sampleFunnel;
}
