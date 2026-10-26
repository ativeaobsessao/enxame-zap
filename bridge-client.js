/**
 * Enxame Zap v2.8.0 - Bridge Client (ISOLATED World)
 * Ponte robusta com timeout por inatividade, id idempotente e propagação de progresso.
 */
(function() {
  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][Bridge]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][Bridge]', ...args);

  const pendingRequests = new Map();

  // Escuta respostas e notificações de progresso vindas do mundo MAIN
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__enxame !== 1 || msg.v !== 1) return;

    const req = pendingRequests.get(msg.id);
    if (!req) return;

    if (msg.dir === 'progress') {
      req.lastStage = msg.stage || req.lastStage;
      req.resetInactivityTimer();
      logDebug(`[${msg.id}] Progresso:`, msg.stage);
      if (typeof req.onProgress === 'function') {
        try { req.onProgress(msg.stage); } catch (e) { logWarn('Erro no callback onProgress:', e); }
      }
      return;
    }

    if (msg.dir === 'res') {
      pendingRequests.delete(msg.id);
      req.clearTimers();
      const elapsed = Date.now() - req.startTime;

      if (msg.ok) {
        logDebug(`[${msg.id}] Sucesso (${elapsed}ms):`, msg.strategy, msg.stage);
        req.resolve({
          ok: true,
          strategy: msg.strategy || null,
          stage: msg.stage || req.lastStage || 'DONE',
          ms: elapsed,
          data: msg.data || null
        });
      } else {
        const errInfo = msg.error || {};
        const err = new Error(errInfo.message || 'Falha na comunicação com o mundo MAIN');
        err.code = errInfo.code || 'UNKNOWN_ERROR';
        err.stage = msg.stage || req.lastStage || 'FAILED';
        err.strategy = msg.strategy || null;
        logWarn(`[${msg.id}] Erro:`, err.code, err.message, 'no estágio:', err.stage);
        req.reject(err);
      }
    }
  });

  const EnxameBridge = {
    request(kind, payload = {}, options = {}) {
      return new Promise((resolve, reject) => {
        const id = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 25000;
        const startTime = Date.now();
        let timer = null;
        let lastStage = 'INIT';

        const clearTimers = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        };

        const resetInactivityTimer = () => {
          clearTimers();
          timer = setTimeout(() => {
            pendingRequests.delete(id);
            const err = new Error(`Operação [${kind}] inativa há mais de ${timeoutMs}ms (estágio: ${lastStage})`);
            err.code = 'TIMEOUT';
            err.stage = lastStage;
            logWarn(`[${id}] Timeout por inatividade:`, err.message);
            reject(err);
          }, timeoutMs);
        };

        const reqRecord = {
          resolve,
          reject,
          onProgress: options.onProgress,
          clearTimers,
          resetInactivityTimer,
          startTime,
          lastStage
        };

        pendingRequests.set(id, reqRecord);
        resetInactivityTimer();

        logDebug(`[${id}] Enviando requisição [${kind}]`);
        window.postMessage({
          __enxame: 1,
          v: 1,
          dir: 'req',
          id,
          kind,
          payload
        }, '*');
      });
    }
  };

  // Tarefa 5: Diagnóstico com mascaramento de dados sensíveis
  function maskJid(jid) {
    if (typeof jid !== 'string') return jid;
    return jid.replace(/(\d{4})\d{4,}(\d{2}@(c|g)\.us)/g, '$1****$2');
  }

  function sanitizeDump(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeDump);
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/^(text|caption|message|conteudo|buffer|arrayBuffer)$/i.test(k)) {
        continue;
      }
      if (typeof v === 'string') {
        clean[k] = maskJid(v);
      } else if (typeof v === 'object' && v !== null) {
        clean[k] = sanitizeDump(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  const EnxameDiag = {
    async dump() {
      try {
        const res = await EnxameBridge.request('debug_dump', {}, { timeoutMs: 8000 });
        const sanitized = sanitizeDump(res.data || res);
        const jsonStr = JSON.stringify(sanitized, null, 2);
        console.log('[Enxame][Diag] Diagnóstico coletado:', sanitized);

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(jsonStr);
            console.log('[Enxame][Diag] Copiado para a área de transferência.');
          } catch (clipErr) {
            logWarn('Falha ao escrever no clipboard:', clipErr);
          }
        }
        return sanitized;
      } catch (err) {
        console.error('[Enxame][Diag] Falha ao coletar diagnóstico:', err);
        throw err;
      }
    }
  };

  window.EnxameBridge = EnxameBridge;
  window.EnxameDiag = EnxameDiag;
  logDebug('Bridge Client v2.8 inicializado.');
})();
