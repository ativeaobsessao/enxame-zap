import React from 'react';
import {
  Save,
  Download,
  Upload,
  Play,
  Mic,
  Smartphone,
  CheckCircle2,
  FolderGit2,
} from 'lucide-react';
import { Funnel } from '../types';

interface HeaderProps {
  funnel: Funnel;
  onUpdateFunnelName: (name: string) => void;
  onSave: () => void;
  onExportZip: () => void;
  onImportClick: () => void;
  onOpenDashboard: () => void;
  onOpenSimulator: () => void;
  onOpenAudioStudio: () => void;
  isSaving?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  funnel,
  onUpdateFunnelName,
  onSave,
  onExportZip,
  onImportClick,
  onOpenDashboard,
  onOpenSimulator,
  onOpenAudioStudio,
  isSaving,
}) => {
  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-black/[0.08] flex items-center justify-between px-5 z-20 shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-[38px] h-[38px] bg-[#1d1d1f] rounded-xl flex items-center justify-center text-white font-extrabold text-lg tracking-tight shadow-md shrink-0">
          E
        </div>
        <div className="flex flex-col">
          <input
            id="funnel-name"
            className="border-none bg-transparent text-[17px] font-bold tracking-tight text-[#1d1d1f] outline-none hover:bg-black/[0.04] focus:bg-black/[0.06] rounded-md px-1.5 py-0.5 transition-colors w-64 md:w-80"
            value={funnel.nome}
            onChange={(e) => onUpdateFunnelName(e.target.value)}
            placeholder="Nome do Funil"
            title="Clique para renomear o funil"
          />
          <span
            id="funnel-stats"
            className="text-[12px] text-[#86868b] flex items-center gap-1.5 px-1.5"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {funnel.nodes.length} passos • {funnel.edges.length} ligações • backup automático ativo
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenAudioStudio}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-full text-[13px] font-semibold transition-all shadow-xs cursor-pointer"
          title="Gravar ou converter áudios HQ com ZapVoice 48kHz"
        >
          <Mic className="w-4 h-4 text-amber-700" />
          <span className="hidden sm:inline">PTT ZapVoice</span>
        </button>

        <button
          onClick={onOpenSimulator}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-[13px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
          title="Simular execução do funil no WhatsApp Web"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Simular Funil</span>
        </button>

        <button
          onClick={onOpenDashboard}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
          title="Painel rápido, estatísticas e gerador de extensão"
        >
          <Smartphone className="w-4 h-4 text-[#86868b]" />
          <span className="hidden md:inline">Painel / Extensão</span>
        </button>

        <button
          onClick={onImportClick}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
          title="Importar funil (.json ou .enxame.zip)"
        >
          <Upload className="w-4 h-4 text-[#86868b]" />
          <span className="hidden lg:inline">Importar</span>
        </button>

        <button
          onClick={onExportZip}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
          title="Exportar pacote completo .enxame.zip com mídias em alta"
        >
          <Download className="w-4 h-4 text-[#86868b]" />
          <span className="hidden xl:inline">Exportar .zip</span>
        </button>

        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1d1d1f] hover:bg-black text-white rounded-full text-[13px] font-semibold transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-60"
          title="Salvar no banco local e baixar auto-backup JSON"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Salvando...' : 'Salvar + Backup'}</span>
        </button>
      </div>
    </header>
  );
};
