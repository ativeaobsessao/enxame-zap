/**
 * Enxame Zap v2.10.1 - wpp-main.js (MAIN World)
 * Adaptador fino em mundo MAIN.
 * WA-JS desativado; envio de áudio migrado para o microfone virtual (main-vmic.js).
 */
(function() {
  if (window.__ENXAME_MAIN_LOADED__) {
    return;
  }
  window.__ENXAME_MAIN_LOADED__ = true;

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][MAIN]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][MAIN]', ...args);

  // Histórico circular das últimas 20 operações para diagnóstico (sem conteúdo sensível)
  const ringBuffer = [];
  function pushRing(entry) {
    ringBuffer.push({ ts: Date.now(), ...entry });
    if (ringBuffer.length > 20) ringBuffer.shift();
  }

  // Deduplicação estrita com TTL de 60s
  const seenRequests = new Map();
  function isDuplicate(id) {
    if (!id) return false;
    const now = Date.now();
    for (const [k, exp] of seenRequests.entries()) {
      if (exp < now) seenRequests.delete(k);
    }
    if (seenRequests.has(id)) return true;
    seenRequests.set(id, now + 60000);
    return false;
  }

  function emitProgress(id, stage) {
    pushRing({ type: 'progress', id, stage });
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'progress',
      id,
      stage
    }, '*');
  }

  function emitResponse(id, ok, opts = {}) {
    pushRing({
      type: 'response',
      id,
      ok: !!ok,
      stage: opts.stage || null,
      code: opts.error?.code || null,
      mayHaveSent: !!opts.mayHaveSent
    });
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'res',
      id,
      ok: !!ok,
      strategy: opts.strategy || 'WAJS',
      stage: opts.stage || null,
      mayHaveSent: !!opts.mayHaveSent,
      error: opts.error ? {
        code: opts.error.code || 'UNKNOWN_ERROR',
        message: opts.error.message || String(opts.error),
        diag: opts.error.diag || null
      } : null,
      data: opts.data || null
    }, '*');
  }

  /**
   * Verifica prontidão do WA-JS sem polling ou espera ociosa quando ausente.
   */
  function waitForWppReady(timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      if (window.WPP && window.WPP.isReady) {
        return resolve(window.WPP);
      }
      const err = new Error('WA-JS não carregado ou desativado (WAJS_NOT_READY)');
      err.code = 'WAJS_NOT_READY';
      reject(err);
    });
  }

  /**
   * Resolve o chat ativo exclusivamente através das funções do WA-JS.
   */
  async function resolveActiveChat() {
    const inspectedMethods = [];
    let chat = null;

    if (typeof window.WPP?.chat?.getActiveChat === 'function') {
      inspectedMethods.push('WPP.chat.getActiveChat');
      try { chat = await window.WPP.chat.getActiveChat(); } catch (e) {}
    }
    if (!chat && typeof window.WPP?.chat?.getActiveChatId === 'function') {
      inspectedMethods.push('WPP.chat.getActiveChatId');
      try {
        const id = await window.WPP.chat.getActiveChatId();
        if (id) {
          if (typeof window.WPP.chat.get === 'function') {
            chat = await window.WPP.chat.get(id);
          } else {
            chat = { id };
          }
        }
      } catch (e) {}
    }
    if (!chat && typeof window.WPP?.whatsapp?.ChatStore?.getActive === 'function') {
      inspectedMethods.push('WPP.whatsapp.ChatStore.getActive');
      try { chat = await window.WPP.whatsapp.ChatStore.getActive(); } catch (e) {}
    }

    if (!chat) {
      return { chat: null, chatId: null, chatTitle: '', inspectedMethods };
    }

    const chatId = chat.id?._serialized || (typeof chat.id === 'string' ? chat.id : null);
    const chatTitle = chat.formattedTitle || chat.name || chat.contact?.formattedName || chat.contact?.name || chat.title || '';

    return { chat, chatId, chatTitle, inspectedMethods };
  }

  /**
   * Normaliza título para conferência de segurança de destinatário.
   */
  function normalizeTitle(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao converter áudio para Data URL'));
      reader.readAsDataURL(blob);
    });
  }

  async function getWppCapabilities() {
    const wajsLoaded = typeof window.WPP !== 'undefined';
    const wajsReady = !!window.WPP?.isReady;
    const hasSendFileMessage = typeof window.WPP?.chat?.sendFileMessage === 'function';
    const hasActiveChatApi = typeof window.WPP?.chat?.getActiveChat === 'function' ||
                             typeof window.WPP?.chat?.getActiveChatId === 'function' ||
                             typeof window.WPP?.whatsapp?.ChatStore?.getActive === 'function';
    let activeChatResolved = false;
    if (hasActiveChatApi) {
      try {
        const { chatId } = await resolveActiveChat();
        activeChatResolved = !!chatId;
      } catch {}
    }
    const wajsVersion = window.WPP?.version || null;

    return {
      wajsLoaded,
      wajsReady,
      hasSendFileMessage,
      hasActiveChatApi,
      activeChatResolved,
      wajsVersion
    };
  }

  /**
   * Processa o envio de áudio PTT pelo WA-JS oficial.
   */
  async function handleSendMedia(id, payload) {
    const startTime = Date.now();
    let sendAttempted = false;

    try {
      emitProgress(id, 'WAITING_WAJS');
      await waitForWppReady(15000);

      if (typeof window.WPP?.chat?.sendFileMessage !== 'function') {
        const err = new Error('Função WPP.chat.sendFileMessage não disponível');
        err.code = 'WAJS_NOT_READY';
        throw err;
      }

      // 1. Resolver o chat aberto pelo WA-JS
      emitProgress(id, 'RESOLVING_CHAT');
      const { chatId, chatTitle: resolvedTitle, inspectedMethods } = await resolveActiveChat();
      if (!chatId) {
        const err = new Error('Nenhum chat ativo encontrado no WA-JS (CHAT_UNRESOLVED)');
        err.code = 'CHAT_UNRESOLVED';
        err.diag = { inspectedMethods };
        throw err;
      }

      // 2. Segurança de destinatário: comparar título do cabeçalho com o título resolvido
      const titleCheckEnabled = (localStorage.getItem('enxameTitleCheck') !== 'off');
      if (titleCheckEnabled) {
        if (!resolvedTitle) {
          const err = new Error('Título do chat ativo não identificado no WA-JS (CHAT_UNRESOLVED)');
          err.code = 'CHAT_UNRESOLVED';
          throw err;
        }
        const normExpected = normalizeTitle(payload.chatTitle);
        const normResolved = normalizeTitle(resolvedTitle);
        const matches = normExpected && normResolved &&
          (normExpected.includes(normResolved) || normResolved.includes(normExpected));

        if (!matches) {
          const err = new Error(`Destinatário divergente do chat aberto: "${normExpected}" vs "${normResolved}"`);
          err.code = 'CHAT_MISMATCH';
          err.diag = { expected: normExpected, resolved: normResolved };
          throw err;
        }
      }

      // 3. Converter blob de áudio para base64 data URL
      emitProgress(id, 'PREPARING_MEDIA');
      let audioBlob = payload.blob;
      if (!audioBlob && payload.buffer instanceof ArrayBuffer) {
        audioBlob = new Blob([payload.buffer], { type: payload.mime || 'audio/ogg; codecs=opus' });
      }
      if (!audioBlob || !(audioBlob instanceof Blob)) {
        const err = new Error('Áudio ausente ou inválido no payload (BAD_PAYLOAD)');
        err.code = 'BAD_PAYLOAD';
        throw err;
      }
      const dataUrl = await blobToDataUrl(audioBlob);

      // 4. Envio oficial via WPP.chat.sendFileMessage
      // Observação de arquitetura:
      // Não enviamos opções manuais de waveform porque o WA-JS gera automaticamente a waveform
      // e os metadados nativos de áudio PTT do WhatsApp Web a partir do arquivo Ogg/Opus codificado.
      emitProgress(id, 'SENDING');
      sendAttempted = true;
      const sendRes = await window.WPP.chat.sendFileMessage(chatId, dataUrl, {
        type: 'audio',
        isPtt: true
      });

      emitProgress(id, 'DONE');
      const elapsed = Date.now() - startTime;
      const messageId = sendRes?.id?._serialized || sendRes?.id || (typeof sendRes === 'string' ? sendRes : null);
      return { ok: true, messageId, ms: elapsed };
    } catch (err) {
      err.mayHaveSent = sendAttempted;
      if (!err.code) err.code = 'SEND_FAILED';
      throw err;
    }
  }

  // Listener principal da ponte (Protocolo Enxame v1)
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__enxame !== 1 || msg.v !== 1 || msg.dir !== 'req') return;

    const { id, kind, payload } = msg;

    // Ignora em silêncio mensagens destinadas ao interceptador de arquivos ou ao microfone virtual
    if (kind === 'fi_arm' || kind === 'fi_disarm' || kind === 'vmic_arm' || kind === 'vmic_disarm' || kind === 'vmic_status') {
      return;
    }

    const dedupeKey = payload?.taskId || id;
    if (isDuplicate(dedupeKey)) {
      logWarn(`[Enxame][MAIN] Requisição duplicada ignorada: ${dedupeKey}`);
      return;
    }

    try {
      if (kind === 'ping' || kind === 'capabilities') {
        const caps = await getWppCapabilities();
        emitResponse(id, true, {
          stage: 'CAPABILITIES',
          data: { capabilities: caps, wajsVersion: caps.wajsVersion }
        });
        return;
      }

      if (kind === 'debug_dump') {
        const caps = await getWppCapabilities();
        emitResponse(id, true, {
          stage: 'DUMP',
          data: {
            capabilities: caps,
            wajsVersion: caps.wajsVersion,
            ringBuffer: ringBuffer.slice()
          }
        });
        return;
      }

      if (kind === 'send_media') {
        const err = new Error('WA-JS foi removido em favor do microfone virtual (WAJS_REMOVED)');
        err.code = 'WAJS_REMOVED';
        emitResponse(id, false, {
          stage: 'FAILED',
          strategy: 'VMIC_MIGRATED',
          error: err
        });
        return;
      }

      const err = new Error(`Tipo de requisição desconhecido: ${kind}`);
      err.code = 'UNKNOWN_KIND';
      emitResponse(id, false, { error: err, stage: 'FAILED' });
    } catch (err) {
      emitResponse(id, false, {
        stage: 'FAILED',
        strategy: 'WAJS',
        mayHaveSent: !!err.mayHaveSent,
        error: {
          code: err.code || 'SEND_FAILED',
          message: err.message || 'Falha no processamento da mensagem',
          diag: err.diag || null
        }
      });
    }
  });

  logDebug('Adaptador wpp-main.js v2.10.1 pronto.');
})();
