import JSZip from 'jszip';
import { Funnel, MediaItem } from '../types';
import { idbGet, idbPut, generateUID } from './db';

// Exports a funnel + media blobs as .enxame.zip
export async function exportFunnelZip(funnel: Funnel): Promise<void> {
  const zip = new JSZip();
  zip.file('funil.json', JSON.stringify(funnel, null, 2));

  const midiasFolder = zip.folder('midias');

  for (const node of funnel.nodes) {
    if (node.mediaId) {
      const storeMap: Record<string, string> = {
        audio: 'audios',
        imagem: 'imagens',
        video: 'videos',
        texto: 'textos',
      };
      const store = storeMap[node.tipo];
      if (store) {
        const media = await idbGet<MediaItem>(store, node.mediaId);
        if (media?.blob && midiasFolder) {
          const safeName = (media.nome || `media_${node.id}`).replace(/[^a-zA-Z0-9._-]/g, '_');
          midiasFolder.file(`${node.tipo}_${node.id}_${safeName}`, media.blob);
        } else if (media?.conteudo && midiasFolder) {
          midiasFolder.file(`${node.tipo}_${node.id}.txt`, media.conteudo);
        }
      }
    } else if (node.conteudo && midiasFolder) {
      midiasFolder.file(`${node.tipo}_${node.id}_texto.txt`, node.conteudo);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeFunnelName = funnel.nome.replace(/\s+/g, '_').toLowerCase();
  a.download = `enxame_funil_${safeFunnelName}_v2.7.enxame.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Exports single JSON auto backup
export function downloadJsonBackup(funnel: Funnel): void {
  const json = JSON.stringify(funnel, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeFunnelName = funnel.nome.replace(/\s+/g, '_').toLowerCase();
  a.download = `enxame_funil_${safeFunnelName}_auto_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

// Imports either .json or .zip
export async function importFunnelFile(file: File): Promise<Funnel> {
  if (file.name.endsWith('.zip') || file.name.endsWith('.enxame.zip')) {
    const zip = await JSZip.loadAsync(file);
    const funnelJsonFile = zip.file('funil.json') || zip.file(/.*\.json$/i)[0];
    if (!funnelJsonFile) {
      throw new Error('Arquivo funil.json não encontrado dentro do ZIP');
    }
    const content = await funnelJsonFile.async('string');
    const funnel = JSON.parse(content) as Funnel;
    if (!funnel.id) funnel.id = generateUID();

    // Extract media files and save to IndexedDB
    const midias = zip.folder('midias');
    if (midias) {
      const storeMap: Record<string, string> = {
        audio: 'audios',
        imagem: 'imagens',
        video: 'videos',
        texto: 'textos',
      };

      for (const [relativePath, zipEntry] of Object.entries(midias.files)) {
        if (zipEntry.dir) continue;
        const parts = relativePath.replace('midias/', '').split('_');
        const tipo = parts[0] as 'audio' | 'imagem' | 'video' | 'texto';
        const nodeId = parts[1];
        const store = storeMap[tipo];

        if (store && nodeId) {
          const blob = await zipEntry.async('blob');
          const mediaId = generateUID();
          const mediaItem: MediaItem = {
            id: mediaId,
            nome: zipEntry.name.split('/').pop() || 'media',
            tipo,
            blob,
            createdAt: Date.now(),
          };
          await idbPut(store, mediaItem);

          // Update matching node
          const targetNode = funnel.nodes.find((n) => n.id === nodeId);
          if (targetNode) {
            targetNode.mediaId = mediaId;
            targetNode.previewUrl = URL.createObjectURL(blob);
          }
        }
      }
    }

    await idbPut('funis', funnel);
    return funnel;
  } else {
    // Standard JSON import
    const text = await file.text();
    const data = JSON.parse(text);
    const funnel: Funnel = Array.isArray(data) ? data[0] : data;
    if (!funnel.id) funnel.id = generateUID();
    await idbPut('funis', funnel);
    return funnel;
  }
}

// Packages the Chrome Extension for direct install/load unpacked into Chrome
export async function exportChromeExtensionZip(): Promise<void> {
  const zip = new JSZip();

  // Manifest v3
  const manifest = {
    manifest_version: 3,
    name: "Enxame Zap - Funil HQ & PTT ZapVoice",
    version: "2.7.0",
    description: "Visual funnel builder and PTT ZapVoice automation suite for WhatsApp Web with audio pipeline and backup.",
    action: {
      default_popup: "popup.html",
      default_icon: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    },
    background: {
      service_worker: "background.js",
      type: "module"
    },
    content_scripts: [
      {
        matches: ["https://web.whatsapp.com/*"],
        js: ["content.js"],
        css: ["content.css"],
        run_at: "document_idle"
      }
    ],
    permissions: ["storage", "tabs", "unlimitedStorage"],
    host_permissions: ["https://web.whatsapp.com/*"],
    web_accessible_resources: [
      {
        resources: [
          "builder.html",
          "builder.js",
          "builder.css",
          "icons/*",
          "lib/*",
          "wpp-main.js",
          "audio-pipeline.js"
        ],
        matches: ["https://web.whatsapp.com/*"]
      }
    ]
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('README_INSTALACAO.txt', `=== COMO INSTALAR NO GOOGLE CHROME ===
1. Descompacte este arquivo zip em uma pasta de sua escolha.
2. No Chrome, abra a barra de endereços e digite: chrome://extensions/
3. Ative o 'Modo do desenvolvedor' no canto superior direito.
4. Clique em 'Carregar sem compactação' (Load unpacked).
5. Selecione a pasta onde você descompactou os arquivos.
6. Abra o WhatsApp Web (https://web.whatsapp.com) e aproveite os funis com áudio PTT ZapVoice!`);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Enxame_Zap_Extensao_Chrome_v2.7.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}
