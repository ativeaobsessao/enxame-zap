# Enxame Zap - Funil HQ & PTT ZapVoice v2.7

Suíte visual completa em React + TypeScript + Tailwind CSS para construção de funis automatizados e processamento de áudio PTT nativo ZapVoice (48kHz OGG Opus, 3.5x gain booster) para WhatsApp Web.

## Recursos Principais

- **Visual Funnel Builder**:
  - Canvas interativo com drag-and-drop de blocos (Áudio HQ, Texto com `{{nome}}`, Imagem HD, Vídeo HD)
  - Conexões direcionadas entre cards com curvas Bezier SVG estilizadas
  - Painel inspetor de cards com delay personalizável (+ jitter humanizado anti-bloqueio)
  - Toggles para "Simular gravando / digitando" e "Enviar como documento (HD máxima)"
  - Biblioteca de mídias salvas localmente em alta fidelidade via IndexedDB (`enxame_zap_db`)
- **PTT ZapVoice Audio Studio**:
  - Gravador de voz em tempo real calibrado para as especificações ZapVoice
  - 48.000 Hz, canal mono, 128 kbps, compressor de dinâmica e ganho 3.5x
  - Visualizador de ondas sonoras de 64 barras e gerador de amostras demonstrativas
  - Importação e conversão de arquivos de áudio externos para PTT
- **Simulador WhatsApp Web**:
  - Teste interativo do fluxo do funil em viewport fidedigna do WhatsApp Web
  - Substituição dinâmica de variáveis `{{nome}}` e `{{nome_completo}}`
  - Feedback visual dos status "digitando..." e "gravando áudio..." durante o delay
  - Bolhas de áudio PTT reproduzíveis com barras de onda sonoras
- **Gestão de Backups & Extensão**:
  - Salvar + Backup automático (.json) a cada alteração
  - Exportação e importação de pacotes completos `.enxame.zip` (contendo `funil.json` e pasta `/midias/`)
  - Painel com estatísticas em tempo real (Áudios HQ, Funis e Mídias)
  - Gerador do pacote para instalação no Google Chrome (`chrome://extensions`)

## Execução

```bash
npm run dev
```

Inicia o servidor na porta 3000 em `http://0.0.0.0:3000`.
