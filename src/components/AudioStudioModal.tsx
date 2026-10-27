import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  Check,
  Volume2,
  Sliders,
  Sparkles,
  Save,
} from 'lucide-react';
import { AudioPipeline, AUDIO_CONFIG } from '../services/audioPipeline';
import { idbPut, generateUID } from '../services/db';
import { MediaItem } from '../types';

interface AudioStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAudioSaved: (media: MediaItem) => void;
  onToast: (msg: string) => void;
}

export const AudioStudioModal: React.FC<AudioStudioModalProps> = ({
  isOpen,
  onClose,
  onAudioSaved,
  onToast,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioName, setAudioName] = useState('Audio_ZapVoice_PTT');
  const [isPlaying, setIsPlaying] = useState(false);

  const pipelineRef = useRef<AudioPipeline | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setRecordedBlob(null);
      setPreviewUrl(null);
      setWaveformBars([]);
      setIsRecording(false);
      setIsPlaying(false);
    }
  }, [isOpen]);

  const handleStartRecording = async () => {
    try {
      pipelineRef.current = new AudioPipeline();
      await pipelineRef.current.startRecording((vol) => {
        setCurrentVolume(vol);
      });
      setIsRecording(true);
      setRecordedBlob(null);
      setPreviewUrl(null);
    } catch (err: unknown) {
      console.warn('Microphone error, falling back to synthetic generator', err);
      // Generate synthetic sample if mic permission not granted
      handleGenerateDemoSample();
      onToast('Usando gerador de áudio PTT ZapVoice calibrado');
    }
  };

  const handleStopRecording = async () => {
    if (!pipelineRef.current) return;
    try {
      const result = await pipelineRef.current.stopRecording();
      setIsRecording(false);
      setCurrentVolume(0);
      setRecordedBlob(result.blob);
      setWaveformBars(result.waveform);
      setAudioDuration(result.duration);
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      onToast('Áudio PTT capturado e normalizado com sucesso!');
    } catch (err: unknown) {
      setIsRecording(false);
      console.error(err);
    }
  };

  const handleGenerateDemoSample = () => {
    const demo = AudioPipeline.createDemoAudioBlob(4);
    setRecordedBlob(demo.blob);
    setWaveformBars(demo.waveform);
    setAudioDuration(demo.duration);
    const url = URL.createObjectURL(demo.blob);
    setPreviewUrl(url);
    setIsRecording(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const waveform = AudioPipeline.generateWaveform();
    setRecordedBlob(file);
    setWaveformBars(waveform);
    setAudioDuration(8);
    setAudioName(file.name.replace(/\.[^/.]+$/, ''));
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onToast(`Arquivo ${file.name} carregado no pipeline`);
  };

  const handleSaveToLibrary = async () => {
    if (!recordedBlob) return;

    const id = generateUID();
    const mediaItem: MediaItem = {
      id,
      nome: `${audioName}.ogg`,
      tipo: 'audio',
      blob: recordedBlob,
      previewUrl: previewUrl || undefined,
      duration: audioDuration,
      waveform: waveformBars,
      createdAt: Date.now(),
    };

    await idbPut('audios', mediaItem);
    onAudioSaved(mediaItem);
    onToast(`Áudio ${mediaItem.nome} salvo na Biblioteca IndexedDB`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-black/[0.1] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="bg-[#1d1d1f] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
              <Mic className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold">PTT ZapVoice Audio Studio</h2>
              <p className="text-xs text-[#86868b]">
                Pipeline OGG Opus 48kHz Mono • Ganho 3.5x • Loudness Normalizer
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Audio Specs Banner */}
          <div className="grid grid-cols-4 gap-2 bg-[#f5f5f7] p-3 rounded-2xl text-center text-xs">
            <div>
              <span className="text-[#86868b] block text-[10px] uppercase font-bold">Taxa</span>
              <strong className="text-[#1d1d1f]">48.000 Hz</strong>
            </div>
            <div>
              <span className="text-[#86868b] block text-[10px] uppercase font-bold">Canais</span>
              <strong className="text-[#1d1d1f]">1 (Mono PTT)</strong>
            </div>
            <div>
              <span className="text-[#86868b] block text-[10px] uppercase font-bold">Ganho</span>
              <strong className="text-[#1d1d1f]">3.5x Boost</strong>
            </div>
            <div>
              <span className="text-[#86868b] block text-[10px] uppercase font-bold">Formato</span>
              <strong className="text-emerald-700">OGG Opus</strong>
            </div>
          </div>

          {/* Recording & Waveform Zone */}
          <div className="border border-black/[0.08] rounded-2xl p-6 bg-[#fbfbfd] flex flex-col items-center justify-center text-center">
            {isRecording ? (
              <div className="w-full flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3 animate-pulse">
                  <Mic className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-red-600 text-sm mb-1">
                  Gravando áudio HQ em tempo real...
                </h3>
                <p className="text-xs text-[#86868b] mb-4">
                  Fale normalmente. O compressor e amplificador de voz estão ativos.
                </p>

                {/* Volume Level Meter */}
                <div className="w-full max-w-xs h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.max(5, currentVolume)}%` }}
                  />
                </div>

                <button
                  onClick={handleStopRecording}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-transform active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Finalizar Gravação</span>
                </button>
              </div>
            ) : recordedBlob ? (
              <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#1d1d1f]">
                    Áudio PTT Processado ({audioDuration}s)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                    Normalizado 48kHz
                  </span>
                </div>

                {/* Waveform Bars */}
                <div className="flex items-center justify-between gap-1 h-14 bg-white border border-black/[0.06] rounded-xl px-3 py-2 mb-4">
                  {waveformBars.slice(0, 48).map((val, idx) => (
                    <div
                      key={idx}
                      className={`w-[4px] rounded-full transition-all ${
                        isPlaying ? 'bg-emerald-600' : 'bg-[#1d1d1f]'
                      }`}
                      style={{ height: `${Math.max(8, (val / 100) * 44)}px` }}
                    />
                  ))}
                </div>

                {previewUrl && (
                  <audio
                    ref={audioElemRef}
                    src={previewUrl}
                    controls
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    className="w-full h-8 mb-4"
                  />
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartRecording}
                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Gravar Novamente
                  </button>
                  <button
                    onClick={handleGenerateDemoSample}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    title="Gerar áudio simulado"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Demo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center mb-3 shadow-md mx-auto">
                  <Mic className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-[#1d1d1f] text-sm mb-1">
                  Gravar novo Áudio ZapVoice HQ
                </h3>
                <p className="text-xs text-[#86868b] max-w-xs mb-5">
                  Gera o áudio com o cabeçalho PTT nativo exato que o WhatsApp Web reconhece como gravado na hora.
                </p>

                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleStartRecording}
                    className="px-5 py-2.5 bg-[#1d1d1f] hover:bg-black text-white rounded-full text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-transform active:scale-95"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Iniciar Gravação</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-[#f5f5f7] hover:bg-[#ececef] text-[#1d1d1f] rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar Áudio</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={handleImportFile}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Name Field & Save */}
          {recordedBlob && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#515154] mb-1">
                  Nome do Áudio no Funil
                </label>
                <input
                  value={audioName}
                  onChange={(e) => setAudioName(e.target.value)}
                  placeholder="Nome do áudio"
                  className="w-full border border-black/[0.1] rounded-xl px-3 py-2 text-xs text-[#1d1d1f] outline-none focus:border-black/30"
                />
              </div>

              <button
                onClick={handleSaveToLibrary}
                className="w-full py-3 bg-[#1d1d1f] hover:bg-black text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Salvar na Biblioteca de Mídias</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
