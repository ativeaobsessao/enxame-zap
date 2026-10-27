import React, { useRef } from 'react';
import { Mic, FileText, Image, Video, HelpCircle, Upload, Trash2, Plus, Volume2 } from 'lucide-react';
import { NodeType, MediaItem } from '../types';
import { idbPut, idbDel, generateUID } from '../services/db';

interface LibrarySidebarProps {
  onAddNode: (type: NodeType) => void;
  savedMedias: MediaItem[];
  onSelectMediaForNode: (media: MediaItem) => void;
  onRefreshMedias: () => void;
  selectedNodeId: string | null;
  onToast: (msg: string) => void;
}

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  onAddNode,
  savedMedias,
  onSelectMediaForNode,
  onRefreshMedias,
  selectedNodeId,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const libraryItems: { type: NodeType; title: string; subtitle: string; icon: string }[] = [
    { type: 'audio', title: 'Áudio HQ', subtitle: 'PTT nativo OGG 48kHz', icon: '🎙️' },
    { type: 'texto', title: 'Texto', subtitle: 'com {{nome}}', icon: '📝' },
    { type: 'imagem', title: 'Imagem HD', subtitle: 'original sem compressão', icon: '🖼️' },
    { type: 'video', title: 'Vídeo HD', subtitle: 'original', icon: '🎬' },
  ];

  const handleDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData('text/plain', type);
  };

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let tipo: NodeType = 'imagem';
    if (file.type.startsWith('audio/')) tipo = 'audio';
    else if (file.type.startsWith('video/')) tipo = 'video';
    else if (file.type.startsWith('image/')) tipo = 'imagem';
    else if (file.type.startsWith('text/')) tipo = 'texto';

    const storeMap: Record<NodeType, string> = {
      audio: 'audios',
      imagem: 'imagens',
      video: 'videos',
      texto: 'textos',
    };

    const mediaItem: MediaItem = {
      id: generateUID(),
      nome: file.name,
      tipo,
      blob: file,
      previewUrl: URL.createObjectURL(file),
      createdAt: Date.now(),
    };

    await idbPut(storeMap[tipo], mediaItem);
    onRefreshMedias();
    onToast(`Mídia ${file.name} guardada no IndexedDB`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteMedia = async (e: React.MouseEvent, media: MediaItem) => {
    e.stopPropagation();
    const storeMap: Record<NodeType, string> = {
      audio: 'audios',
      imagem: 'imagens',
      video: 'videos',
      texto: 'textos',
    };
    await idbDel(storeMap[media.tipo], media.id);
    onRefreshMedias();
    onToast('Mídia removida');
  };

  return (
    <aside className="w-[280px] bg-white border-r border-black/[0.08] p-4 overflow-y-auto flex flex-col shrink-0">
      <div className="text-[11px] font-bold tracking-wider uppercase text-[#86868b] mb-3">
        Biblioteca - Arraste pro Canvas
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {libraryItems.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => handleDragStart(e, item.type)}
            onClick={() => onAddNode(item.type)}
            className="group bg-[#fbfbfd] hover:bg-white border border-black/[0.06] hover:border-black/[0.12] rounded-2xl p-3 flex flex-col items-center text-center cursor-grab active:cursor-grabbing hover:shadow-sm transition-all select-none hover:-translate-y-0.5"
            title="Arraste para o canvas ou clique para adicionar"
          >
            <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">
              {item.icon}
            </span>
            <span className="text-[13px] font-semibold text-[#1d1d1f]">{item.title}</span>
            <small className="text-[11px] text-[#86868b] leading-tight mt-0.5">{item.subtitle}</small>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-[#f5f5f7] rounded-2xl p-3 text-[12px] leading-relaxed text-[#515154] border border-black/[0.04]">
        <div className="flex items-center gap-1.5 font-semibold text-[#1d1d1f] mb-1">
          <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
          <span>Como ligar os cards:</span>
        </div>
        <ol className="list-decimal pl-4 space-y-1 text-[#666]">
          <li>Arraste itens para o canvas</li>
          <li>Clique no ponto preto inferior do card</li>
          <li>Clique no ponto superior do próximo card</li>
        </ol>
        <p className="mt-2 text-[11px] text-[#86868b] italic">
          Linha tracejada = sequência de envio automatizada
        </p>
      </div>

      <div className="mt-5 flex-1 flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
            Mídias Salvas ({savedMedias.length})
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            title="Fazer upload de mídia para o banco local"
          >
            <Plus className="w-3 h-3" /> Adicionar
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadMedia}
            hidden
            accept="audio/*,image/*,video/*,text/*"
          />
        </div>

        {savedMedias.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center border border-dashed border-black/[0.08] rounded-xl bg-[#fafafa]">
            <Upload className="w-6 h-6 text-[#86868b] mb-1 opacity-60" />
            <p className="text-[12px] text-[#86868b]">Nenhuma mídia salva ainda</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-[11px] px-2.5 py-1 bg-white border border-black/[0.08] rounded-lg font-medium text-[#1d1d1f] hover:bg-gray-50 cursor-pointer"
            >
              Subir arquivo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[300px] pr-1">
            {savedMedias.map((media) => (
              <div
                key={media.id}
                onClick={() => onSelectMediaForNode(media)}
                className={`group flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                  selectedNodeId
                    ? 'hover:border-blue-500 hover:bg-blue-50/50 border-black/[0.06] bg-[#fbfbfd]'
                    : 'border-black/[0.06] bg-[#fbfbfd] opacity-80'
                }`}
                title={
                  selectedNodeId
                    ? 'Clique para vincular este arquivo ao card selecionado'
                    : 'Selecione um card no canvas primeiro para vincular'
                }
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-sm">
                    {media.tipo === 'audio' && '🎙️'}
                    {media.tipo === 'imagem' && '🖼️'}
                    {media.tipo === 'video' && '🎬'}
                    {media.tipo === 'texto' && '📝'}
                  </span>
                  <div className="truncate">
                    <p className="font-medium text-[#1d1d1f] truncate text-[12px]">
                      {media.nome || media.conteudo?.slice(0, 24) || 'Sem título'}
                    </p>
                    <span className="text-[10px] text-[#86868b] uppercase font-semibold">
                      {media.tipo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDeleteMedia(e, media)}
                    className="p-1 hover:text-red-600 rounded cursor-pointer"
                    title="Excluir mídia"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
