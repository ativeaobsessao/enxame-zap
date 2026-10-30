/**
 * Enxame Zap v2.10.2 - voice-sender.js (ISOLATED World)
 * Envio de mensagem de voz nativa (PTT) pelo WhatsApp Web usando microfone virtual.
 * v2.10.2:
 * - Ocultação completa da tela de gravação nativa (sem flash/piscar)
 * - Camada CSS declarativa com html.enxame-voice-sending e :has()
 * - Camada JS adaptativa com MutationObserver no footer e data-enxame-vhide="1"
 * - Retenção de 800ms pós-gravação e remoção imediata em caso de erro
 * - Gravador de piscadas em alta fidelidade quando localStorage.enxameFlashDebug === '1'
 * - Preservação estrita dos tempos originais (lead-in 350ms, tail 300ms, etc.)
 */
(function() {
  if (window.EnxameVoiceSender) {
    return;
  }

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const isFlashDebug = () => {
    try { return localStorage.getItem('enxameFlashDebug') === '1'; } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][VoiceSender]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][VoiceSender]', ...args);

  const CONFIG = {
    LEAD_IN_MS: 350,
    TAIL_MS: 300,
    MIC_LAYER_WAIT_MS: 2500,
    POLL_INTERVAL_MS: 250,
    SEND_LAYER_WAIT_MS: 1500,
    CONFIRM_TIMEOUT_MS: 8000,
    HIDE_HOLD_MS: 800,
    ARM_TTL_MS: 30000,
    ARM_TIMEOUT_MS: 10000
  };

  let activeOperation = null;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getChatTitle() {
    try {
      const el = document.querySelector('[data-testid="conversation-info-header-chat-title"]') ||
                 document.querySelector('header span[title]') ||
                 document.querySelector('header [title]');
      return (el?.getAttribute('title') || el?.textContent || '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Dispara sequência de eventos com coordenadas de centro do elemento.
   */
  function dispatchPointerMouseClick(target) {
    if (!target) return false;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const common = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

    try { target.dispatchEvent(new PointerEvent('pointerdown', common)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mousedown', common)); } catch (e) {}
    try { target.dispatchEvent(new PointerEvent('pointerup', common)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mouseup', common)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('click', common)); } catch (e) {}
    return true;
  }

  /**
   * Camadas de ativação para botões do DOM do WhatsApp.
   * T1: element.click()
   * T2: sequência no próprio elemento
   * T3: sequência no firstElementChild || element
   */
  function activateElementLayer(el, layer) {
    if (!el) return false;
    if (layer === 'T1') {
      try { el.click(); return true; } catch (e) { return false; }
    }
    if (layer === 'T2') {
      return dispatchPointerMouseClick(el);
    }
    if (layer === 'T3') {
      const target = el.firstElementChild || el;
      return dispatchPointerMouseClick(target);
    }
    return false;
  }

  function isRecorderActive() {
    return !!document.querySelector('#main footer button[aria-label="Pausar gravação"]');
  }

  function findMicButton() {
    return document.querySelector('#main footer button[aria-label="Mensagem de voz"]');
  }

  function findCancelButton() {
    return document.querySelector('#main footer button[aria-label="Cancelar"]');
  }

  function findSendButton() {
    const btn = document.querySelector('#main footer button[aria-label="Enviar"]');
    if (!btn) return null;
    const ariaLabel = btn.getAttribute('aria-label');
    // NUNCA clicar em botões proibidos
    if (ariaLabel === 'Ativar a visualização única' || ariaLabel === 'Pausar gravação') {
      return null;
    }
    return btn;
  }

  function clickCancelButton() {
    const btn = findCancelButton();
    if (!btn) return false;
    // Ordem para Cancelar: T1 -> T3 -> T2
    activateElementLayer(btn, 'T1');
    if (isRecorderActive()) activateElementLayer(btn, 'T3');
    if (isRecorderActive()) activateElementLayer(btn, 'T2');
    return true;
  }

  // ===== OCULTAÇÃO DA TELA DE GRAVAÇÃO (Tarefa A) =====
  function getHideMode() {
    if (localStorage.getItem('enxameShowPreview') === '1') return 'off';
    const custom = localStorage.getItem('enxameHideMode');
    if (custom === 'offscreen' || custom === 'off' || custom === 'opacity') return custom;
    return 'opacity';
  }

  function ensureVoiceHideStyle() {
    const mode = getHideMode();
    if (mode === 'off') {
      const existing = document.getElementById('enxame-voice-hide-style');
      if (existing) existing.remove();
      return;
    }
    let style = document.getElementById('enxame-voice-hide-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'enxame-voice-hide-style';
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.dataset.mode !== mode) {
      style.dataset.mode = mode;
      style.textContent = buildVoiceCss(mode);
    }
  }

  function buildVoiceCss(mode) {
    if (mode === 'offscreen') {
      return `
        html.enxame-voice-sending #main footer div:has(button[aria-label="Cancelar"]):has(button[aria-label="Pausar gravação"]):has(button[aria-label="Enviar"]):not(:has(div:has(button[aria-label="Cancelar"]):has(button[aria-label="Pausar gravação"]):has(button[aria-label="Enviar"]))),
        [data-enxame-vhide="offscreen"], [data-enxame-vhide="1"], [data-enxame-vhide="opacity"] {
          position: fixed !important;
          left: -200vw !important;
          top: 0 !important;
          pointer-events: none !important;
          transition: none !important;
          animation: none !important;
        }
      `;
    }
    return `
      html.enxame-voice-sending #main footer div:has(button[aria-label="Cancelar"]):has(button[aria-label="Pausar gravação"]):has(button[aria-label="Enviar"]):not(:has(div:has(button[aria-label="Cancelar"]):has(button[aria-label="Pausar gravação"]):has(button[aria-label="Enviar"]))) {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: none !important;
        animation: none !important;
      }
      [data-enxame-vhide="opacity"], [data-enxame-vhide="1"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: none !important;
        animation: none !important;
      }
      [data-enxame-vhide="offscreen"] {
        position: fixed !important;
        left: -200vw !important;
        top: 0 !important;
        pointer-events: none !important;
        transition: none !important;
        animation: none !important;
      }
    `;
  }

  const vHiddenElements = new Set();
  let vHideSafetyTimer = null;
  let vHideHoldTimer = null;
  let vFooterObserver = null;
  let currentFlashRecorder = null;

  function applyHidingToRecordingContainer(footer) {
    const mode = getHideMode();
    if (mode === 'off' || !footer) return;

    const bCancel = footer.querySelector('button[aria-label="Cancelar"]');
    const bPause = footer.querySelector('button[aria-label="Pausar gravação"]');
    const bSend = footer.querySelector('button[aria-label="Enviar"]');
    if (!bCancel || !bPause || !bSend) return;

    // Encontrar menor ancestral comum dentro do footer
    let lca = null;
    let curr = bCancel.parentElement;
    while (curr && curr !== footer) {
      if (curr.contains(bPause) && curr.contains(bSend)) {
        lca = curr;
        break;
      }
      curr = curr.parentElement;
    }

    const hideVal = mode === 'offscreen' ? 'offscreen' : '1';

    if (lca) {
      if (lca.getAttribute('data-enxame-vhide') !== hideVal) {
        lca.setAttribute('data-enxame-vhide', hideVal);
        vHiddenElements.add(lca);
      }
      return lca;
    }

    // Se o ancestral comum for o próprio footer, marcar cada filho direto que contenha algum dos três botões
    const targets = [bCancel, bPause, bSend];
    let markedAny = false;
    targets.forEach(btn => {
      let child = btn;
      while (child && child.parentElement && child.parentElement !== footer) {
        child = child.parentElement;
      }
      if (child && child.parentElement === footer) {
        if (child.getAttribute('data-enxame-vhide') !== hideVal) {
          child.setAttribute('data-enxame-vhide', hideVal);
          vHiddenElements.add(child);
        }
        markedAny = true;
      }
    });

    if (!markedAny) {
      logWarn('Nenhum contêiner de gravação plausível encontrado no footer');
    }
  }

  function startFooterObserver(footer) {
    if (vFooterObserver) {
      vFooterObserver.disconnect();
      vFooterObserver = null;
    }
    if (!footer || getHideMode() === 'off') return;

    applyHidingToRecordingContainer(footer);

    vFooterObserver = new MutationObserver(() => {
      applyHidingToRecordingContainer(footer);
    });
    vFooterObserver.observe(footer, { childList: true, subtree: true });
  }

  function stopFooterObserver() {
    if (vFooterObserver) {
      vFooterObserver.disconnect();
      vFooterObserver = null;
    }
  }

  function clearAllHidingImmediate() {
    if (vHideSafetyTimer) {
      clearTimeout(vHideSafetyTimer);
      vHideSafetyTimer = null;
    }
    if (vHideHoldTimer) {
      clearTimeout(vHideHoldTimer);
      vHideHoldTimer = null;
    }
    stopFooterObserver();

    document.documentElement.classList.remove('enxame-voice-sending');
    vHiddenElements.forEach(el => {
      try { el.removeAttribute('data-enxame-vhide'); } catch (e) {}
    });
    vHiddenElements.clear();

    document.querySelectorAll('[data-enxame-vhide]').forEach(el => {
      try { el.removeAttribute('data-enxame-vhide'); } catch (e) {}
    });

    if (currentFlashRecorder) {
      currentFlashRecorder.stop();
      currentFlashRecorder = null;
    }
  }

  function scheduleHidingRemoval(delayMs = CONFIG.HIDE_HOLD_MS) {
    if (vHideHoldTimer) {
      clearTimeout(vHideHoldTimer);
      vHideHoldTimer = null;
    }
    stopFooterObserver();

    vHideHoldTimer = setTimeout(() => {
      clearAllHidingImmediate();
      vHideHoldTimer = null;
    }, delayMs);
  }

  // ===== DIAGNÓSTICO DE PISCADAS (Tarefa C) =====
  function getEffectiveOpacity(el) {
    let curr = el;
    let opacity = 1.0;
    while (curr && curr !== document.documentElement) {
      const style = window.getComputedStyle(curr);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      const op = parseFloat(style.opacity);
      if (!isNaN(op)) opacity *= op;
      if (opacity < 0.001) return 0;
      curr = curr.parentElement;
    }
    return opacity;
  }

  function isElementVisuallyRendered(el) {
    if (!el || !(el instanceof Element) || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    const hasArea = rect.width > 0 && rect.height > 0 &&
                    rect.bottom > 0 && rect.right > 0 &&
                    rect.top < window.innerHeight && rect.left < window.innerWidth;
    if (!hasArea) return false;
    return getEffectiveOpacity(el) > 0.02;
  }

  function createVoiceFlashRecorder(t0) {
    if (!isFlashDebug()) {
      return {
        stop: () => {}
      };
    }

    let active = true;
    let frameCount = 0;
    let visCount = 0;
    let primeiroVisivelEmMs = null;
    const badFrames = [];

    const loop = () => {
      if (!active) return;
      frameCount++;
      const nowMs = performance.now() - t0;

      const footer = document.querySelector('#main footer');
      let container = null;
      if (footer) {
        container = footer.querySelector('[data-enxame-vhide]') ||
          footer.querySelector('div:has(button[aria-label="Cancelar"]):has(button[aria-label="Pausar gravação"]):has(button[aria-label="Enviar"])');
      }

      const isVis = isElementVisuallyRendered(container);
      if (isVis) {
        visCount++;
        if (primeiroVisivelEmMs === null) {
          primeiroVisivelEmMs = nowMs;
        }
        badFrames.push({
          frame: frameCount,
          ms: Math.round(nowMs)
        });
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);

    return {
      stop() {
        if (!active) return;
        active = false;
        const fimRetencaoEmMs = performance.now() - t0;
        console.log(`[Enxame][Flash][Voz] quadros=${frameCount} gravadorVisivel=${visCount} primeiroVisivelEmMs=${primeiroVisivelEmMs !== null ? Math.round(primeiroVisivelEmMs) : 'null'} fimRetencaoEmMs=${Math.round(fimRetencaoEmMs)}`);
        if (visCount > 0) {
          console.warn('[Enxame][Flash][Voz] Detalhes dos quadros visíveis:', badFrames);
        }
      }
    };
  }

  const EnxameVoiceSender = {
    cancel() {
      if (activeOperation) {
        logDebug('[VoiceSender] Cancelamento solicitado pelo usuário');
        activeOperation.cancelled = true;
        clickCancelButton();
        if (window.EnxameBridge) {
          window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
        }
      }
    },

    async send(params = {}) {
      if (activeOperation) {
        const err = new Error('Outra gravação ou envio de áudio já está em andamento (BUSY)');
        err.code = 'BUSY';
        throw err;
      }

      const { blob, duration = 1, onProgress } = params;

      // 1. Pré-condições estritas
      const mainEl = document.querySelector('#main');
      if (!mainEl) {
        const err = new Error('Abra uma conversa para enviar (NO_CHAT_OPEN)');
        err.code = 'NO_CHAT_OPEN';
        throw err;
      }

      const footer = document.querySelector('#main footer');
      if (!footer) {
        const err = new Error('Área de envio do WhatsApp não encontrada (FOOTER_NOT_FOUND)');
        err.code = 'FOOTER_NOT_FOUND';
        throw err;
      }

      const initialTitle = getChatTitle();
      if (!initialTitle) {
        const err = new Error('Destinatário não identificado (NO_CHAT_OPEN)');
        err.code = 'NO_CHAT_OPEN';
        throw err;
      }

      if (isRecorderActive()) {
        const err = new Error('Gravação de áudio já ativa no WhatsApp (RECORDER_BUSY)');
        err.code = 'RECORDER_BUSY';
        throw err;
      }

      const micBtn = findMicButton();
      if (!micBtn) {
        const err = new Error('Botão de microfone não encontrado (MIC_BUTTON_NOT_FOUND)');
        err.code = 'MIC_BUTTON_NOT_FOUND';
        throw err;
      }

      if (!blob || !(blob instanceof Blob)) {
        const err = new Error('Blob de áudio inválido (INVALID_BLOB)');
        err.code = 'INVALID_BLOB';
        throw err;
      }

      if (!window.EnxameBridge) {
        const err = new Error('Ponte de comunicação não carregada (BRIDGE_NOT_FOUND)');
        err.code = 'BRIDGE_NOT_FOUND';
        throw err;
      }

      // Snapshot das mensagens existentes no chat para confirmação posterior
      const initialMsgIds = new Set(
        [...document.querySelectorAll('#main [data-testid^="conv-msg-"]')].map(el => el.getAttribute('data-testid'))
      );

      const op = {
        cancelled: false,
        mayHaveSent: false
      };
      activeOperation = op;

      // Cancela qualquer retenção pendente de envio anterior
      if (vHideHoldTimer) {
        clearAllHidingImmediate();
      }

      // Configuração inicial de ocultação da gravação
      const mode = getHideMode();
      if (mode !== 'off') {
        ensureVoiceHideStyle();
        document.documentElement.classList.add('enxame-voice-sending');
        startFooterObserver(footer);
      }

      const t0 = performance.now();
      currentFlashRecorder = createVoiceFlashRecorder(t0);

      const estimatedTotalDurationMs = Math.ceil((duration || 1) * 1000) + CONFIG.LEAD_IN_MS + CONFIG.TAIL_MS;
      vHideSafetyTimer = setTimeout(() => {
        logWarn('Safety timer de ocultação acionado');
        clearAllHidingImmediate();
      }, estimatedTotalDurationMs + 20000);

      try {
        // 2. Armar microfone virtual no mundo MAIN
        logDebug('[VoiceSender] Armando microfone virtual via ponte...');
        const armRes = await window.EnxameBridge.request('vmic_arm', {
          blob,
          duration,
          mime: blob.type || 'audio/ogg; codecs=opus',
          ttlMs: CONFIG.ARM_TTL_MS
        }, { timeoutMs: CONFIG.ARM_TIMEOUT_MS });

        if (!armRes.ok) {
          const err = new Error('Falha ao armar microfone virtual (ARM_FAILED)');
          err.code = 'ARM_FAILED';
          throw err;
        }

        // 3. Ativar o microfone no WhatsApp com camadas T3 -> T2 -> T1
        logDebug('[VoiceSender] Clicando no botão de microfone (T3 -> T2 -> T1)...');
        const micLayers = ['T3', 'T2', 'T1'];
        let recordingStarted = false;

        for (const layer of micLayers) {
          if (op.cancelled) break;
          const currentMic = findMicButton();
          if (!currentMic) {
            if (isRecorderActive()) {
              recordingStarted = true;
              break;
            }
          } else {
            activateElementLayer(currentMic, layer);
          }

          // Espera até 2,5s por camada verificando se "Pausar gravação" apareceu
          const waitLimit = Date.now() + CONFIG.MIC_LAYER_WAIT_MS;
          while (Date.now() < waitLimit) {
            if (op.cancelled || isRecorderActive()) {
              recordingStarted = true;
              break;
            }
            await sleep(100);
          }

          if (recordingStarted) {
            break;
          }
        }

        if (op.cancelled) {
          clickCancelButton();
          await window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
          const err = new Error('Envio de áudio cancelado pelo usuário (CANCELLED)');
          err.code = 'CANCELLED';
          throw err;
        }

        if (!recordingStarted && !isRecorderActive()) {
          await window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
          const err = new Error('WhatsApp não iniciou a gravação do microfone (RECORDER_NOT_STARTED)');
          err.code = 'RECORDER_NOT_STARTED';
          throw err;
        }

        // 4. Aguardar reprodução completa do stream de áudio virtual
        // Duração + 350ms lead-in + 300ms tail
        const audioDurationSec = armRes.data?.duration || duration || 1;
        const totalDurationMs = Math.ceil(audioDurationSec * 1000) + CONFIG.LEAD_IN_MS + CONFIG.TAIL_MS;
        const endTime = Date.now() + totalDurationMs;

        logDebug(`[VoiceSender] Gravação em andamento. Aguardando ${totalDurationMs}ms...`);

        while (Date.now() < endTime) {
          if (op.cancelled) {
            clickCancelButton();
            await window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
            const err = new Error('Envio de áudio cancelado pelo usuário (CANCELLED)');
            err.code = 'CANCELLED';
            throw err;
          }

          // Segurança: verificar se o destinatário mudou durante a gravação
          const currentTitle = getChatTitle();
          if (currentTitle && initialTitle && currentTitle !== initialTitle) {
            logWarn(`[VoiceSender] Conversa alterada durante gravação: "${initialTitle}" -> "${currentTitle}"`);
            clickCancelButton();
            await window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
            const err = new Error('Destinatário alterado durante gravação (CHAT_CHANGED)');
            err.code = 'CHAT_CHANGED';
            throw err;
          }

          // Verificar se a interface de gravação foi fechada externamente
          if (!isRecorderActive()) {
            await window.EnxameBridge.request('vmic_disarm', {}).catch(() => {});
            const err = new Error('A interface de gravação foi fechada inesperadamente (RECORDER_CLOSED)');
            err.code = 'RECORDER_CLOSED';
            throw err;
          }

          const remainingMs = Math.max(0, endTime - Date.now());
          const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
          if (typeof onProgress === 'function') {
            try { onProgress(remainingSec); } catch (e) {}
          }

          await sleep(CONFIG.POLL_INTERVAL_MS);
        }

        // 5. Clicar no botão Enviar da gravação (T1 -> T3 -> T2)
        logDebug('[VoiceSender] Áudio concluído. Clicando no botão Enviar...');
        const sendLayers = ['T1', 'T3', 'T2'];
        op.mayHaveSent = true;

        for (const layer of sendLayers) {
          if (op.cancelled) break;
          const sendBtn = findSendButton();
          if (!sendBtn || !isRecorderActive()) {
            break;
          }

          activateElementLayer(sendBtn, layer);

          // Espera até 1,5s verificando se a interface de gravação fechou
          const waitClose = Date.now() + CONFIG.SEND_LAYER_WAIT_MS;
          while (Date.now() < waitClose) {
            if (!isRecorderActive()) {
              break;
            }
            await sleep(100);
          }

          if (!isRecorderActive()) {
            break;
          }
        }

        // 6. Confirmação do envio no DOM do chat (espera até 8s pela nova bolha)
        logDebug('[VoiceSender] Aguardando confirmação no chat...');
        const confirmTimeout = Date.now() + CONFIG.CONFIRM_TIMEOUT_MS;
        let confirmed = false;

        while (Date.now() < confirmTimeout) {
          const currentMsgs = document.querySelectorAll('#main [data-testid^="conv-msg-"]');
          for (const msgEl of currentMsgs) {
            const testId = msgEl.getAttribute('data-testid');
            if (testId && !initialMsgIds.has(testId)) {
              // Nova mensagem detectada
              const statusEl = msgEl.querySelector('[aria-label="Pendente"], [aria-label="Enviada"], [aria-label="Entregue"], [aria-label="Lida"], span[data-icon="msg-time"], span[data-icon="msg-check"], span[data-icon="msg-dblcheck"]');
              if (statusEl || !isRecorderActive()) {
                confirmed = true;
                break;
              }
            }
          }
          if (confirmed) break;
          await sleep(CONFIG.POLL_INTERVAL_MS);
        }

        logDebug(`[VoiceSender] Envio finalizado. Confirmado: ${confirmed}`);

        // Agendar remoção da ocultação após retenção de 800ms em background
        scheduleHidingRemoval(CONFIG.HIDE_HOLD_MS);

        return {
          ok: true,
          strategy: 'VMIC',
          confirmed
        };
      } catch (err) {
        // Remoção imediata da ocultação em qualquer erro (sem retenção)
        clearAllHidingImmediate();
        err.mayHaveSent = op.mayHaveSent;
        throw err;
      } finally {
        activeOperation = null;
      }
    }
  };

  window.EnxameVoiceSender = EnxameVoiceSender;
  logDebug('EnxameVoiceSender v2.10.2 inicializado no mundo ISOLATED.');
})();
