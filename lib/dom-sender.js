/**
 * Enxame Zap v2.8.2 - dom-sender.js (ISOLATED World)
 * Envio otimizado de imagem, vídeo e documento pelo DOM do WhatsApp Web.
 * - Prontidão adaptativa (MutationObserver + rAF) em vez de esperas fixas
 * - fi_arm disparado antes de clicar em Anexar
 * - Ocultação antecipada do menu de anexo e do preview (zero flash visual)
 * - Envio exclusivo com clique T1 (sem repetições acidentais)
 * - Resolução antecipada (resolve assim que a mídia aparece em chat)
 * - Confirmação desacoplada em background (Promise confirmed) com timing completo
 */
(function() {
  const isDebug = () => {
    try { return !!localStorage.getItem('enxameDebug'); } catch { return false; }
  };
  const logDebug = (...args) => { if (isDebug()) console.log('[Enxame][DomSender]', ...args); };
  const logWarn = (...args) => console.warn('[Enxame][DomSender]', ...args);
  const logError = (...args) => console.error('[Enxame][DomSender]', ...args);

  const LABELS = {
    ATTACH_BUTTON: 'Anexar',
    MENU_DOC: 'Documento',
    MENU_MEDIA: 'Fotos e vídeos',
    SEND_PREFIX: 'Enviar',
    CLOSE: 'Fechar',
    STATUS_PENDING: 'Pendente',
    STATUS_SENT: 'Enviada',
    STATUS_DELIVERED: 'Entregue',
    STATUS_READ: 'Lida',
    YOU_PREFIX: 'Você:'
  };

  const CONFIG = {
    MAX_IMAGE_SIZE: 16 * 1024 * 1024,
    MAX_VIDEO_SIZE: 64 * 1024 * 1024,
    MAX_DOC_SIZE: 100 * 1024 * 1024,
    MENU_WAIT_MS: 2500,
    PREVIEW_WAIT_MS: 5000,
    SEND_MIN_STABILIZE_MS: 400,
    READY_MAX_MS: 1500,
    CLOSE_STABILIZE_MS: 700,
    CONFIRM_POLL_MS: 150,
    STATUS_WAIT_AFTER_CLOSE_MS: 8000,
    SEND_FALLBACK_LAYERS: false
  };

  // Mutex para garantir que não haja dois envios simultâneos
  let sendQueue = Promise.resolve();

  // Memória adaptativa da camada que funcionou no botão Fechar
  let lastWorkingCloseLayer = null;

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function isPreviewOpen() {
    return !!document.querySelector('[data-testid="media-caption-input-container"]');
  }

  // Helper findOverlayRoot(el): sobe por parentElement e devolve o maior ancestral que NÃO contém #main nem #side
  function findOverlayRoot(el) {
    if (!el || !(el instanceof Element)) return null;
    let curr = el;
    while (curr.parentElement && curr.parentElement !== document.body && curr.parentElement !== document.documentElement) {
      const parent = curr.parentElement;
      if (parent.querySelector('#main') || parent.querySelector('#side')) {
        break;
      }
      curr = parent;
    }
    if (curr.querySelector('#main') || curr.querySelector('#side') || curr === document.body) {
      return null;
    }
    return curr;
  }

  function ensureHideStyle() {
    if (document.getElementById('enxame-hide-style')) return;
    const style = document.createElement('style');
    style.id = 'enxame-hide-style';
    style.textContent = `
      [data-enxame-hide="opacity"], [data-enxame-hide="1"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: none !important;
        animation: none !important;
      }
      [data-enxame-hide="offscreen"] {
        position: fixed !important;
        left: -200vw !important;
        top: 0 !important;
        pointer-events: none !important;
        transition: none !important;
        animation: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function getHideMode() {
    if (localStorage.getItem('enxameShowPreview') === '1') return 'off';
    const custom = localStorage.getItem('enxameHideMode');
    if (custom === 'offscreen' || custom === 'off' || custom === 'opacity') return custom;
    return 'opacity';
  }

  const hiddenRoots = new Set();
  let hideSafetyTimer = null;

  function hideOverlayElement(el) {
    const mode = getHideMode();
    if (mode === 'off') return;
    const root = findOverlayRoot(el);
    if (!root) return;

    ensureHideStyle();
    root.setAttribute('data-enxame-hide', mode === 'offscreen' ? 'offscreen' : '1');
    hiddenRoots.add(root);

    if (!hideSafetyTimer) {
      hideSafetyTimer = setTimeout(() => {
        clearAllHiding();
      }, 20000);
    }
  }

  function clearAllHiding() {
    if (hideSafetyTimer) {
      clearTimeout(hideSafetyTimer);
      hideSafetyTimer = null;
    }
    hiddenRoots.forEach(el => {
      try { el.removeAttribute('data-enxame-hide'); } catch {}
    });
    hiddenRoots.clear();
    document.querySelectorAll('[data-enxame-hide]').forEach(el => {
      try { el.removeAttribute('data-enxame-hide'); } catch {}
    });
  }

  // Localiza botões do preview subindo a partir do container da legenda (até 14 níveis)
  function findPreviewButton(matcher) {
    const captionContainer = document.querySelector('[data-testid="media-caption-input-container"]');
    if (!captionContainer) return null;

    let curr = captionContainer;
    for (let i = 0; i < 14 && curr && curr !== document.body; i++) {
      const parent = curr.parentElement;
      if (!parent) break;
      const candidates = parent.querySelectorAll('button, [role="button"]');
      for (const el of candidates) {
        if (matcher(el)) return el;
      }
      curr = parent;
    }
    return null;
  }

  function getSendButton() {
    return findPreviewButton(el => {
      const label = el.getAttribute('aria-label') || '';
      return el.getAttribute('role') === 'button' && label.startsWith(LABELS.SEND_PREFIX);
    });
  }

  function getCloseButton() {
    return findPreviewButton(el => {
      const label = el.getAttribute('aria-label') || '';
      return label === LABELS.CLOSE;
    });
  }

  function dispatchMouseSequence(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function dispatchEscape() {
    const escOpts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', escOpts));
      document.activeElement.dispatchEvent(new KeyboardEvent('keyup', escOpts));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', escOpts));
    document.dispatchEvent(new KeyboardEvent('keyup', escOpts));
    window.dispatchEvent(new KeyboardEvent('keydown', escOpts));
  }

  function executeLayer(el, layer) {
    if (layer === 'T1') {
      el.click();
    } else if (layer === 'T2') {
      dispatchMouseSequence(el);
    } else if (layer === 'T3') {
      const target = el.firstElementChild || el;
      dispatchMouseSequence(target);
    } else if (layer === 'T4') {
      dispatchEscape();
    }
  }

  // Ativação do botão Fechar (com espera de 700ms inalterada)
  async function activateClose() {
    await wait(CONFIG.CLOSE_STABILIZE_MS);
    if (!isPreviewOpen()) return { ok: true, layer: 'already_closed' };

    const defaultOrder = ['T3', 'T2', 'T1', 'T4'];
    let order = defaultOrder.slice();
    if (lastWorkingCloseLayer && order.includes(lastWorkingCloseLayer)) {
      order = [lastWorkingCloseLayer, ...order.filter(l => l !== lastWorkingCloseLayer)];
    }

    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const layer of order) {
        if (!isPreviewOpen()) {
          logDebug(`Preview fechado com sucesso na camada ${lastWorkingCloseLayer || layer}`);
          return { ok: true, layer: lastWorkingCloseLayer || layer };
        }
        const btn = getCloseButton();
        if (layer !== 'T4' && !btn) {
          logWarn('Botão Fechar não encontrado no DOM durante camada', layer);
        } else {
          logDebug(`Executando camada ${layer} no botão Fechar (ciclo ${cycle})`);
          executeLayer(btn || document.body, layer);
        }
        await wait(1200);
        if (!isPreviewOpen()) {
          lastWorkingCloseLayer = layer;
          logDebug(`Camada ${layer} fechou o preview com sucesso`);
          return { ok: true, layer };
        }
      }
    }

    if (isPreviewOpen()) {
      const err = new Error('Não foi possível fechar o preview após 2 ciclos completos');
      err.code = 'PREVIEW_STUCK';
      throw err;
    }
    return { ok: true, layer: 'unknown' };
  }

  // Espera por elemento no DOM via MutationObserver sem polling fixo
  function waitForElement(selector, root = document, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      const existing = root.querySelector(selector);
      if (existing) return resolve(existing);

      let observer = null;
      let timer = null;

      const cleanup = () => {
        if (observer) { observer.disconnect(); observer = null; }
        if (timer) { clearTimeout(timer); timer = null; }
      };

      observer = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          cleanup();
          resolve(el);
        }
      });

      observer.observe(root, { childList: true, subtree: true });

      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout (${timeoutMs}ms) aguardando seletor: ${selector}`));
      }, timeoutMs);
    });
  }

  function snapshotMessages() {
    const rows = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
    const testIds = new Set(rows.map(r => r.getAttribute('data-testid')).filter(Boolean));
    const lastRow = rows[rows.length - 1];
    const lastId = lastRow ? lastRow.getAttribute('data-testid') : null;
    return { testIds, lastId, count: rows.length };
  }

  function getChatTitle() {
    const el = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
    return el?.textContent?.trim() || '';
  }

  function buildDiag(snapshot, startTime, previewClosedAt) {
    const finalRows = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
    const finalNewRows = finalRows.filter(r => !snapshot.testIds.has(r.getAttribute('data-testid')));
    const diagLabels = finalNewRows.map(r => {
      const labels = Array.from(r.querySelectorAll('[aria-label]'))
        .map(el => el.getAttribute('aria-label'))
        .filter(l => l && !l.endsWith(':'));
      return labels;
    });

    return {
      rowsBefore: snapshot.count,
      rowsAfter: finalRows.length,
      newTestIdsTruncated: finalNewRows.map(r => (r.getAttribute('data-testid') || '').slice(0, 16)),
      ariaLabels: diagLabels,
      previewClosed: !isPreviewOpen(),
      previewClosedMs: previewClosedAt ? (previewClosedAt - startTime) : null
    };
  }

  function inferExtensionAndMime(blob, kind, asDocument) {
    const rawType = (blob?.type || '').trim().toLowerCase();
    const mime = rawType.split(';')[0].trim();

    if (!asDocument) {
      if (kind === 'image') {
        const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedImages.includes(mime)) {
          const err = new Error(`Formato de imagem inválido: "${rawType || 'vazio'}". Permitidos: image/jpeg, image/png, image/webp.`);
          err.code = 'INVALID_MIME';
          throw err;
        }
      } else if (kind === 'video') {
        if (mime !== 'video/mp4') {
          const err = new Error(`Formato de vídeo inválido: "${rawType || 'vazio'}". Permitido SOMENTE video/mp4.`);
          err.code = 'INVALID_MIME';
          throw err;
        }
      }
    }

    let ext = 'bin';
    if (mime === 'image/jpeg') ext = 'jpg';
    else if (mime === 'image/png') ext = 'png';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'image/gif') ext = 'gif';
    else if (mime === 'video/mp4') ext = 'mp4';
    else if (mime === 'video/webm') ext = 'webm';
    else if (mime === 'video/quicktime') ext = 'mov';
    else if (mime === 'audio/ogg' || mime === 'audio/ogg; codecs=opus') ext = 'ogg';
    else if (mime === 'application/pdf') ext = 'pdf';
    else if (mime === 'text/plain') ext = 'txt';
    else if (mime === 'application/zip') ext = 'zip';
    else if (mime.includes('/')) {
      const sub = mime.split('/')[1].replace(/[^a-z0-9]/g, '');
      if (sub && sub.length <= 4) ext = sub;
    }

    const name = `enxame_${kind}_${Date.now()}.${ext}`;
    return { mime, ext, name };
  }

  // Verificação de prontidão da mídia
  function checkMediaRendered(kind, asDocument, root) {
    if (asDocument) {
      return !!(root.querySelector('[data-icon^="document-"]') || document.querySelector('[data-icon^="document-"]'));
    }
    if (kind === 'image') {
      const img = root.querySelector('img[src^="blob:"]') || document.querySelector('[data-testid="drawer-middle"] img[src^="blob:"]');
      return !!(img && img.naturalWidth > 0);
    }
    if (kind === 'video') {
      const vid = root.querySelector('video') || document.querySelector('[data-testid="drawer-middle"] video');
      return !!(vid && vid.readyState >= 1);
    }
    return true;
  }

  function isSendButtonReady() {
    const btn = getSendButton();
    if (!btn) return false;
    const disabled = btn.getAttribute('aria-disabled');
    return disabled !== 'true' && disabled !== 'disabled';
  }

  // Espera por prontidão baseada em condição (MutationObserver + rAF)
  function waitUntilReady(kind, asDocument, previewAppearedAt) {
    const minStabilizeUntil = previewAppearedAt + CONFIG.SEND_MIN_STABILIZE_MS;
    const maxTimeout = previewAppearedAt + CONFIG.READY_MAX_MS;

    return new Promise(resolve => {
      let done = false;
      let observer = null;
      let rafId = null;

      const cleanup = () => {
        done = true;
        if (observer) { observer.disconnect(); observer = null; }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      };

      const check = () => {
        if (done) return;
        const now = performance.now();
        const root = document.querySelector('[data-testid="drawer-middle"]') || document.body;
        const sendReady = isSendButtonReady();
        const mediaReady = checkMediaRendered(kind, asDocument, root);
        const pastMin = now >= minStabilizeUntil;
        const pastMax = now >= maxTimeout;

        if ((sendReady && mediaReady && pastMin) || pastMax) {
          cleanup();
          resolve({ timedOut: pastMax && !(sendReady && mediaReady) });
          return;
        }

        rafId = requestAnimationFrame(check);
      };

      observer = new MutationObserver(() => check());
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      check();
    });
  }

  // Monitoramento desacoplado em background para resolução de confirmed
  function createConfirmedPromise(messageTestId, previewClosedAtMs, t0, timing) {
    return new Promise(resolve => {
      let resolved = false;
      let observer = null;
      let timeoutTimer = null;

      const cleanup = () => {
        resolved = true;
        if (observer) { observer.disconnect(); observer = null; }
        if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
      };

      const checkRow = (row) => {
        if (resolved || !row) return;
        const isDone = !!row.querySelector(
          `[aria-label="${LABELS.STATUS_SENT}"], [aria-label="${LABELS.STATUS_DELIVERED}"], [aria-label="${LABELS.STATUS_READ}"]`
        );
        if (isDone) {
          timing.tEnviada = Math.round(performance.now() - t0);
          cleanup();
          if (isDebug()) console.table(timing);
          resolve({ stage: 'sent', verified: true });
        }
      };

      const row = document.querySelector(`#main [data-testid="${messageTestId}"]`);
      if (row) {
        checkRow(row);
        if (resolved) return;

        observer = new MutationObserver(() => {
          checkRow(row);
        });
        observer.observe(row, { childList: true, subtree: true, attributes: true });
      }

      // 8s após o preview fechar sem virar enviada => resolve queued com verified=false
      const timeRemaining = Math.max(500, CONFIG.STATUS_WAIT_AFTER_CLOSE_MS - (performance.now() - previewClosedAtMs));
      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          if (isDebug()) console.table(timing);
          resolve({ stage: 'queued', verified: false });
        }
      }, timeRemaining);
    });
  }

  // Execução do envio (dentro do mutex)
  async function internalSend({ kind, blob, asDocument = false, caption = '' }) {
    const t0 = performance.now();
    const timing = {
      tAnexar: 0,
      tMenu: 0,
      tArm: 0,
      tPreview: 0,
      tPronto: 0,
      tClique: 0,
      tPreviewFechou: 0,
      tLinhaNova: 0,
      tEnviada: 0
    };

    // 1. Pré-condições
    const mainEl = document.querySelector('#main');
    const composeBox = document.querySelector('#main footer [data-testid="conversation-compose-box-input"]');
    if (!mainEl || !composeBox) {
      const err = new Error('Nenhuma conversa aberta no WhatsApp Web. Abra um chat antes de enviar.');
      err.code = 'NO_CHAT_OPEN';
      throw err;
    }

    const initialChatTitle = getChatTitle();
    if (!initialChatTitle || initialChatTitle.trim().length === 0) {
      const err = new Error('Título da conversa não detectado no cabeçalho do chat.');
      err.code = 'NO_CHAT_TITLE';
      throw err;
    }

    if (!blob || !(blob instanceof Blob)) {
      const err = new Error('Arquivo de mídia ausente ou inválido.');
      err.code = 'INVALID_BLOB';
      throw err;
    }

    const { mime, name } = inferExtensionAndMime(blob, kind, asDocument);

    const maxAllowed = asDocument
      ? CONFIG.MAX_DOC_SIZE
      : (kind === 'video' ? CONFIG.MAX_VIDEO_SIZE : CONFIG.MAX_IMAGE_SIZE);
    if (blob.size > maxAllowed) {
      const err = new Error(`Arquivo excede o limite permitido (${(maxAllowed / 1024 / 1024).toFixed(0)}MB).`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }

    if (isPreviewOpen()) {
      logWarn('Preview já aberto antes do envio. Tentando fechar...');
      try {
        await activateClose();
      } catch (closeErr) {
        throw closeErr;
      }
    }

    const snapshot = snapshotMessages();
    logDebug(`Snapshot inicial: ${snapshot.count} mensagens em #main`);

    if (!window.EnxameBridge) {
      const err = new Error('Ponte EnxameBridge não carregada.');
      err.code = 'BRIDGE_NOT_FOUND';
      throw err;
    }

    let mayHaveSent = false;

    try {
      // 2. Chamar fi_arm na bridge ANTES de clicar em Anexar
      logDebug(`Armando fi_arm na bridge (expect=${asDocument ? 'document' : 'media'})...`);
      try {
        await window.EnxameBridge.request('fi_arm', {
          file: blob,
          name,
          type: mime,
          expect: asDocument ? 'document' : 'media',
          ttlMs: 8000
        }, { timeoutMs: 5000 });
        timing.tArm = Math.round(performance.now() - t0);
      } catch (armErr) {
        const err = new Error('Falha ao armar interceptador de arquivos: ' + armErr.message);
        err.code = 'INTERCEPT_ARM_FAILED';
        throw err;
      }

      // 3. Clicar no botão Anexar
      const attachBtn = document.querySelector('#main footer button[aria-label="Anexar"]');
      if (!attachBtn) {
        const err = new Error('Botão "Anexar" não encontrado no rodapé do chat.');
        err.code = 'ATTACH_BUTTON_NOT_FOUND';
        throw err;
      }
      attachBtn.click();
      timing.tAnexar = Math.round(performance.now() - t0);

      // 4. Esperar item do menu via MutationObserver
      const targetMenuLabel = asDocument ? LABELS.MENU_DOC : LABELS.MENU_MEDIA;
      let menuItem = null;
      try {
        menuItem = await waitForElement(`button[role="menuitem"][aria-label="${targetMenuLabel}"]`, document.body, CONFIG.MENU_WAIT_MS);
      } catch (menuWaitErr) {
        dispatchEscape();
        const err = new Error(`Opção "${targetMenuLabel}" do menu de anexo não encontrada.`);
        err.code = 'MENU_NOT_FOUND';
        throw err;
      }

      timing.tMenu = Math.round(performance.now() - t0);

      // Ocultar o menu de anexo imediatamente
      hideOverlayElement(menuItem);

      // Clicar no item do menu
      menuItem.click();

      // 5. Esperar o container do preview abrir via MutationObserver
      let captionContainer = null;
      try {
        captionContainer = await waitForElement('[data-testid="media-caption-input-container"]', document.body, CONFIG.PREVIEW_WAIT_MS);
      } catch (previewWaitErr) {
        try { await window.EnxameBridge.request('fi_disarm', {}, { timeoutMs: 2000 }); } catch {}
        dispatchEscape();
        const err = new Error('O preview da mídia não abriu após a seleção.');
        err.code = 'PREVIEW_NOT_OPENED';
        throw err;
      }

      const tPreviewAbs = performance.now();
      timing.tPreview = Math.round(tPreviewAbs - t0);

      // Ocultar o preview imediatamente
      hideOverlayElement(captionContainer);

      // 6. Legenda: se fornecida, preencher; sem legenda, zero espera
      if (caption && caption.trim().length > 0) {
        try {
          captionContainer.focus();
          document.execCommand('insertText', false, caption.trim());
          captionContainer.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await wait(100);
        } catch (captionErr) {
          logWarn('Falha ao inserir legenda. Abortando com segurança:', captionErr.message);
          try { await activateClose(); } catch {}
          const err = new Error('Falha ao preencher legenda da mídia.');
          err.code = 'CAPTION_FAILED';
          throw err;
        }
      }

      // 7. Prontidão em vez de espera fixa
      await waitUntilReady(kind, asDocument, tPreviewAbs);
      timing.tPronto = Math.round(performance.now() - t0);

      // 8. Releitura do título do chat IMEDIATAMENTE antes do clique em Enviar
      const preClickChatTitle = getChatTitle();
      if (preClickChatTitle !== initialChatTitle) {
        logWarn(`Destinatário mudou imediatamente antes de Enviar! Inicial="${initialChatTitle}", Atual="${preClickChatTitle}". Abortando.`);
        try { await activateClose(); } catch {}
        const err = new Error(`Destinatário alterado imediatamente antes do envio (${initialChatTitle} -> ${preClickChatTitle}).`);
        err.code = 'CHAT_CHANGED';
        err.mayHaveSent = mayHaveSent;
        throw err;
      }

      // Localizar botão Enviar
      const sendBtn = getSendButton();
      if (!sendBtn) {
        logWarn('Botão Enviar não localizado no preview. Fechando preview...');
        try { await activateClose(); } catch {}
        const err = new Error('Botão Enviar do preview não encontrado.');
        err.code = 'PREVIEW_SEND_BUTTON_NOT_FOUND';
        throw err;
      }

      // 9. Envio exclusivo com clique T1 (element.click)
      logDebug('Acionando botão Enviar exclusivamente com clique T1...');
      sendBtn.click();
      timing.tClique = Math.round(performance.now() - t0);
      mayHaveSent = true;

      // 10. Aguardar preview fechar e linha nova de saída aparecer
      const blobMb = blob.size / (1024 * 1024);
      const postClickMaxWait = Math.min(60000, 6000 + 1500 * Math.ceil(blobMb));
      const waitStart = performance.now();

      let candidateTestId = null;
      let previewClosedAtMs = 0;

      while (performance.now() - waitStart < postClickMaxWait) {
        const previewOpen = isPreviewOpen();
        if (!previewOpen && !previewClosedAtMs) {
          previewClosedAtMs = performance.now();
          timing.tPreviewFechou = Math.round(previewClosedAtMs - t0);
          logDebug(`Preview fechou aos ${timing.tPreviewFechou}ms`);
        }

        const rows = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
        const newRows = rows.filter(r => !snapshot.testIds.has(r.getAttribute('data-testid')));

        if (newRows.length > 0) {
          for (const row of newRows) {
            const testId = row.getAttribute('data-testid');
            const hasStatusLabel = !!row.querySelector(
              `[aria-label="${LABELS.STATUS_PENDING}"], [aria-label="${LABELS.STATUS_SENT}"], [aria-label="${LABELS.STATUS_DELIVERED}"], [aria-label="${LABELS.STATUS_READ}"]`
            );

            if (hasStatusLabel) {
              candidateTestId = testId;
              break;
            } else {
              const lastSnapshotIdx = snapshot.lastId ? rows.findIndex(r => r.getAttribute('data-testid') === snapshot.lastId) : -1;
              const thisIdx = rows.indexOf(row);
              const isAfterLast = thisIdx > lastSnapshotIdx;
              const hasThirdPartyLabel = !!row.querySelector('[aria-label$=":"]:not([aria-label="Você:"])');

              if (isAfterLast && previewClosedAtMs && !hasThirdPartyLabel) {
                candidateTestId = testId;
                break;
              }
            }
          }
        }

        // Tarefa E: RESOLVER CEDO assim que o preview fechou E existe linha de saída nova
        if (!previewOpen && candidateTestId) {
          timing.tLinhaNova = Math.round(performance.now() - t0);
          const totalMs = timing.tLinhaNova;

          if (totalMs > 3000) {
            console.info(`[Enxame][DomSender] lento: total=${totalMs}ms fases=anexar:${timing.tAnexar}ms,menu:${timing.tMenu}ms,arm:${timing.tArm}ms,preview:${timing.tPreview}ms,pronto:${timing.tPronto}ms,clique:${timing.tClique}ms,fechou:${timing.tPreviewFechou}ms,linha:${timing.tLinhaNova}ms`);
          }

          // Inicia observação em background da linha sem bloquear a resolução
          const confirmedPromise = createConfirmedPromise(candidateTestId, previewClosedAtMs, t0, timing);

          return {
            ok: true,
            stage: 'queued',
            verified: false,
            strategy: asDocument ? 'MENU_INTERCEPT_DOCUMENT' : 'MENU_INTERCEPT_MEDIA',
            ms: totalMs,
            messageTestId: candidateTestId,
            timing,
            confirmed: confirmedPromise
          };
        }

        await wait(CONFIG.CONFIRM_POLL_MS);
      }

      // Se estourou o tempo de espera pós-clique sem fechar o preview e sem linha nova
      if (isPreviewOpen()) {
        try { await activateClose(); } catch (closeErr) { logWarn('Falha ao fechar preview após timeout pós-clique:', closeErr); }
      }

      const diag = buildDiag(snapshot, t0, previewClosedAtMs);
      logWarn('[Enxame][DomSender] Confirmação falhou após tempo limite pós-clique:', diag);

      const err = new Error('Envio não pôde ser confirmado no tempo limite pós-clique.');
      err.code = 'SEND_NOT_CONFIRMED';
      err.mayHaveSent = mayHaveSent;
      err.details = diag;
      throw err;
    } finally {
      // Regra de segurança obrigatória: NUNCA deixar elementos ocultos após término ou erro
      clearAllHiding();
    }
  }

  // API Pública protegida por mutex
  const EnxameDomSender = {
    send(params) {
      const task = sendQueue.then(() => internalSend(params));
      // Garante que o mutex continue mesmo se a tarefa falhar
      sendQueue = task.catch(() => {});
      return task;
    }
  };

  window.EnxameDomSender = EnxameDomSender;
  logDebug('EnxameDomSender v2.8.2 pronto.');
})();
