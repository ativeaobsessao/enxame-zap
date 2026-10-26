/**
 * Enxame Zap - Mapeador Guiado de Elementos do DOM (WhatsApp Web)
 * SOMENTE LEITURA: Não clica, não digita, não envia e não altera nada no DOM.
 * Cole diretamente no DevTools Console (F12) com o WhatsApp Web aberto.
 */
(() => {
  if (window.__ENXAME_MAPPER_ACTIVE__) {
    console.warn('[Enxame Mapper] Mapeador já ativo. Digite enxameFinish() para encerrar e ver o JSON.');
    return;
  }
  window.__ENXAME_MAPPER_ACTIVE__ = true;

  const results = {
    timestamp: new Date().toISOString(),
    language: document.documentElement.lang || navigator.language || 'unknown',
    userAgent: navigator.userAgent,
    steps: {}
  };

  // Sanitização estrita de privacidade
  function mask(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/(\d{4})\d{4,}(\d{2}@(c|g)\.us)/g, '$1****$2')
      .replace(/\b\d{6,}\b/g, '***DIGITS***')
      .trim();
  }

  // Gera candidatos ordenados por estabilidade SEM usar classes
  function getCandidateSelectors(el) {
    if (!el || !(el instanceof Element)) return [];
    const candidates = [];
    const tag = el.tagName.toLowerCase();

    // 1. data-icon direto ou no primeiro filho SVG/SPAN
    const dataIcon = el.getAttribute('data-icon') || el.querySelector('[data-icon]')?.getAttribute('data-icon');
    if (dataIcon) {
      if (el.getAttribute('data-icon')) {
        candidates.push(`[data-icon="${dataIcon}"]`);
      } else {
        candidates.push(`${tag}:has([data-icon="${dataIcon}"])`);
      }
    }

    // 2. data-testid
    const testId = el.getAttribute('data-testid');
    if (testId) candidates.push(`[data-testid="${testId}"]`);

    // 3. aria-label (sanitizado de dados pessoais)
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && !/\d{5,}/.test(ariaLabel)) {
      candidates.push(`[aria-label="${mask(ariaLabel)}"]`);
      candidates.push(`${tag}[aria-label="${mask(ariaLabel)}"]`);
    }

    // 4. Atributos semânticos funcionais (type, accept, role, title)
    const type = el.getAttribute('type');
    const accept = el.getAttribute('accept');
    if (type === 'file' && accept) {
      candidates.push(`input[type="file"][accept="${accept}"]`);
      if (accept.includes('image')) candidates.push('input[type="file"][accept*="image"]');
      if (accept.includes('video')) candidates.push('input[type="file"][accept*="video"]');
    }

    const title = el.getAttribute('title');
    if (title && !/\d{5,}/.test(title)) {
      candidates.push(`${tag}[title="${mask(title)}"]`);
    }

    const role = el.getAttribute('role');
    if (role) {
      if (testId) candidates.push(`[role="${role}"][data-testid="${testId}"]`);
      if (ariaLabel) candidates.push(`[role="${role}"][aria-label="${mask(ariaLabel)}"]`);
    }

    // 5. Estrutura semântica contextual (footer, header, main)
    const inFooter = el.closest('footer');
    const inHeader = el.closest('header');
    const inMain = el.closest('#main');

    if (tag === 'div' && el.getAttribute('contenteditable') === 'true') {
      const dataTab = el.getAttribute('data-tab');
      if (dataTab) candidates.push(`div[contenteditable="true"][data-tab="${dataTab}"]`);
      if (inFooter) candidates.push('footer div[contenteditable="true"]');
      candidates.push('div[contenteditable="true"]');
    }

    if (inFooter && tag === 'button') {
      if (dataIcon) candidates.push(`footer button:has([data-icon="${dataIcon}"])`);
    }
    if (inHeader && tag === 'span' && title) {
      candidates.push(`header span[title="${mask(title)}"]`);
    }

    // Remove duplicatas mantendo ordem
    return [...new Set(candidates)];
  }

  function describeElement(el, label) {
    if (!el) return null;
    return {
      label: label || el.tagName.toLowerCase(),
      tag: el.tagName.toLowerCase(),
      selectors: getCandidateSelectors(el),
      ariaLabel: mask(el.getAttribute('aria-label')),
      title: mask(el.getAttribute('title')),
      dataIcon: el.getAttribute('data-icon') || el.querySelector('[data-icon]')?.getAttribute('data-icon') || null,
      dataTestId: el.getAttribute('data-testid') || null,
      accept: el.getAttribute('accept') || null
    };
  }

  // Passos do guia interativo
  const STEPS = [
    {
      id: 'step1_chat_aberto',
      title: 'Passo 1: Chat Aberto (Compose, Rodapé, Anexar, Microfone, Enviar)',
      instruction: 'Abra uma conversa qualquer no WhatsApp Web. Em seguida, digite 1 letra no campo de texto (NÃO envie) para capturarmos o botão de envio.',
      run: () => {
        const snap = {};
        const footer = document.querySelector('footer, [data-testid="conversation-compose-box"]');
        snap.footer = describeElement(footer, 'Container do Rodapé (Footer)');

        const compose = document.querySelector('div[contenteditable="true"]');
        snap.composeBox = describeElement(compose, 'Campo de Texto (Compose Box)');

        const clip = document.querySelector('button [data-icon="plus"], [data-icon="clip"], [data-icon="attach-menu-plus"]')?.closest('button');
        snap.attachButton = describeElement(clip, 'Botão de Anexar (+ / Clipe)');

        const mic = document.querySelector('button [data-icon="ptt"], [data-icon="mic"], [data-icon="ptt-fast"]')?.closest('button');
        snap.micButton = describeElement(mic, 'Botão do Microfone PTT');

        const sendBtn = document.querySelector('button [data-icon="send"], [data-testid="compose-btn-send"]')?.closest('button');
        snap.sendButton = describeElement(sendBtn, 'Botão de Enviar (se já digitou 1 letra)');

        return snap;
      }
    },
    {
      id: 'step2_menu_anexos',
      title: 'Passo 2: Menu de Anexos e Inputs de Arquivo',
      instruction: 'Clique no botão de anexar (+ ou clipe) para abrir as opções (Fotos/Vídeos, Documento, etc.).',
      run: () => {
        const snap = { fileInputs: [], menuItems: [] };
        // Captura todos os input file presentes no DOM
        document.querySelectorAll('input[type="file"]').forEach((inp, idx) => {
          snap.fileInputs.push(describeElement(inp, `Input File #${idx + 1}`));
        });

        // Itens visíveis do menu popover
        const menuButtons = document.querySelectorAll('li [role="button"], ul [role="button"], div[role="application"] button, div[role="menu"] [role="menuitem"]');
        menuButtons.forEach((btn, idx) => {
          const text = mask(btn.textContent || btn.getAttribute('aria-label') || '');
          snap.menuItems.push(describeElement(btn, `Menu Item #${idx + 1} (${text})`));
        });

        return snap;
      }
    },
    {
      id: 'step3_preview_imagem',
      title: 'Passo 3: Diálogo de Preview de Imagem',
      instruction: 'Selecione uma IMAGEM pelo menu e aguarde abrir o diálogo de preview (NÃO envie a imagem).',
      run: () => {
        const snap = {};
        const previewDialog = document.querySelector('div[role="dialog"], [data-testid="media-preview-dialog"], div[aria-modal="true"]');
        snap.dialog = describeElement(previewDialog, 'Modal de Preview');

        const sendBtn = previewDialog?.querySelector('button [data-icon="send"], [data-testid="send"]')?.closest('button') || document.querySelector('button [data-icon="send"]')?.closest('button');
        snap.sendButton = describeElement(sendBtn, 'Botão Enviar Mídia');

        const caption = previewDialog?.querySelector('div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"][data-tab]');
        snap.captionInput = describeElement(caption, 'Campo de Legenda');

        const closeBtn = previewDialog?.querySelector('button [data-icon="x"], [data-icon="x-light"], [aria-label*="Fechar"], [aria-label*="Close"]')?.closest('button');
        snap.closeButton = describeElement(closeBtn, 'Botão Fechar Preview (X)');

        const hdBtn = previewDialog?.querySelector('button [data-icon*="hd"], [aria-label*="HD"], [data-testid*="hd"]')?.closest('button');
        snap.hdSelector = describeElement(hdBtn, 'Seletor de Qualidade HD (se existente)');

        return snap;
      }
    },
    {
      id: 'step4_preview_video',
      title: 'Passo 4: Diálogo de Preview de Vídeo',
      instruction: 'Agora selecione um VÍDEO (pode fechar o preview anterior no X). Observe o preview abrir (NÃO envie).',
      run: () => {
        const snap = {};
        const previewDialog = document.querySelector('div[role="dialog"], [data-testid="media-preview-dialog"], div[aria-modal="true"]');
        snap.dialog = describeElement(previewDialog, 'Modal de Preview de Vídeo');

        const videoEl = previewDialog?.querySelector('video') || document.querySelector('video');
        snap.videoElement = describeElement(videoEl, 'Tag <video> de preview');

        const sendBtn = previewDialog?.querySelector('button [data-icon="send"]')?.closest('button');
        snap.sendButton = describeElement(sendBtn, 'Botão Enviar Vídeo');

        const muteBtn = previewDialog?.querySelector('button [data-icon*="volume"], button [data-icon*="mute"]')?.closest('button');
        snap.muteToggle = describeElement(muteBtn, 'Alternador de Áudio/GIF');

        return snap;
      }
    },
    {
      id: 'step5_gravador_audio',
      title: 'Passo 5: UI do Gravador Nativo de Áudio',
      instruction: 'Feche o preview. Em seguida, clique no botão de microfone para iniciar uma gravação (depois cancele na lixeira).',
      run: () => {
        const snap = {};
        const cancelBtn = document.querySelector('button [data-icon="x"], button [data-icon="delete"], button [data-icon="trash"]')?.closest('button');
        snap.cancelButton = describeElement(cancelBtn, 'Botão Cancelar/Lixeira de Gravação');

        const sendAudioBtn = document.querySelector('button [data-icon="send"]')?.closest('button');
        snap.sendAudioButton = describeElement(sendAudioBtn, 'Botão Enviar Áudio Gravado');

        const timer = document.querySelector('footer [role="timer"], footer span[dir="auto"]');
        snap.timer = describeElement(timer, 'Contador de Tempo de Áudio');

        return snap;
      }
    },
    {
      id: 'step6_mensagens_chat',
      title: 'Passo 6: Elementos de Mensagem Enviada',
      instruction: 'Observando a última mensagem enviada no chat atual para mapear bolhas e status.',
      run: () => {
        const snap = {};
        const msgRows = [...document.querySelectorAll('#main [data-id], [data-testid="msg-container"]')].slice(-5);
        snap.sampleMessages = msgRows.map((msg, i) => {
          const rawId = msg.getAttribute('data-id') || '';
          return {
            index: i + 1,
            dataIdMasked: mask(rawId),
            isOut: rawId.startsWith('true_') || msg.classList.contains('message-out'),
            hasAudio: !!msg.querySelector('audio, [data-icon="audio-play"], [data-icon="ptt-play"]'),
            hasImage: !!msg.querySelector('img[src*="blob:"], [data-icon="image"]'),
            hasVideo: !!msg.querySelector('video, [data-icon="video-play"]'),
            statusIcon: msg.querySelector('[data-icon*="check"], [data-icon*="time"]')?.getAttribute('data-icon') || null
          };
        });

        // Seletores genéricos das bolhas
        snap.bubbleAudio = describeElement(document.querySelector('#main button [data-icon*="play"]')?.closest('button'), 'Play de Áudio na Mensagem');
        snap.bubbleStatus = describeElement(document.querySelector('#main [data-icon="msg-dblcheck"], #main [data-icon="status-dblcheck"]'), 'Ícone de Check Duplo');

        return snap;
      }
    },
    {
      id: 'step7_cabecalho_chat',
      title: 'Passo 7: Cabeçalho do Chat',
      instruction: 'Mapeando o cabeçalho ativo da conversa.',
      run: () => {
        const snap = {};
        const header = document.querySelector('header, [data-testid="conversation-header"]');
        snap.headerContainer = describeElement(header, 'Cabeçalho');

        const titleEl = header?.querySelector('span[title], [data-testid="conversation-info-header-chat-title"]');
        snap.titleElement = describeElement(titleEl, 'Elemento com Título/Nome do Contato');

        return snap;
      }
    }
  ];

  let currentStepIdx = 0;

  function printGuide(idx) {
    if (idx >= STEPS.length) {
      finish();
      return;
    }
    const step = STEPS[idx];
    console.log(
      `%c[Enxame DOM Mapper] %c${step.title}`,
      'background:#1d1d1f;color:#30d158;padding:4px 8px;border-radius:6px;font-weight:700',
      'background:#f5f5f7;color:#1d1d1f;padding:4px 8px;border-radius:6px;font-weight:600'
    );
    console.log(`%c👉 Instrução: ${step.instruction}`, 'color:#0071e3;font-size:12px;font-weight:500');
    console.log('%c💡 Quando estiver pronto, digite: %cenxameNext()%c para gravar este passo e avançar.', 'color:#86868b', 'color:#1d1d1f;font-weight:700', 'color:#86868b');
  }

  function advanceStep() {
    if (currentStepIdx < STEPS.length) {
      const step = STEPS[currentStepIdx];
      try {
        const captured = step.run();
        results.steps[step.id] = {
          title: step.title,
          data: captured
        };
        console.log(`%c✓ Passo "${step.title}" capturado com sucesso!`, 'color:#30d158;font-weight:700');
      } catch (e) {
        console.error(`Erro ao capturar ${step.title}:`, e);
      }
      currentStepIdx++;
      if (currentStepIdx < STEPS.length) {
        printGuide(currentStepIdx);
      } else {
        finish();
      }
    } else {
      finish();
    }
  }

  function finish() {
    observer.disconnect();
    window.removeEventListener('click', clickListener, true);
    window.__ENXAME_MAPPER_ACTIVE__ = false;

    console.log('%c[Enxame DOM Mapper] CONCLUÍDO! Gerando relatório JSON...', 'background:#30d158;color:#fff;padding:6px 12px;border-radius:999px;font-weight:800');
    const jsonStr = JSON.stringify(results, null, 2);
    console.log(jsonStr);

    if (typeof copy === 'function') {
      try {
        copy(jsonStr);
        console.log('%c📋 JSON copiado para a área de transferência com copy()!', 'background:#0071e3;color:#fff;padding:4px 10px;border-radius:999px;font-weight:600');
      } catch {
        console.log('Selecione e copie o JSON impresso acima.');
      }
    } else {
      console.log('Selecione e copie o JSON impresso acima.');
    }
  }

  // Observer passivo apenas para detectar mudanças de UI (abertura de modals, etc.)
  const observer = new MutationObserver(() => {
    // Apenas registra mutações no background
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Listener em fase de captura para logging passivo
  const clickListener = (e) => {
    // Somente leitura: não cancela, não redireciona
    const target = e.target;
    if (target instanceof Element) {
      const icon = target.getAttribute('data-icon') || target.closest('[data-icon]')?.getAttribute('data-icon');
      if (icon) {
        // Log leve informativo
      }
    }
  };
  window.addEventListener('click', clickListener, { capture: true, passive: true });

  // Comandos expostos no console
  window.enxameNext = advanceStep;
  window.enxameFinish = finish;
  window.enxameHelp = () => {
    console.log('Comandos do Mapeador:\n - enxameNext(): grava o passo atual e avança\n - enxameFinish(): encerra imediatamente e gera o JSON');
  };

  console.log('%c[Enxame Zap] Mapeador Guiado de Elementos do DOM Ativado', 'background:#1d1d1f;color:#fff;padding:6px 12px;border-radius:999px;font-weight:700');
  console.log('Idioma detectado:', results.language);
  printGuide(0);
})();
