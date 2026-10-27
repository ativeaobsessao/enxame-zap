import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Trash2, Play, Volume2 } from 'lucide-react';
import { Funnel, FunnelNode, FunnelEdge, NodeType } from '../types';

interface CanvasProps {
  funnel: Funnel;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdateNodePosition: (id: string, x: number, y: number) => void;
  onAddEdge: (fromId: string, toId: string) => void;
  onRemoveEdge: (fromId: string, toId: string) => void;
  onDropNewNode: (type: NodeType, x: number, y: number) => void;
  onTestNode: (node: FunnelNode) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  funnel,
  selectedNodeId,
  onSelectNode,
  onUpdateNodePosition,
  onAddEdge,
  onRemoveEdge,
  onDropNewNode,
  onTestNode,
}) => {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle zooming
  const handleZoomIn = () => setScale((s) => Math.min(2.0, +(s + 0.1).toFixed(1)));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(1)));
  const handleCenterView = () => {
    setScale(1);
    if (canvasWrapRef.current) {
      canvasWrapRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  // Node Dragging
  const handleNodeMouseDown = (e: React.MouseEvent, node: FunnelNode) => {
    if ((e.target as HTMLElement).closest('.dot-connector')) return;
    if ((e.target as HTMLElement).tagName === 'AUDIO' || (e.target as HTMLElement).tagName === 'VIDEO') return;
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;

    onSelectNode(node.id);
    setDraggingNodeId(node.id);
    const wrap = canvasWrapRef.current?.getBoundingClientRect();
    if (!wrap) return;

    setDragOffset({
      x: e.clientX / scale - node.x,
      y: e.clientY / scale - node.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (connectingFrom && canvasWrapRef.current) {
        const rect = canvasWrapRef.current.getBoundingClientRect();
        const scrollL = canvasWrapRef.current.scrollLeft;
        const scrollT = canvasWrapRef.current.scrollTop;
        setMousePos({
          x: (e.clientX - rect.left + scrollL) / scale,
          y: (e.clientY - rect.top + scrollT) / scale,
        });
      }

      if (draggingNodeId && canvasWrapRef.current) {
        const wrapRect = canvasWrapRef.current.getBoundingClientRect();
        const scrollL = canvasWrapRef.current.scrollLeft;
        const scrollT = canvasWrapRef.current.scrollTop;
        const newX = Math.max(20, Math.round((e.clientX - wrapRect.left + scrollL) / scale - dragOffset.x));
        const newY = Math.max(20, Math.round((e.clientY - wrapRect.top + scrollT) / scale - dragOffset.y));
        onUpdateNodePosition(draggingNodeId, newX, newY);
      }
    };

    const handleMouseUp = () => {
      setDraggingNodeId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectingFrom(null);
        setMousePos(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [draggingNodeId, dragOffset, connectingFrom, scale, onUpdateNodePosition]);

  // Drop from library onto canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain') as NodeType;
    if (!type || !canvasWrapRef.current) return;

    const rect = canvasWrapRef.current.getBoundingClientRect();
    const scrollL = canvasWrapRef.current.scrollLeft;
    const scrollT = canvasWrapRef.current.scrollTop;

    const x = Math.max(40, Math.round((e.clientX - rect.left + scrollL) / scale - 130));
    const y = Math.max(40, Math.round((e.clientY - rect.top + scrollT) / scale - 40));

    onDropNewNode(type, x, y);
  };

  // Node connection dots
  const handleDotClick = (e: React.MouseEvent, nodeId: string, dotType: 'in' | 'out') => {
    e.stopPropagation();
    if (dotType === 'out') {
      if (connectingFrom === nodeId) {
        setConnectingFrom(null);
        setMousePos(null);
      } else {
        setConnectingFrom(nodeId);
      }
    } else if (dotType === 'in') {
      if (connectingFrom && connectingFrom !== nodeId) {
        onAddEdge(connectingFrom, nodeId);
        setConnectingFrom(null);
        setMousePos(null);
      }
    }
  };

  // Titles list for human order
  const titles = ['Primeira Mensagem', 'Segunda Mensagem', 'Terceira Mensagem', 'Quarta Mensagem', 'Quinta Mensagem', 'Sexta Mensagem'];

  return (
    <main
      ref={canvasWrapRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => {
        setConnectingFrom(null);
        setMousePos(null);
      }}
      className="flex-1 relative overflow-auto bg-[#f5f5f7] select-none"
      style={{
        backgroundImage: 'radial-gradient(rgba(0,0,0,0.08) 1.5px, transparent 1.5px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div
        className="relative min-w-[2800px] min-h-[2200px] origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        {/* SVG Edges Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#1d1d1f" />
            </marker>
          </defs>

          {/* Render existing edges */}
          {funnel.edges.map((edge) => {
            const fromNode = funnel.nodes.find((n) => n.id === edge.de);
            const toNode = funnel.nodes.find((n) => n.id === edge.para);
            if (!fromNode || !toNode) return null;

            const fromX = fromNode.x + 130;
            const fromY = fromNode.y + 195;
            const toX = toNode.x + 130;
            const toY = toNode.y;

            const midY = (fromY + toY) / 2;
            const pathData = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;

            return (
              <g key={`${edge.de}-${edge.para}`} className="group pointer-events-auto">
                {/* Wider invisible stroke for easy clicking to remove */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="16"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEdge(edge.de, edge.para);
                  }}
                />
                <path
                  d={pathData}
                  fill="none"
                  stroke="#1d1d1f"
                  strokeWidth="2.5"
                  strokeDasharray="6 6"
                  opacity="0.85"
                  className="flowing-edge"
                />
                {/* Delete button on hover over midpoint */}
                <circle
                  cx={(fromX + toX) / 2}
                  cy={midY}
                  r="10"
                  fill="#ff3b30"
                  className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEdge(edge.de, edge.para);
                  }}
                />
              </g>
            );
          })}

          {/* Render live connection line if in connecting mode */}
          {connectingFrom && mousePos && (() => {
            const fromNode = funnel.nodes.find((n) => n.id === connectingFrom);
            if (!fromNode) return null;
            const fromX = fromNode.x + 130;
            const fromY = fromNode.y + 195;
            const toX = mousePos.x;
            const toY = mousePos.y;
            const midY = (fromY + toY) / 2;
            return (
              <path
                d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                fill="none"
                stroke="#007aff"
                strokeWidth="2.5"
                strokeDasharray="4 4"
                className="flowing-edge"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0 pointer-events-auto z-20">
          {funnel.nodes.length === 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-md border border-black/[0.08] rounded-full px-6 py-3.5 text-sm text-[#86868b] shadow-lg pointer-events-none">
              Arraste os blocos da biblioteca à esquerda para começar seu funil
            </div>
          )}

          {funnel.nodes.map((node, idx) => {
            const isSelected = selectedNodeId === node.id;
            const title = titles[idx] || `Mensagem ${idx + 1}`;
            const isConnectingOut = connectingFrom === node.id;

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
                className={`absolute w-[260px] bg-white rounded-2xl p-3.5 shadow-md border cursor-grab active:cursor-grabbing transition-shadow ${
                  isSelected
                    ? 'border-[#1d1d1f] shadow-xl ring-2 ring-black/10'
                    : 'border-black/[0.08] hover:shadow-lg'
                }`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                }}
              >
                {/* Top Input Dot */}
                <div
                  onClick={(e) => handleDotClick(e, node.id, 'in')}
                  className={`dot-connector absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1d1d1f] border-2 border-white rounded-full shadow-md cursor-pointer z-30 transition-transform ${
                    connectingFrom && connectingFrom !== node.id
                      ? 'scale-125 bg-emerald-500 animate-bounce'
                      : 'hover:scale-125'
                  }`}
                  title="Ponto de entrada (ligação vinda de outro card)"
                />

                {/* Card Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-bold text-[#1d1d1f] truncate">
                    {title}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-[#f5f5f7] text-[#86868b] px-2 py-0.5 rounded-full shrink-0">
                    {node.tipo === 'audio' && 'ÁUDIO HQ'}
                    {node.tipo === 'texto' && 'TEXTO'}
                    {node.tipo === 'imagem' && 'IMAGEM HD'}
                    {node.tipo === 'video' && 'VÍDEO HD'}
                  </span>
                </div>

                {/* Card Preview Area */}
                <div className="bg-[#fbfbfd] border border-black/[0.04] rounded-xl p-2.5 min-h-[52px]">
                  {node.tipo === 'audio' && (
                    <div>
                      <div className="flex items-center gap-1 h-5 mb-1.5 px-1">
                        {Array.from({ length: 16 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-[3px] bg-[#1d1d1f] rounded-full transition-all"
                            style={{ height: `${6 + ((i * 7) % 14)}px` }}
                          />
                        ))}
                      </div>
                      <div className="text-[11px] text-[#86868b] truncate">
                        {node.nome || 'Áudio PTT • 48kHz OGG Opus'}
                      </div>
                      {node.previewUrl && (
                        <audio
                          src={node.previewUrl}
                          controls
                          className="w-full mt-2 h-7 rounded"
                        />
                      )}
                    </div>
                  )}

                  {node.tipo === 'texto' && (
                    <div className="text-[12px] leading-relaxed text-[#1d1d1f] line-clamp-3 whitespace-pre-wrap">
                      {node.conteudo || 'Clique para editar o texto com {{nome}}'}
                    </div>
                  )}

                  {node.tipo === 'imagem' && (
                    <div>
                      {node.previewUrl ? (
                        <img
                          src={node.previewUrl}
                          alt="Preview"
                          className="w-full max-h-[110px] object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-[12px] text-[#86868b] flex items-center justify-center py-4">
                          Imagem HD original
                        </div>
                      )}
                    </div>
                  )}

                  {node.tipo === 'video' && (
                    <div>
                      {node.previewUrl ? (
                        <video
                          src={node.previewUrl}
                          muted
                          className="w-full max-h-[110px] object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-[12px] text-[#86868b] flex items-center justify-center py-4">
                          Vídeo HD original
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Sub-info */}
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#86868b]">
                  <span>Delay: {node.delay || 2000}ms</span>
                  {node.simularGravando && (
                    <span className="text-emerald-600 font-medium text-[10px]">
                      ● simulação ativa
                    </span>
                  )}
                </div>

                {/* Bottom Output Dot */}
                <div
                  onClick={(e) => handleDotClick(e, node.id, 'out')}
                  className={`dot-connector absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md cursor-pointer z-30 transition-transform ${
                    isConnectingOut
                      ? 'scale-150 bg-[#007aff] ring-4 ring-blue-300'
                      : 'bg-[#1d1d1f] hover:scale-125'
                  }`}
                  title="Ponto de saída (clique aqui e depois no ponto superior do próximo card para ligar)"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Canvas Controls */}
      <div className="absolute right-5 bottom-5 flex flex-col gap-2 z-30">
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 rounded-full bg-white border border-black/[0.08] shadow-md flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all text-[#1d1d1f] cursor-pointer"
          title="Aumentar zoom (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 rounded-full bg-white border border-black/[0.08] shadow-md flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all text-[#1d1d1f] cursor-pointer"
          title="Diminuir zoom (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleCenterView}
          className="w-9 h-9 rounded-full bg-white border border-black/[0.08] shadow-md flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all text-[#1d1d1f] cursor-pointer"
          title="Centralizar e resetar zoom"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Help banner when connecting */}
      {connectingFrom && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1d1d1f] text-white px-4 py-2 rounded-full text-xs font-medium shadow-lg z-30 flex items-center gap-2 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span>Clique no ponto superior de outro card para conectar (Esc para cancelar)</span>
        </div>
      )}
    </main>
  );
};
