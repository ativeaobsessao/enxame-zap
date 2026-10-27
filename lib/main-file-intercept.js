/**
 * Enxame Zap v2.8.1 - main-file-intercept.js (MAIN World)
 * Executa em document_start no mundo MAIN.
 * Intercepta HTMLInputElement.prototype.click para injeção programática
 * de arquivos (DataTransfer) sem abrir a janela nativa de seleção do sistema operacional.
 */
(function() {
  if (window.__ENXAME_FI_LOADED__) {
    console.warn('[Enxame][FileIntercept] Já carregado no mundo MAIN. Injeção duplicada bloqueada.');
    return;
  }
  window.__ENXAME_FI_LOADED__ = true;

  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][FileIntercept]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][FileIntercept]', ...args);
  const logError = (...args) => console.error('[Enxame][FileIntercept]', ...args);

  // Guarda o método nativo original
  const originalInputClick = HTMLInputElement.prototype.click;

  let armedState = null;

  function emitProgress(id, stage) {
    window.postMessage({
      __enxame: 1,
      v: 1,
      dir: 'progress',
      id,
      stage
    }, '*');
  }

  function emitResponse(id, ok, opts = {}) {
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

  function disarm(reason) {
    if (!armedState) return;
    if (armedState.timer) {
      clearTimeout(armedState.timer);
    }
    const id = armedState.id;
    armedState = null;
    logDebug(`Desarmado: ${reason} (id=${id})`);
  }

  // Interceptação de click no prototype
  HTMLInputElement.prototype.click = function() {
    if (this.type === 'file' && armedState) {
      logDebug('HTMLInputElement[type=file].click interceptado pelo Enxame!');
      const state = armedState;
      // Single-use: consome e desarma imediatamente
      disarm('single-use-consumed');

      const accept = (this.accept || '').toLowerCase();
      const expect = state.expect; // 'document' | 'media'
      let matches = false;

      if (expect === 'document') {
        // WhatsApp usa accept="*" multiple para Documentos
        matches = accept.trim() === '*';
      } else if (expect === 'media') {
        // WhatsApp usa accept="image/*,video/mp4,video/3gpp,video/quicktime,video/webm,video/x-matroska"
        matches = accept.includes('image/');
      }

      if (!matches) {
        logWarn(`ARM_MISMATCH: esperado=${expect}, accept recebido=${accept}`);
        emitResponse(state.id, false, {
          stage: 'ARM_MISMATCH',
          error: {
            code: 'ARM_MISMATCH',
            message: `Tipo de anexo incompatível: esperado ${expect}, mas input tem accept="${accept}"`
          }
        });
        // Não chama original para não abrir janela indesejada
        return;
      }

      try {
        const fileObj = new File([state.file], state.name, {
          type: state.type,
          lastModified: Date.now()
        });

        const dt = new DataTransfer();
        dt.items.add(fileObj);
        this.files = dt.files;

        logDebug(`Arquivo ${state.name} (${fileObj.size} bytes) atribuído. Disparando eventos...`);
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));

        emitProgress(state.id, 'intercepted');
        emitResponse(state.id, true, {
          stage: 'INTERCEPTED',
          strategy: expect === 'document' ? 'MENU_INTERCEPT_DOCUMENT' : 'MENU_INTERCEPT_MEDIA',
          data: {
            name: state.name,
            size: fileObj.size,
            type: state.type
          }
        });
      } catch (err) {
        logError('Falha ao instanciar File ou DataTransfer:', err);
        emitResponse(state.id, false, {
          stage: 'INJECTION_FAILED',
          error: {
            code: 'INJECTION_FAILED',
            message: 'Falha ao injetar arquivo no input: ' + err.message
          }
        });
      }
      return; // NÃO chama o originalInputClick
    }

    // Comportamento normal se não estiver armado ou não for file
    return originalInputClick.apply(this, arguments);
  };

  // Listener da ponte
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__enxame !== 1 || msg.v !== 1 || msg.dir !== 'req') return;

    const { id, kind, payload } = msg;

    if (kind === 'fi_arm') {
      logDebug(`Recebido fi_arm id=${id}:`, payload?.name, payload?.expect);

      if (armedState) {
        disarm('substituido_por_novo_arm');
      }

      const ttlMs = typeof payload?.ttlMs === 'number' && payload.ttlMs > 0 ? payload.ttlMs : 8000;
      const fileBlob = payload?.file || payload?.blob;

      if (!fileBlob) {
        emitResponse(id, false, {
          stage: 'ARM_FAILED',
          error: { code: 'INVALID_PAYLOAD', message: 'Payload do fi_arm sem Blob de arquivo' }
        });
        return;
      }

      armedState = {
        id,
        file: fileBlob,
        name: payload.name || `arquivo_${Date.now()}`,
        type: payload.type || fileBlob.type || 'application/octet-stream',
        expect: payload.expect === 'document' ? 'document' : 'media',
        timer: setTimeout(() => {
          if (armedState && armedState.id === id) {
            logWarn(`ARM_EXPIRED após ${ttlMs}ms id=${id}`);
            disarm('timeout_ttl');
            emitResponse(id, false, {
              stage: 'ARM_EXPIRED',
              error: { code: 'ARM_EXPIRED', message: `O interceptador expirou sem detecção de clique em input file (${ttlMs}ms)` }
            });
          }
        }, ttlMs)
      };

      emitResponse(id, true, {
        stage: 'ARMED',
        data: { armed: true, ttlMs, expect: armedState.expect }
      });
      return;
    }

    if (kind === 'fi_disarm') {
      logDebug(`Recebido fi_disarm id=${id}`);
      disarm('solicitado_pela_bridge');
      emitResponse(id, true, {
        stage: 'DISARMED',
        data: { disarmed: true }
      });
      return;
    }
  });

  logDebug('main-file-intercept.js inicializado.');
})();
