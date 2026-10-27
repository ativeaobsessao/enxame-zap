/**
 * Enxame Zap v2.8.0 - wpp-main.js (MAIN World)
 * Executa no contexto da página (window.Store / window.WPP).
 * Estabilização: guarda de idempotência, dedupe por TTL, busca estrita em req.c,
 * getChatId sem innerHTML global e emissão de progresso por etapa.
 */
(function() {
  if (window.__ENXAME_MAIN_LOADED__) {
    console.warn('[Enxame v2.8] wpp-main.js já carregado no mundo MAIN. Injeção duplicada bloqueada.');
    return;
  }
  window.__ENXAME_MAIN_LOADED__ = true;

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][MAIN]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][MAIN]', ...args);
  const logError = (...args) => console.error('[Enxame][MAIN]', ...args);

  logDebug('wpp-main.js inicializado no mundo MAIN.');

  // Anel das últimas 20 operações para auditoria e diagnóstico
  const ringBuffer = [];
  function pushRing(entry) {
    ringBuffer.push({ ts: Date.now(), ...entry });
    if (ringBuffer.length > 20) ringBuffer.shift();
  }

  // Deduplicação com TTL de 60 segundos por id de tarefa
  const seenRequests = new Map();
  function isDuplicate(id) {
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
      strategy: opts.strategy || null,
      code: opts.error?.code || null
    });
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'res',
      id,
      ok: !!ok,
      strategy: opts.strategy || null,
      stage: opts.stage || null,
      error: opts.error ? {
        code: opts.error.code || 'UNKNOWN_ERROR',
        message: opts.error.message || String(opts.error)
      } : null,
      data: opts.data || null
    }, '*');
  }

  // Captura webpackRequire sem executar módulos não carregados
  let webpackRequire = null;
  function getWebpackRequire() {
    if (webpackRequire) return webpackRequire;
    try {
      if (window.webpackChunkwhatsapp_web_client && Array.isArray(window.webpackChunkwhatsapp_web_client)) {
        let captured = null;
        window.webpackChunkwhatsapp_web_client.push([
          [Math.random().toString(36)],
          {},
          function(e) { captured = e; }
        ]);
        if (captured && (captured.m || captured.c)) {
          webpackRequire = captured;
          logDebug('webpackRequire obtido via push runtime.');
          return webpackRequire;
        }
      }
    } catch (e) {
      logWarn('Falha ao obter webpackRequire:', e.message);
    }
    return null;
  }

  // Busca segura EXCLUSIVAMENTE em req.c (módulos já instanciados; nunca executa req(id))
  function findInCache(predicate) {
    try {
      const req = getWebpackRequire();
      if (!req || !req.c) return null;
      for (const id in req.c) {
        try {
          const mod = req.c[id];
          if (!mod || !mod.exports) continue;
          const exp = mod.exports;
          if (predicate(exp)) return exp;
          if (exp.default && predicate(exp.default)) return exp.default;
          for (const k in exp) {
            try {
              if (exp[k] && predicate(exp[k])) return exp[k];
            } catch {}
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  let Store = null;
  function extractStore() {
    if (Store && Store.Chat) return Store;
    if (window.Store && window.Store.Chat) {
      Store = window.Store;
      return Store;
    }
    try {
      let chatCol = findInCache(m => m && typeof m.getModelsArray === 'function' && Array.isArray(m.models));
      if (!chatCol) {
        chatCol = findInCache(m => m && Array.isArray(m.models) && typeof m.get === 'function' && m.models.length > 0 && m.models[0]?.id?._serialized);
      }
      if (!chatCol) {
        const holder = findInCache(m => m && m.Chat && (typeof m.Chat.getModelsArray === 'function' || Array.isArray(m.Chat.models)));
        if (holder) chatCol = holder.Chat;
      }

      if (chatCol) {
        Store = { Chat: chatCol };
        window.Store = window.Store || {};
        window.Store.Chat = chatCol;
        logDebug('Store.Chat extraído com sucesso.');
        return Store;
      }
    } catch (e) {
      logWarn('extractStore erro:', e.message);
    }
    return null;
  }

  function normalizeChatId(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let id = raw.trim().replace(/:\d+@/, '@');
    if (id.includes('_')) {
      const parts = id.split('_');
      for (const p of parts) {
        if (p.includes('@c.us') || p.includes('@g.us')) {
          id = p;
          break;
        }
      }
    }
    const match = id.match(/(\d+@c\.us|\d+-\d+@g\.us|120\d+@g\.us)/);
    return match ? match[1] : (id.includes('@c.us') || id.includes('@g.us') ? id : null);
  }

  // getChatId estrito: APENAS fontes fortes do chat ativo. Sem regex global em innerHTML.
  function getChatId() {
    try {
      const a = window.WPP?.chat?.getActiveChat?.();
      if (a?.id?._serialized) return normalizeChatId(a.id._serialized);
    } catch {}

    try {
      const id1 = window.WPP?.chat?.getActiveChatId?.();
      const raw = id1?._serialized || (typeof id1 === 'string' ? id1 : null);
      if (raw) return normalizeChatId(raw);
    } catch {}

    try {
      const id2 = window.WPP?.whatsapp?.ChatStore?.getActive?.()?.id?._serialized;
      if (id2) return normalizeChatId(id2);
    } catch {}

    const s = Store || window.Store;
    if (s && s.Chat) {
      try {
        if (typeof s.Chat.getActive === 'function') {
          const act = s.Chat.getActive();
          if (act?.id?._serialized) return normalizeChatId(act.id._serialized);
        }
        const models = typeof s.Chat.getModelsArray === 'function' ? s.Chat.getModelsArray() : s.Chat.models;
        if (Array.isArray(models)) {
          const active = models.find(c => c.active || c.isActive || c.__x_active);
          if (active?.id?._serialized) return normalizeChatId(active.id._serialized);
        }
      } catch {}
    }

    // Fallback restrito: SOMENTE no header ou compose do chat aberto atual
    try {
      const activeHeader = document.querySelector('header[data-id], [data-testid="conversation-header"] [data-id]');
      if (activeHeader) {
        const norm = normalizeChatId(activeHeader.getAttribute('data-id'));
        if (norm) return norm;
      }
      const activeMain = document.querySelector('#main [data-id]');
      if (activeMain) {
        const norm = normalizeChatId(activeMain.getAttribute('data-id'));
        if (norm) return norm;
      }
    } catch {}

    return null;
  }

  function getCapabilities() {
    extractStore();
    const hasWpp = !!(window.WPP?.chat?.sendFileMessage || window.WPP?.chat?.sendAudioMessage);
    const hasStoreChat = !!(Store?.Chat && (typeof Store.Chat.getModelsArray === 'function' || Array.isArray(Store.Chat.models)));
    const activeChatId = getChatId();
    const req = getWebpackRequire();
    return {
      hasWpp,
      hasStoreChat,
      hasActiveChat: !!activeChatId,
      activeChatId: activeChatId || null,
      webpackModulesCached: req && req.c ? Object.keys(req.c).length : 0,
      strategies: [
        ...(hasWpp ? ['WPP'] : []),
        ...(hasStoreChat ? ['STORE'] : [])
      ]
    };
  }

  function detectBuildInfo() {
    try {
      const versionEl = document.querySelector('[data-testid="version"]') || document.querySelector('footer');
      return {
        href: location.href,
        userAgent: navigator.userAgent,
        whatsappVersion: window.Debug?.VERSION || window.WPP?.version || 'undetected'
      };
    } catch {
      return { whatsappVersion: 'undetected' };
    }
  }

  // Envio PTT com estratégias auditadas (WPP nativo ou Store.Chat)
  async function sendPttViaWPP(chatId, file, opts) {
    if (window.WPP?.chat?.sendFileMessage) {
      logDebug('Tentando envio via WPP.chat.sendFileMessage para', chatId);
      return await window.WPP.chat.sendFileMessage(chatId, file, {
        type: 'audio',
        isPtt: true,
        mimetype: 'audio/ogg; codecs=opus',
        waveform: Array.isArray(opts.waveform) ? opts.waveform : true
      });
    }
    if (window.WPP?.chat?.sendAudioMessage) {
      logDebug('Tentando envio via WPP.chat.sendAudioMessage para', chatId);
      return await window.WPP.chat.sendAudioMessage(chatId, file, {
        isPtt: true,
        mimetype: 'audio/ogg; codecs=opus',
        waveform: Array.isArray(opts.waveform) ? opts.waveform : true
      });
    }
    const err = new Error('WPP não disponível no contexto atual');
    err.code = 'WPP_UNAVAILABLE';
    throw err;
  }

  async function sendPttViaStore(chatId, file, opts) {
    extractStore();
    const s = Store || window.Store;
    if (!s || !s.Chat) {
      const err = new Error('Store.Chat indisponível (módulo de chat não carregado)');
      err.code = 'STORE_CHAT_NOT_FOUND';
      throw err;
    }
    let chat = null;
    try {
      if (typeof s.Chat.get === 'function') chat = s.Chat.get(chatId);
      if (!chat && typeof s.Chat.getModelsArray === 'function') {
        chat = s.Chat.getModelsArray().find(c => c.id?._serialized === chatId);
      }
      if (!chat && Array.isArray(s.Chat.models)) {
        chat = s.Chat.models.find(c => c.id?._serialized === chatId);
      }
    } catch (e) {
      logWarn('Erro ao buscar chat na coleção Store.Chat:', e.message);
    }
    if (!chat) {
      const err = new Error(`Chat ${chatId} não localizado na coleção ativa Store.Chat`);
      err.code = 'CHAT_NOT_IN_STORE';
      throw err;
    }
    if (typeof chat.sendFileMessage === 'function') {
      logDebug('Executando chat.sendFileMessage no model do chat');
      return await chat.sendFileMessage(file, {
        type: 'audio',
        isPtt: true,
        waveform: Array.isArray(opts.waveform) ? opts.waveform : true,
        duration: opts.duration
      });
    }
    const err = new Error('Model do chat não expõe sendFileMessage nativo');
    err.code = 'CHAT_METHOD_NOT_FOUND';
    throw err;
  }

  async function handleSendMedia(id, payload) {
    emitProgress(id, 'RESOLVING_CHAT');
    const chatId = getChatId();
    if (!chatId) {
      const err = new Error('Nenhum chat ativo confirmado. Abra a conversa com o destinatário antes de enviar.');
      err.code = 'CHAT_UNRESOLVED';
      throw err;
    }

    emitProgress(id, 'PREPARING_MEDIA');
    const buffer = payload.buffer;
    if (!buffer || !(buffer instanceof ArrayBuffer)) {
      const err = new Error('Payload inválido: ArrayBuffer ausente.');
      err.code = 'INVALID_MEDIA_BUFFER';
      throw err;
    }
    const mime = payload.mime || 'audio/ogg; codecs=opus';
    const isWebM = !!payload.isWebM;
    const blob = new Blob([buffer], { type: mime });
    const fileName = isWebM ? `ptt-${Date.now()}.webm` : `ptt-${Date.now()}.ogg`;
    const file = new File([blob], fileName, { type: mime });

    emitProgress(id, 'SENDING');

    // Estratégia 1: WPP nativo (se biblioteca WPP injetada)
    if (window.WPP?.chat?.sendFileMessage || window.WPP?.chat?.sendAudioMessage) {
      try {
        const res = await sendPttViaWPP(chatId, file, payload);
        emitProgress(id, 'DONE');
        return { strategy: 'WPP', result: res };
      } catch (wppErr) {
        logWarn('Envio via WPP falhou; tentando fallback Store:', wppErr.message);
      }
    }

    // Estratégia 2: Store.Chat direto do WhatsApp Web client
    try {
      const res = await sendPttViaStore(chatId, file, payload);
      emitProgress(id, 'DONE');
      return { strategy: 'STORE', result: res };
    } catch (storeErr) {
      logError('Envio via Store falhou:', storeErr.message);
      throw storeErr;
    }
  }

  // Listener principal da ponte (Protocolo v1)
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__enxame !== 1 || msg.v !== 1 || msg.dir !== 'req') return;

    const { id, kind, payload } = msg;
    logDebug(`Recebida requisição [${kind}] id=${id}`);

    if (isDuplicate(id)) {
      logWarn(`Ignorando requisição duplicada id=${id}`);
      return;
    }

    try {
      if (kind === 'ping') {
        emitResponse(id, true, {
          stage: 'PONG',
          data: { pong: true, time: Date.now(), capabilities: getCapabilities() }
        });
        return;
      }

      if (kind === 'capabilities') {
        emitResponse(id, true, {
          stage: 'CAPABILITIES',
          data: getCapabilities()
        });
        return;
      }

      if (kind === 'debug_dump') {
        emitResponse(id, true, {
          stage: 'DUMP',
          data: {
            capabilities: getCapabilities(),
            build: detectBuildInfo(),
            ringBuffer: ringBuffer.slice()
          }
        });
        return;
      }

      if (kind === 'send_media') {
        const { strategy, result } = await handleSendMedia(id, payload || {});
        emitResponse(id, true, {
          strategy,
          stage: 'DONE',
          data: { resultId: result?.id || result?.ack || 'ok' }
        });
        return;
      }

      if (kind === 'fi_arm' || kind === 'fi_disarm') {
        return; // Processado por lib/main-file-intercept.js
      }

      const err = new Error(`Tipo de requisição desconhecido: ${kind}`);
      err.code = 'UNKNOWN_KIND';
      emitResponse(id, false, { error: err, stage: 'FAILED' });
    } catch (err) {
      logError(`Falha ao processar requisição [${kind}]:`, err);
      emitResponse(id, false, {
        error: {
          code: err.code || 'OPERATION_FAILED',
          message: err.message || String(err)
        },
        stage: err.stage || 'FAILED',
        strategy: err.strategy || null
      });
    }
  });

  // Único laço controlado de extração do Store
  let extractionTries = 0;
  const storePoll = setInterval(() => {
    extractionTries++;
    const s = extractStore();
    if (s && s.Chat) {
      logDebug(`Store.Chat detectado após ${extractionTries} verificações.`);
      clearInterval(storePoll);
    }
    if (extractionTries >= 30) {
      clearInterval(storePoll);
    }
  }, 1000);

  logDebug('wpp-main.js v2.8 pronto e aguardando requisições.');
})();
