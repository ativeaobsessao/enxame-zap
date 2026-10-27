import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Pause,
  CheckCheck,
  Mic,
  FileText,
  User,
  Paperclip,
  Smile,
  Send,
  Phone,
  Video,
  MoreVertical,
  Search,
} from 'lucide-react';
import { Funnel, FunnelNode, SimulatorMessage } from '../types';

interface WhatsAppSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  funnel: Funnel;
}

export const WhatsAppSimulatorModal: React.FC<WhatsAppSimulatorModalProps> = ({
  isOpen,
  onClose,
  funnel,
}) => {
  const [contactName, setContactName] = useState('Carla Rodrigues');
  const [messages, setMessages] = useState<SimulatorMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [currentStatus, setCurrentStatus] = useState<string>('online');
  const [delayCountdown, setDelayCountdown] = useState<number | null>(null);
  const [activeAudioPlaying, setActiveAudioPlaying] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Compute ordered nodes according to edges sequence
  const getOrderedNodes = (): FunnelNode[] => {
    if (!funnel.nodes.length) return [];
    const ordered: FunnelNode[] = [];
    const visited = new Set<string>();

    const incoming = new Set(funnel.edges.map((e) => e.para));
    const startNodes = funnel.nodes.filter((n) => !incoming.has(n.id));
    const roots = startNodes.length > 0 ? startNodes : [funnel.nodes[0]];

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = funnel.nodes.find((n) => n.id === nodeId);
      if (node) ordered.push(node);
      const nextEdges = funnel.edges.filter((e) => e.de === nodeId);
      nextEdges.forEach((e) => traverse(e.para));
    };

    roots.forEach((n) => traverse(n.id));

    // Add any remaining disconnected nodes
    funnel.nodes.forEach((n) => {
      if (!visited.has(n.id)) ordered.push(n);
    });

    return ordered;
  };

  const orderedNodes = getOrderedNodes();

  const resetSimulation = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsRunning(false);
    setCurrentStepIndex(-1);
    setCurrentStatus('online');
    setDelayCountdown(null);
    setMessages([]);
  };

  useEffect(() => {
    if (isOpen) {
      resetSimulation();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, funnel]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStatus]);

  // Execute steps sequentially with humanized delay
  const executeStep = (stepIdx: number) => {
    if (stepIdx >= orderedNodes.length) {
      setIsRunning(false);
      setCurrentStatus('online');
      setDelayCountdown(null);
      return;
    }

    const node = orderedNodes[stepIdx];
    setCurrentStepIndex(stepIdx);

    // Compute status simulation
    if (node.simularGravando !== false) {
      if (node.tipo === 'audio') {
        setCurrentStatus('gravando áudio...');
      } else {
        setCurrentStatus('digitando...');
      }
    } else {
      setCurrentStatus('online');
    }

    // Humanized jitter (between 500ms and 1500ms)
    const baseDelay = node.delay || 2000;
    const jitter = Math.floor(Math.random() * 1000) + 500;
    const totalDelay = Math.max(800, baseDelay + jitter);

    setDelayCountdown(totalDelay);

    timerRef.current = setTimeout(() => {
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const firstName = contactName.split(' ')[0] || 'você';
      const parsedText = (node.conteudo || '')
        .replace(/\{\{nome\}\}/gi, firstName)
        .replace(/\{\{nome_completo\}\}/gi, contactName);

      const newMsg: SimulatorMessage = {
        id: Math.random().toString(36).slice(2),
        nodeId: node.id,
        tipo: node.tipo,
        conteudo: parsedText,
        nome: node.nome || (node.tipo === 'audio' ? 'Áudio PTT 48kHz' : undefined),
        previewUrl: node.previewUrl,
        asDocument: node.asDocument,
        time: formattedTime,
        status: 'read',
      };

      setMessages((prev) => [...prev, newMsg]);
      setCurrentStatus('online');
      setDelayCountdown(null);

      // Trigger next step
      timerRef.current = setTimeout(() => {
        executeStep(stepIdx + 1);
      }, 400);
    }, totalDelay);
  };

  const handleStart = () => {
    if (orderedNodes.length === 0) return;
    setIsRunning(true);
    setMessages([]);
    executeStep(0);
  };

  const handlePause = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsRunning(false);
    setCurrentStatus('online');
    setDelayCountdown(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] max-h-[780px] shadow-2xl flex flex-col overflow-hidden animate-fade-in border border-black/[0.1]">
        {/* Top Control Bar */}
        <div className="bg-[#1d1d1f] text-white px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">📱</span>
            <div>
              <h2 className="text-[15px] font-bold leading-tight">
                Simulador WhatsApp Web • Enxame Zap
              </h2>
              <p className="text-[11px] text-[#86868b]">
                Testando funil em tempo real com PTT ZapVoice & delays humanizados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-xs">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-gray-300">Lead:</span>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nome do contato"
                className="bg-transparent font-medium text-white outline-none w-28 text-xs"
                title="Altere o nome para testar a substituição de {{nome}}"
              />
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Simulator Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel: Steps Tracker */}
          <div className="w-72 bg-[#fbfbfd] border-r border-black/[0.08] p-4 flex flex-col shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#86868b] mb-3">
              Fila de Disparo ({orderedNodes.length} passos)
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {orderedNodes.map((node, i) => {
                const isCurrent = currentStepIndex === i && isRunning;
                const isPassed = currentStepIndex > i || (!isRunning && messages.some((m) => m.nodeId === node.id));

                return (
                  <div
                    key={node.id}
                    className={`p-2.5 rounded-xl border text-xs transition-all ${
                      isCurrent
                        ? 'bg-emerald-50 border-emerald-500 shadow-sm'
                        : isPassed
                        ? 'bg-white border-black/[0.06] opacity-90'
                        : 'bg-white border-black/[0.06] opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[10px]">
                          {i + 1}
                        </span>
                        <span className="capitalize">{node.tipo}</span>
                      </span>
                      <span className="text-[10px] text-[#86868b]">{node.delay || 2000}ms</span>
                    </div>

                    <p className="mt-1 text-[11px] text-[#515154] truncate">
                      {node.tipo === 'texto' ? node.conteudo : node.nome || 'Arquivo multimídia'}
                    </p>

                    {isCurrent && delayCountdown && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-700 font-medium animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Simulando ({Math.round(delayCountdown / 100) / 10}s)...</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Controls */}
            <div className="pt-3 border-t border-black/[0.06] flex items-center gap-2">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{messages.length > 0 ? 'Reiniciar e Disparar' : 'Disparar Funil'}</span>
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pausar</span>
                </button>
              )}

              <button
                onClick={resetSimulation}
                className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors cursor-pointer"
                title="Limpar tela"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right panel: Realistic WhatsApp Viewport */}
          <div className="flex-1 flex flex-col bg-[#efeae2] relative overflow-hidden">
            {/* WhatsApp Header */}
            <div className="bg-[#f0f2f5] px-4 py-2.5 border-b border-black/[0.08] flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                  {contactName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#111b21] leading-tight">
                    {contactName}
                  </h3>
                  <p className="text-xs text-[#667781] leading-tight font-medium">
                    {currentStatus === 'online' ? (
                      'online'
                    ) : (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        {currentStatus === 'gravando áudio...' && <Mic className="w-3 h-3 animate-pulse" />}
                        {currentStatus}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[#54656f]">
                <Search className="w-4 h-4 cursor-pointer hover:text-black" />
                <MoreVertical className="w-4 h-4 cursor-pointer hover:text-black" />
              </div>
            </div>

            {/* Chat Wallpaper & Message List */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-3 wpp-wallpaper"
              style={{
                backgroundColor: '#efeae2',
                backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1.5px, transparent 1.5px)',
                backgroundSize: '20px 20px',
              }}
            >
              {/* Date banner */}
              <div className="flex justify-center my-2">
                <span className="bg-[#ffffff]/90 text-[#54656f] text-[11px] font-medium px-3 py-1 rounded-lg shadow-2xs">
                  HOJE
                </span>
              </div>

              {messages.length === 0 && (
                <div className="text-center py-12 text-[#667781] text-xs">
                  Pressione <strong className="text-emerald-700">Disparar Funil</strong> para iniciar a simulação automatizada com áudios PTT e delays reais.
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className="flex justify-end animate-fade-in">
                  <div className="max-w-[75%] md:max-w-[65%] bg-[#d9fdd3] rounded-2xl rounded-tr-xs p-2.5 shadow-sm text-[#111b21] text-[13.5px] leading-relaxed relative">
                    {/* Audio PTT ZapVoice Bubble */}
                    {msg.tipo === 'audio' && (
                      <div className="min-w-[240px] flex items-center gap-2.5 py-1">
                        <div className="relative">
                          <button
                            onClick={() => {
                              if (activeAudioPlaying === msg.id) {
                                setActiveAudioPlaying(null);
                              } else {
                                setActiveAudioPlaying(msg.id);
                              }
                            }}
                            className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-xs cursor-pointer hover:scale-105 transition-transform"
                          >
                            {activeAudioPlaying === msg.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>
                          <Mic className="w-3 h-3 text-emerald-800 absolute -bottom-1 -right-1" />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-0.5 h-6">
                            {Array.from({ length: 32 }).map((_, barIdx) => (
                              <div
                                key={barIdx}
                                className={`w-[2.5px] rounded-full transition-all ${
                                  activeAudioPlaying === msg.id
                                    ? 'bg-[#00a884]'
                                    : 'bg-[#54656f]/60'
                                }`}
                                style={{
                                  height: `${6 + ((barIdx * 11) % 18)}px`,
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#667781] mt-0.5">
                            <span>0:14 • PTT HQ 48kHz</span>
                            <span className="text-[10px] text-emerald-800 font-medium">ZapVoice</span>
                          </div>
                        </div>

                        {msg.previewUrl && (
                          <audio
                            src={msg.previewUrl}
                            autoPlay={activeAudioPlaying === msg.id}
                            onEnded={() => setActiveAudioPlaying(null)}
                            hidden
                          />
                        )}
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.tipo === 'texto' && (
                      <div className="whitespace-pre-wrap pr-10">{msg.conteudo}</div>
                    )}

                    {/* Image Message */}
                    {msg.tipo === 'imagem' && (
                      <div>
                        {msg.previewUrl ? (
                          <img
                            src={msg.previewUrl}
                            alt="HD"
                            className="rounded-lg max-h-60 w-full object-cover mb-1"
                          />
                        ) : (
                          <div className="bg-emerald-100/50 p-6 rounded-lg text-center text-xs text-[#54656f] mb-1 font-medium">
                            🖼️ Imagem em Alta Resolução (Original)
                          </div>
                        )}
                        {msg.asDocument && (
                          <div className="text-[11px] text-[#667781] italic">
                            Enviado como documento (HD máxima sem compressão)
                          </div>
                        )}
                      </div>
                    )}

                    {/* Video Message */}
                    {msg.tipo === 'video' && (
                      <div>
                        {msg.previewUrl ? (
                          <video
                            src={msg.previewUrl}
                            controls
                            className="rounded-lg max-h-60 w-full object-cover mb-1"
                          />
                        ) : (
                          <div className="bg-emerald-100/50 p-6 rounded-lg text-center text-xs text-[#54656f] mb-1 font-medium">
                            🎬 Vídeo em Alta Resolução (Original)
                          </div>
                        )}
                      </div>
                    )}

                    {/* Timestamp & double blue checkmark */}
                    <div className="flex items-center justify-end gap-1 text-[11px] text-[#667781] mt-1">
                      <span>{msg.time}</span>
                      <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                    </div>
                  </div>
                </div>
              ))}

              <div ref={chatBottomRef} />
            </div>

            {/* Fake WhatsApp Input */}
            <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center gap-3 shrink-0 border-t border-black/[0.08]">
              <Smile className="w-6 h-6 text-[#54656f] cursor-pointer" />
              <Paperclip className="w-5 h-5 text-[#54656f] cursor-pointer" />
              <div className="flex-1 bg-white rounded-lg px-4 py-2 text-xs text-[#54656f] shadow-2xs select-none">
                Mensagem...
              </div>
              <Mic className="w-6 h-6 text-[#54656f] cursor-pointer" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
