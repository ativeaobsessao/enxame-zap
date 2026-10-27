import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Download,
  Upload,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Layers,
  FileCheck,
  Package,
} from 'lucide-react';
import { Funnel } from '../types';
import { idbGetAll, idbPut, idbDel, getCounts, generateUID } from '../services/db';
import { exportChromeExtensionZip } from '../services/zipExport';

interface ExtensionDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFunnelId: string;
  onSelectFunnel: (funnel: Funnel) => void;
  onCreateNewFunnel: () => void;
  onToast: (msg: string) => void;
}

export const ExtensionDashboardModal: React.FC<ExtensionDashboardModalProps> = ({
  isOpen,
  onClose,
  currentFunnelId,
  onSelectFunnel,
  onCreateNewFunnel,
  onToast,
}) => {
  const [counts, setCounts] = useState({ audios: 0, funis: 0, totalMedia: 0 });
  const [funnelsList, setFunnelsList] = useState<Funnel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      const c = await getCounts();
      setCounts({
        audios: c.audios,
        funis: c.funis,
        totalMedia: c.imagens + c.videos,
      });
      const all = await idbGetAll<Funnel>('funis');
      setFunnelsList(all);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  const handleExportAllFunnels = async () => {
    try {
      const funis = await idbGetAll<Funnel>('funis');
      if (!funis.length) {
        onToast('Nenhum funil para exportar');
        return;
      }
      const blob = new Blob([JSON.stringify(funis, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enxame_backup_completo_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onToast(`Backup de ${funis.length} funis exportado com sucesso!`);
    } catch (err: unknown) {
      onToast('Erro ao exportar backup');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      const list: Funnel[] = Array.isArray(data) ? data : [data];
      for (const f of list) {
        if (!f.id) f.id = generateUID();
        await idbPut('funis', f);
      }
      onToast(`${list.length} funil(is) importado(s)`);
      refreshData();
      if (list[0]) {
        onSelectFunnel(list[0]);
      }
    } catch (err: unknown) {
      onToast('Erro ao importar backup: ' + (err as Error).message);
    }
  };

  const handleCloneFunnel = async (e: React.MouseEvent, targetFunnel: Funnel) => {
    e.stopPropagation();
    const cloned: Funnel = {
      ...targetFunnel,
      id: generateUID(),
      nome: `${targetFunnel.nome} (Cópia)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await idbPut('funis', cloned);
    onToast(`Funil clonado: ${cloned.nome}`);
    refreshData();
  };

  const handleDeleteFunnel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (funnelsList.length <= 1) {
      onToast('Você deve manter pelo menos um funil');
      return;
    }
    if (confirm('Deseja realmente excluir este funil?')) {
      await idbDel('funis', id);
      onToast('Funil removido');
      refreshData();
      if (id === currentFunnelId) {
        const remaining = funnelsList.filter((f) => f.id !== id);
        if (remaining[0]) onSelectFunnel(remaining[0]);
      }
    }
  };

  const handleDownloadExtension = async () => {
    try {
      await exportChromeExtensionZip();
      onToast('Pacote da Extensão Chrome baixado');
    } catch (err) {
      onToast('Erro ao gerar extensão');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-black/[0.1] flex flex-col animate-fade-in max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#1d1d1f] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-white/10 rounded-xl">
              <Smartphone className="w-5 h-5 text-white" />
            </span>
            <div>
              <h2 className="text-base font-bold">Painel Rápido • Enxame Zap</h2>
              <p className="text-xs text-[#86868b]">
                Estatísticas locais, backups e integração WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl p-3 text-center">
              <span className="text-[11px] text-[#86868b] uppercase font-bold block mb-1">
                Áudios HQ
              </span>
              <strong className="text-2xl font-bold text-[#1d1d1f]">{counts.audios}</strong>
            </div>
            <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl p-3 text-center">
              <span className="text-[11px] text-[#86868b] uppercase font-bold block mb-1">
                Funis Salvos
              </span>
              <strong className="text-2xl font-bold text-[#1d1d1f]">{counts.funis}</strong>
            </div>
            <div className="bg-[#fbfbfd] border border-black/[0.06] rounded-2xl p-3 text-center">
              <span className="text-[11px] text-[#86868b] uppercase font-bold block mb-1">
                Mídias HD
              </span>
              <strong className="text-2xl font-bold text-[#1d1d1f]">{counts.totalMedia}</strong>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExportAllFunnels}
              className="py-3 px-3 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#86868b]" />
              <span>Exportar Todos Funis</span>
            </button>

            <label className="py-3 px-3 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-[#86868b]" />
              <span>Importar Backup</span>
              <input
                type="file"
                accept=".json,.zip"
                hidden
                onChange={handleImportBackup}
              />
            </label>
          </div>

          {/* Extension & WhatsApp Integration */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-800" />
                <span className="text-xs font-bold text-emerald-900">
                  Extensão para Google Chrome
                </span>
              </div>
              <button
                onClick={handleDownloadExtension}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Baixar .zip
              </button>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Instale a extensão no Chrome via <code>chrome://extensions</code> (Modo Desenvolvedor) para injetar o painel ZapVoice diretamente no WhatsApp Web original.
            </p>
          </div>

          {/* Funnels Manager */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#86868b]">
                Seus Funis Cadastrados
              </div>
              <button
                onClick={() => {
                  onCreateNewFunnel();
                  onClose();
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Criar Novo
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {funnelsList.map((f) => {
                const isActive = f.id === currentFunnelId;
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      onSelectFunnel(f);
                      onClose();
                    }}
                    className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all cursor-pointer ${
                      isActive
                        ? 'border-[#1d1d1f] bg-[#fbfbfd] ring-1 ring-black/10'
                        : 'border-black/[0.06] hover:bg-[#fbfbfd]'
                    }`}
                  >
                    <div className="truncate mr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1d1d1f] truncate">{f.nome}</span>
                        {isActive && (
                          <span className="text-[10px] bg-[#1d1d1f] text-white px-2 py-0.2 rounded-full font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#86868b] block mt-0.5">
                        {f.nodes.length} passos • {f.edges.length} conexões
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => handleCloneFunnel(e, f)}
                        className="p-1.5 text-gray-500 hover:text-black rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                        title="Clonar funil"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteFunnel(e, f.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Excluir funil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
