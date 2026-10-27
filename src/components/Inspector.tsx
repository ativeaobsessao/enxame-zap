import React, { useRef } from 'react';
import { Trash2, Upload, FileCode, Check, Info } from 'lucide-react';
import { FunnelNode, NodeType, MediaItem } from '../types';
import { idbPut, generateUID } from '../services/db';

interface InspectorProps {
  selectedNode: FunnelNode | null;
  selectedNodeIndex: number;
  onUpdateNode: (updated: Partial<FunnelNode>) => void;
  onDeleteNode: (id: string) => void;
  onRefreshMedias: () => void;
  onToast: (msg: string) => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  selectedNode,
  selectedNodeIndex,
  onUpdateNode,
  onDeleteNode,
  onRefreshMedias,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedNode) {
    return (
      <aside className="w-[320px] bg-white border-l border-black/[0.08] p-6 flex flex-col items-center justify-center text-center shrink-0">
        <div className="text-4xl mb-3">👈</div>
        <h3 className="font-bold text-[#1d1d1f] text-base mb-1">Selecione um card</h3>
        <p className="text-[#86868b] text-[13px] leading-relaxed max-w-[240px]">
          Clique em qualquer card no canvas para editar o áudio, texto, imagem, delay e simulação de digitando/gravando.
        </p>
      </aside>
    );
  }

  const titles = ['Primeira', 'Segunda', 'Terceira', 'Quarta', 'Quinta', 'Sexta', 'Sétima', 'Oitava'];
  const nodeTitle = `${titles[selectedNodeIndex] || `Mensagem ${selectedNodeIndex + 1}`} Mensagem`;

  const typeLabels: Record<NodeType, string> = {
    audio: 'Áudio HQ PTT Nativo',
    texto: 'Texto com {{nome}}',
    imagem: 'Imagem HD Original',
    video: 'Vídeo HD Original',
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = generateUID();
    const storeMap: Record<NodeType, string> = {
      audio: 'audios',
      imagem: 'imagens',
      video: 'videos',
      texto: 'textos',
    };

    const mediaItem: MediaItem = {
      id,
      nome: file.name,
      tipo: selectedNode.tipo,
      blob: file,
      previewUrl: URL.createObjectURL(file),
      createdAt: Date.now(),
    };

    await idbPut(storeMap[selectedNode.tipo], mediaItem);
    onUpdateNode({
      mediaId: id,
      nome: file.name,
      previewUrl: mediaItem.previewUrl,
      conteudo: selectedNode.tipo === 'audio' ? file.name : selectedNode.conteudo,
    });

    onRefreshMedias();
    onToast(`${selectedNode.tipo.toUpperCase()} salvo em alta no IndexedDB`);
  };

  const insertVariable = (variable: string) => {
    const current = selectedNode.conteudo || '';
    onUpdateNode({ conteudo: current + ' ' + variable });
  };

  return (
    <aside className="w-[320px] bg-white border-l border-black/[0.08] p-5 overflow-y-auto flex flex-col shrink-0">
      <div className="mb-4">
        <h2 className="text-base font-bold text-[#1d1d1f]">{nodeTitle}</h2>
        <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wider text-[#86868b] bg-[#f5f5f7] px-2.5 py-1 rounded-full">
          {typeLabels[selectedNode.tipo]}
        </span>
      </div>

      <div className="space-y-4 flex-1">
        {/* Content Field */}
        <div>
          <label className="block text-[12px] font-semibold text-[#515154] mb-1.5">
            Conteúdo / Mídia
          </label>

          {selectedNode.tipo === 'texto' ? (
            <div>
              <textarea
                value={selectedNode.conteudo || ''}
                onChange={(e) => onUpdateNode({ conteudo: e.target.value })}
                placeholder="Digite a mensagem..."
                rows={4}
                className="w-full border border-black/[0.1] rounded-xl p-3 text-[13px] text-[#1d1d1f] focus:outline-none focus:border-black/30 resize-y transition-colors"
              />
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#86868b]">Variáveis:</span>
                <button
                  type="button"
                  onClick={() => insertVariable('{{nome}}')}
                  className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-mono font-medium transition-colors cursor-pointer"
                  title="Primeiro nome do contato"
                >
                  {'{{nome}}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable('{{nome_completo}}')}
                  className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md font-mono font-medium transition-colors cursor-pointer"
                  title="Nome completo do contato"
                >
                  {'{{nome_completo}}'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-3 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-[#86868b]" />
                <span>{selectedNode.mediaId ? 'Trocar arquivo (mantém HD)' : 'Escolher arquivo em alta'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={handleFileUpload}
                accept={
                  selectedNode.tipo === 'audio'
                    ? 'audio/*'
                    : selectedNode.tipo === 'imagem'
                    ? 'image/*'
                    : 'video/*'
                }
              />

              {selectedNode.previewUrl && (
                <div className="mt-3 bg-[#fbfbfd] p-2.5 rounded-xl border border-black/[0.06]">
                  {selectedNode.tipo === 'audio' && (
                    <audio
                      src={selectedNode.previewUrl}
                      controls
                      className="w-full h-8"
                    />
                  )}
                  {selectedNode.tipo === 'imagem' && (
                    <img
                      src={selectedNode.previewUrl}
                      alt="Preview"
                      className="w-full max-h-40 object-cover rounded-lg"
                    />
                  )}
                  {selectedNode.tipo === 'video' && (
                    <video
                      src={selectedNode.previewUrl}
                      controls
                      className="w-full max-h-40 object-cover rounded-lg"
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delay Field */}
        <div>
          <label className="block text-[12px] font-semibold text-[#515154] mb-1.5">
            Delay após envio (ms)
          </label>
          <input
            type="number"
            min={500}
            step={500}
            value={selectedNode.delay || 2000}
            onChange={(e) => onUpdateNode({ delay: parseInt(e.target.value) || 2000 })}
            className="w-full border border-black/[0.1] rounded-xl px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none focus:border-black/30 transition-colors"
          />
          <small className="block mt-1 text-[11px] text-[#86868b] leading-tight">
            Humanizado: + 0.5s a 1.5s aleatório para evitar detecção e bloqueio
          </small>
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-black/[0.06] space-y-3">
          <label className="flex items-center gap-2.5 text-[13px] text-[#1d1d1f] font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedNode.simularGravando !== false}
              onChange={(e) => onUpdateNode({ simularGravando: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Simular gravando / digitando</span>
          </label>

          <label className="flex items-center gap-2.5 text-[13px] text-[#1d1d1f] font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!selectedNode.asDocument}
              onChange={(e) => onUpdateNode({ asDocument: e.target.checked })}
              className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Enviar como documento (HD máxima)</span>
          </label>
        </div>
      </div>

      {/* Delete button */}
      <div className="pt-4 border-t border-black/[0.06] mt-4">
        <button
          onClick={() => {
            if (confirm('Deseja realmente remover este card do funil?')) {
              onDeleteNode(selectedNode.id);
            }
          }}
          className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Remover Card</span>
        </button>
      </div>
    </aside>
  );
};
