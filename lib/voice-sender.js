/**
 * Enxame Zap v2.10.1 - voice-sender.js (ISOLATED World)
 * Envio de mensagem de voz nativa (PTT) pelo WhatsApp Web usando microfone virtual.
 * Executa sequência coordenada com mutex, simulação de eventos em camadas e confirmação.
 */
(function() {
  if (window.EnxameVoiceSender) {
    return;
  }

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][VoiceSender]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][VoiceSender]', ...args);

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

      try {
        // 2. Armar microfone virtual no mundo MAIN
        logDebug('[VoiceSender] Armando microfone virtual via ponte...');
        const armRes = await window.EnxameBridge.request('vmic_arm', {
          blob,
          duration,
          mime: blob.type || 'audio/ogg; codecs=opus',
          ttlMs: 30000
        }, { timeoutMs: 10000 });

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
          const waitLimit = Date.now() + 2500;
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
        const totalDurationMs = Math.ceil(audioDurationSec * 1000) + 350 + 300;
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

          await sleep(250);
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
          const waitClose = Date.now() + 1500;
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
        const confirmTimeout = Date.now() + 8000;
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
          await sleep(250);
        }

        logDebug(`[VoiceSender] Envio finalizado. Confirmado: ${confirmed}`);
        return {
          ok: true,
          strategy: 'VMIC',
          confirmed
        };
      } catch (err) {
        err.mayHaveSent = op.mayHaveSent;
        throw err;
      } finally {
        activeOperation = null;
      }
    }
  };

  window.EnxameVoiceSender = EnxameVoiceSender;
  logDebug('EnxameVoiceSender v2.10.1 inicializado no mundo ISOLATED.');
})();
