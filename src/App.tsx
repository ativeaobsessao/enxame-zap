import React, { useState, useEffect, useRef } from 'react';
import { Funnel, FunnelNode, NodeType, MediaItem } from './types';
import {
  openDB,
  seedInitialFunnelIfEmpty,
  idbGet,
  idbPut,
  idbGetAll,
  generateUID,
} from './services/db';
import {
  exportFunnelZip,
  downloadJsonBackup,
  importFunnelFile,
} from './services/zipExport';
import { Header } from './components/Header';
import { LibrarySidebar } from './components/LibrarySidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { WhatsAppSimulatorModal } from './components/WhatsAppSimulatorModal';
import { AudioStudioModal } from './components/AudioStudioModal';
import { ExtensionDashboardModal } from './components/ExtensionDashboardModal';
import { Toast } from './components/Toast';

export function App() {
  const [funnel, setFunnel] = useState<Funnel>({
    id: generateUID(),
    nome: 'Novo Funil',
    nodes: [],
    edges: [],
    createdAt: Date.now(),
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [savedMedias, setSavedMedias] = useState<MediaItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isAudioStudioOpen, setIsAudioStudioOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileImportRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const loadSavedMedias = async () => {
    try {
      const audios = await idbGetAll<MediaItem>('audios');
      const textos = await idbGetAll<MediaItem>('textos');
      const imagens = await idbGetAll<MediaItem>('imagens');
      const videos = await idbGetAll<MediaItem>('videos');

      const all = [...audios, ...textos, ...imagens, ...videos].sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      setSavedMedias(all);
    } catch (err) {
      console.error('Error loading medias', err);
    }
  };

  const initApp = async () => {
    try {
      await openDB();
      const urlId = new URLSearchParams(window.location.search).get('id');
      if (urlId) {
        const found = await idbGet<Funnel>('funis', urlId);
        if (found) {
          setFunnel(found);
          await loadSavedMedias();
          return;
        }
      }
      const initial = await seedInitialFunnelIfEmpty();
      setFunnel(initial);
      await loadSavedMedias();
    } catch (err) {
      console.error('Database initialization error', err);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  // Update funnel name
  const handleUpdateFunnelName = (nome: string) => {
    setFunnel((prev) => ({ ...prev, nome }));
  };

  // Add new node to canvas
  const handleDropNewNode = (type: NodeType, x: number, y: number) => {
    const newNode: FunnelNode = {
      id: generateUID(),
      tipo: type,
      x,
      y,
      ordem: funnel.nodes.length + 1,
      delay: type === 'audio' ? 2500 : 1500,
      simularGravando: true,
      conteudo: type === 'texto' ? 'Olá {{nome}}! Tudo bem com você?' : '',
      nome: type === 'audio' ? 'Áudio PTT HQ' : undefined,
    };

    setFunnel((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newNode.id);
    showToast(`Card de ${type.toUpperCase()} adicionado ao canvas`);
  };

  const handleAddNodeFromLibrary = (type: NodeType) => {
    const lastNode = funnel.nodes[funnel.nodes.length - 1];
    const newX = lastNode ? lastNode.x + 320 : 120;
    const newY = lastNode ? lastNode.y : 120;
    handleDropNewNode(type, newX, newY);
  };

  // Node position update
  const handleUpdateNodePosition = (id: string, x: number, y: number) => {
    setFunnel((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  };

  // Node settings update from Inspector
  const handleUpdateNode = (updated: Partial<FunnelNode>) => {
    if (!selectedNodeId) return;
    setFunnel((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...updated } : n)),
    }));
  };

  // Delete node
  const handleDeleteNode = (id: string) => {
    setFunnel((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.de !== id && e.para !== id),
    }));
    if (selectedNodeId === id) setSelectedNodeId(null);
    showToast('Card removido do funil');
  };

  // Edges add / remove
  const handleAddEdge = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const exists = funnel.edges.some((e) => e.de === fromId && e.para === toId);
    if (!exists) {
      setFunnel((prev) => ({
        ...prev,
        edges: [...prev.edges, { de: fromId, para: toId }],
      }));
      showToast('Cards conectados!');
    }
  };

  const handleRemoveEdge = (fromId: string, toId: string) => {
    setFunnel((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => !(e.de === fromId && e.para === toId)),
    }));
    showToast('Ligação removida');
  };

  // Bind media to selected node
  const handleSelectMediaForNode = (media: MediaItem) => {
    if (!selectedNodeId) {
      showToast('Selecione um card no canvas primeiro para vincular a mídia');
      return;
    }

    setFunnel((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id === selectedNodeId) {
          return {
            ...node,
            mediaId: media.id,
            nome: media.nome || node.nome,
            previewUrl: media.previewUrl || (media.blob ? URL.createObjectURL(media.blob) : undefined),
            conteudo: media.tipo === 'texto' && media.conteudo ? media.conteudo : node.conteudo,
          };
        }
        return node;
      }),
    }));

    showToast(`Mídia "${media.nome || media.tipo}" vinculada ao card selecionado`);
  };

  // Save + Auto Backup
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Recalculate ordem topologically based on chain
      const visited = new Set<string>();
      let order = 0;
      const reorderedNodes = [...funnel.nodes];

      const dfs = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        const target = reorderedNodes.find((n) => n.id === id);
        if (target) {
          target.ordem = ++order;
        }
        funnel.edges.filter((e) => e.de === id).forEach((e) => dfs(e.para));
      };

      const incoming = new Set(funnel.edges.map((e) => e.para));
      const roots = reorderedNodes.filter((n) => !incoming.has(n.id));
      (roots.length > 0 ? roots : reorderedNodes).forEach((n) => dfs(n.id));

      const updatedFunnel: Funnel = {
        ...funnel,
        nodes: reorderedNodes,
        updatedAt: Date.now(),
      };

      await idbPut('funis', updatedFunnel);
      setFunnel(updatedFunnel);

      // Trigger auto backup download
      downloadJsonBackup(updatedFunnel);
      showToast(`Funil "${updatedFunnel.nome}" salvo + backup baixado`);
    } catch (err: unknown) {
      showToast('Erro ao salvar funil: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  // Export .enxame.zip
  const handleExportZip = async () => {
    try {
      showToast('Empacotando .enxame.zip com mídias em alta...');
      await exportFunnelZip(funnel);
      showToast('Export .enxame.zip concluído!');
    } catch (err: unknown) {
      showToast('Erro ao exportar zip: ' + (err as Error).message);
    }
  };

  // Import file (.json or .zip)
  const handleFileImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Importando funil...');
      const imported = await importFunnelFile(file);
      setFunnel(imported);
      setSelectedNodeId(null);
      await loadSavedMedias();
      showToast(`Funil "${imported.nome}" importado com sucesso!`);
    } catch (err: unknown) {
      showToast('Erro na importação: ' + (err as Error).message);
    } finally {
      if (fileImportRef.current) fileImportRef.current.value = '';
    }
  };

  // Create new blank funnel
  const handleCreateNewFunnel = () => {
    const newFunnel: Funnel = {
      id: generateUID(),
      nome: 'Novo Funil ZapVoice',
      nodes: [],
      edges: [],
      createdAt: Date.now(),
    };
    setFunnel(newFunnel);
    setSelectedNodeId(null);
    showToast('Novo funil criado');
  };

  const selectedNode = funnel.nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedNodeIndex = selectedNode ? funnel.nodes.indexOf(selectedNode) : -1;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fbfbfd] text-[#1d1d1f] overflow-hidden">
      {/* Top Header */}
      <Header
        funnel={funnel}
        onUpdateFunnelName={handleUpdateFunnelName}
        onSave={handleSave}
        onExportZip={handleExportZip}
        onImportClick={() => fileImportRef.current?.click()}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onOpenAudioStudio={() => setIsAudioStudioOpen(true)}
        isSaving={isSaving}
      />

      {/* Main 3-Column Studio Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Library & Saved Media */}
        <LibrarySidebar
          onAddNode={handleAddNodeFromLibrary}
          savedMedias={savedMedias}
          onSelectMediaForNode={handleSelectMediaForNode}
          onRefreshMedias={loadSavedMedias}
          selectedNodeId={selectedNodeId}
          onToast={showToast}
        />

        {/* Center: Canvas Flow */}
        <Canvas
          funnel={funnel}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onUpdateNodePosition={handleUpdateNodePosition}
          onAddEdge={handleAddEdge}
          onRemoveEdge={handleRemoveEdge}
          onDropNewNode={handleDropNewNode}
          onTestNode={() => setIsSimulatorOpen(true)}
        />

        {/* Right: Inspector */}
        <Inspector
          selectedNode={selectedNode}
          selectedNodeIndex={selectedNodeIndex}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onRefreshMedias={loadSavedMedias}
          onToast={showToast}
        />
      </div>

      {/* Hidden Import Input */}
      <input
        ref={fileImportRef}
        type="file"
        accept=".json,.zip,.enxame.zip"
        hidden
        onChange={handleFileImportChange}
      />

      {/* WhatsApp Simulator Modal */}
      <WhatsAppSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        funnel={funnel}
      />

      {/* PTT ZapVoice Audio Studio Modal */}
      <AudioStudioModal
        isOpen={isAudioStudioOpen}
        onClose={() => setIsAudioStudioOpen(false)}
        onAudioSaved={(media) => {
          loadSavedMedias();
          if (selectedNodeId) {
            handleSelectMediaForNode(media);
          }
        }}
        onToast={showToast}
      />

      {/* Extension & Funnels Dashboard Modal */}
      <ExtensionDashboardModal
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        currentFunnelId={funnel.id}
        onSelectFunnel={(f) => {
          setFunnel(f);
          setSelectedNodeId(null);
        }}
        onCreateNewFunnel={handleCreateNewFunnel}
        onToast={showToast}
      />

      {/* Floating Toast Notification */}
      <Toast message={toastMessage} onClear={() => setToastMessage(null)} />
    </div>
  );
}
export default App;
