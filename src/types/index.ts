export type NodeType = 'audio' | 'texto' | 'imagem' | 'video';

export interface FunnelNode {
  id: string;
  tipo: NodeType;
  x: number;
  y: number;
  ordem?: number;
  nome?: string;
  conteudo?: string;
  mediaId?: string;
  previewUrl?: string;
  delay?: number;
  simularGravando?: boolean;
  asDocument?: boolean;
}

export interface FunnelEdge {
  de: string;
  para: string;
}

export interface Funnel {
  id: string;
  nome: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  createdAt: number;
  updatedAt?: number;
}

export interface MediaItem {
  id: string;
  nome?: string;
  tipo: NodeType;
  conteudo?: string;
  blob?: Blob;
  previewUrl?: string;
  duration?: number;
  waveform?: number[];
  createdAt: number;
}

export interface SimulatorMessage {
  id: string;
  nodeId: string;
  tipo: NodeType;
  conteudo?: string;
  previewUrl?: string;
  nome?: string;
  asDocument?: boolean;
  time: string;
  duration?: number;
  waveform?: number[];
  status: 'sending' | 'sent' | 'read';
}
