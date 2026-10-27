/**
 * Enxame Zap v2.8.1 - dom-sender.js (ISOLATED World)
 * Envio confiável e confirmado de imagens e vídeos (inclusive como documento)
 * via automação estrita do DOM do WhatsApp Web com interceptação no mundo MAIN.
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
    STABILIZATION_MS: 700,
    MENU_WAIT_MS: 2500,
    PREVIEW_WAIT_MS: 5000,
    CONFIRM_POLL_MS: 250,
    STATUS_WAIT_AFTER_CLOSE_MS: 8000
  };

  // Mutex para evitar envios concorrentes
  let sendQueue = Promise.resolve();

  // Memória adaptativa da camada que funcionou na sessão atual
  let lastWorkingSendLayer = null;
  let lastWorkingCloseLayer = null;

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function isPreviewOpen() {
    return !!document.querySelector('[data-testid="media-caption-input-container"]');
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

  // Disparo de eventos de ponteiro/mouse nas coordenadas centrais
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

  // Ativação do botão Fechar com as camadas T3 -> T2 -> T1 -> T4
  async function activateClose() {
    await wait(CONFIG.STABILIZATION_MS);
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

  // Snapshot das mensagens do chat atual em #main
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

  // Ponto 1: NÃO forçar MIME. Usar o blob.type normalizado.
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

  // Execução do envio (dentro do mutex)
  async function internalSend({ kind, blob, asDocument = false, caption = '' }) {
    const startTime = Date.now();
    const activation = { enviar: null, fechar: null };

    // 1. Pré-condições
    const mainEl = document.querySelector('#main');
    const composeBox = document.querySelector('#main footer [data-testid="conversation-compose-box-input"]');
    if (!mainEl || !composeBox) {
      const err = new Error('Nenhuma conversa aberta no WhatsApp Web. Abra um chat antes de enviar.');
      err.code = 'NO_CHAT_OPEN';
      throw err;
    }

    // Ponto 3(a): se o título inicial do chat for vazio, lançar NO_CHAT_TITLE antes de armar o interceptador
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

    // Ponto 1: Validação estrita de MIME antes de qualquer clique ou fi_arm
    const { mime, name } = inferExtensionAndMime(blob, kind, asDocument);

    // Validação de tamanho
    const maxAllowed = asDocument
      ? CONFIG.MAX_DOC_SIZE
      : (kind === 'video' ? CONFIG.MAX_VIDEO_SIZE : CONFIG.MAX_IMAGE_SIZE);
    if (blob.size > maxAllowed) {
      const err = new Error(`Arquivo excede o limite permitido (${(maxAllowed / 1024 / 1024).toFixed(0)}MB).`);
      err.code = 'FILE_TOO_LARGE';
      throw err;
    }

    // 2. Se já existe preview aberto, tentar fechar antes
    if (isPreviewOpen()) {
      logWarn('Preview já aberto antes do envio. Tentando fechar...');
      try {
        await activateClose();
      } catch (closeErr) {
        throw closeErr;
      }
    }

    // 3. Snapshot das mensagens existentes
    const snapshot = snapshotMessages();
    logDebug(`Snapshot inicial: ${snapshot.count} mensagens em #main`);

    // 4. Clicar no botão Anexar
    const attachBtn = document.querySelector('#main footer button[aria-label="Anexar"]');
    if (!attachBtn) {
      const err = new Error('Botão "Anexar" não encontrado no rodapé do chat.');
      err.code = 'ATTACH_BUTTON_NOT_FOUND';
      throw err;
    }
    attachBtn.click();

    // Esperar item do menu
    const targetMenuLabel = asDocument ? LABELS.MENU_DOC : LABELS.MENU_MEDIA;
    let menuItem = null;
    const menuStart = Date.now();

    while (Date.now() - menuStart < CONFIG.MENU_WAIT_MS) {
      menuItem = document.querySelector(`button[role="menuitem"][aria-label="${targetMenuLabel}"]`);
      if (menuItem) break;
      await wait(100);
    }

    if (!menuItem) {
      dispatchEscape();
      const err = new Error(`Opção "${targetMenuLabel}" do menu de anexo não encontrada.`);
      err.code = 'MENU_NOT_FOUND';
      throw err;
    }

    // Armar interceptador no mundo MAIN via bridge
    if (!window.EnxameBridge) {
      dispatchEscape();
      const err = new Error('Ponte EnxameBridge não carregada.');
      err.code = 'BRIDGE_NOT_FOUND';
      throw err;
    }

    logDebug(`Armando fi_arm na bridge para ${targetMenuLabel}...`);
    try {
      await window.EnxameBridge.request('fi_arm', {
        file: blob,
        name,
        type: mime,
        expect: asDocument ? 'document' : 'media',
        ttlMs: 8000
      }, { timeoutMs: 5000 });
    } catch (armErr) {
      dispatchEscape();
      const err = new Error('Falha ao armar interceptador de arquivos: ' + armErr.message);
      err.code = 'INTERCEPT_ARM_FAILED';
      throw err;
    }

    // Clicar no item do menu para o WhatsApp criar o input e chamar .click()
    menuItem.click();

    // Esperar preview abrir
    const previewStart = Date.now();
    let previewOpened = false;
    while (Date.now() - previewStart < CONFIG.PREVIEW_WAIT_MS) {
      if (isPreviewOpen()) {
        previewOpened = true;
        break;
      }
      await wait(150);
    }

    if (!previewOpened) {
      try {
        await window.EnxameBridge.request('fi_disarm', {}, { timeoutMs: 2000 });
      } catch {}
      dispatchEscape();
      const err = new Error('O preview da mídia não abriu após a seleção.');
      err.code = 'PREVIEW_NOT_OPENED';
      throw err;
    }

    logDebug('Preview de mídia aberto com sucesso!');

    // 5. Inserir legenda (se fornecida)
    if (caption && caption.trim().length > 0) {
      try {
        const captionBox = document.querySelector('[data-testid="media-caption-input-container"]');
        if (captionBox) {
          captionBox.focus();
          document.execCommand('insertText', false, caption.trim());
          captionBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await wait(100);
        }
      } catch (captionErr) {
        logWarn('Falha ao inserir legenda. Abortando com segurança:', captionErr.message);
        try { await activateClose(); } catch {}
        const err = new Error('Falha ao preencher legenda da mídia.');
        err.code = 'CAPTION_FAILED';
        throw err;
      }
    }

    // 6. Segurança de destinatário: conferir antes da estabilização
    const currentChatTitle = getChatTitle();
    if (currentChatTitle !== initialChatTitle) {
      logWarn(`Destinatário mudou durante o preview! Inicial="${initialChatTitle}", Atual="${currentChatTitle}". Abortando.`);
      try { await activateClose(); } catch {}
      const err = new Error(`Destinatário alterado durante a montagem do envio (${initialChatTitle} -> ${currentChatTitle}).`);
      err.code = 'CHAT_CHANGED';
      throw err;
    }

    // 7. Estabilização (700ms) antes do primeiro clique em Enviar
    await wait(CONFIG.STABILIZATION_MS);

    // Localizar botão Enviar
    const sendBtn = getSendButton();
    if (!sendBtn) {
      logWarn('Botão Enviar não localizado no preview. Fechando preview...');
      try { await activateClose(); } catch {}
      const err = new Error('Botão Enviar do preview não encontrado.');
      err.code = 'PREVIEW_SEND_BUTTON_NOT_FOUND';
      throw err;
    }

    // 8. Ativação do botão Enviar em camadas: T1 -> T3 -> T2
    const defaultSendOrder = ['T1', 'T3', 'T2'];
    let sendOrder = defaultSendOrder.slice();
    if (lastWorkingSendLayer && sendOrder.includes(lastWorkingSendLayer)) {
      sendOrder = [lastWorkingSendLayer, ...sendOrder.filter(l => l !== lastWorkingSendLayer)];
    }

    let mayHaveSent = false;
    let clickedLayer = null;
    let lastSendClickTime = 0;

    for (const layer of sendOrder) {
      const currentSendBtn = getSendButton();
      if (!currentSendBtn) {
        // Preview já sumiu
        break;
      }

      // Ponto 3(b): reler o título IMEDIATAMENTE antes de CADA clique em Enviar
      const preClickChatTitle = getChatTitle();
      if (preClickChatTitle !== initialChatTitle) {
        logWarn(`Destinatário mudou imediatamente antes de clicar em Enviar (${layer})! Inicial="${initialChatTitle}", Atual="${preClickChatTitle}". Abortando.`);
        try { await activateClose(); } catch {}
        const err = new Error(`Destinatário alterado imediatamente antes do envio (${initialChatTitle} -> ${preClickChatTitle}).`);
        err.code = 'CHAT_CHANGED';
        err.mayHaveSent = mayHaveSent;
        throw err;
      }

      logDebug(`Acionando botão Enviar com camada ${layer}...`);
      executeLayer(currentSendBtn, layer);
      lastSendClickTime = Date.now();
      mayHaveSent = true;
      clickedLayer = layer;

      // Espera 2.5s verificando se o preview sumiu ou surgiu linha nova
      const checkStart = Date.now();
      let shouldStopLayers = false;

      while (Date.now() - checkStart < 2500) {
        if (!isPreviewOpen()) {
          shouldStopLayers = true;
          break;
        }
        const currentRows = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
        const hasNewRow = currentRows.some(r => !snapshot.testIds.has(r.getAttribute('data-testid')));
        if (hasNewRow) {
          shouldStopLayers = true;
          break;
        }
        await wait(200);
      }

      if (shouldStopLayers) {
        lastWorkingSendLayer = layer;
        activation.enviar = layer;
        logDebug(`Camada de envio ${layer} bem sucedida (preview fechou ou linha detectada).`);
        break;
      } else {
        logWarn(`Camada ${layer} não fechou o preview e não gerou mensagem nova. Tentando próxima camada...`);
      }
    }

    activation.enviar = activation.enviar || clickedLayer;

    // Ponto 2(a): se depois do laço das camadas de Enviar o preview CONTINUA aberto e não existe linha nova,
    // fechar o preview com activateClose (em try/catch) e lançar SEND_NOT_CONFIRMED com mayHaveSent=true e details;
    // NÃO esperar o timeout longo nesse caso.
    const rowsAfterLayers = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
    const hasRowAfterLayers = rowsAfterLayers.some(r => !snapshot.testIds.has(r.getAttribute('data-testid')));
    if (isPreviewOpen() && !hasRowAfterLayers) {
      logWarn('Preview continua aberto e não há linha nova após esgotar camadas de Enviar. Fechando preview e abortando...');
      try {
        await activateClose();
      } catch (closeErr) {
        logWarn('Falha ao fechar preview após esgotar camadas de Enviar:', closeErr.message);
      }
      const diag = buildDiag(snapshot, startTime, null);
      const err = new Error('Envio não confirmado: o preview não fechou após as tentativas de Enviar.');
      err.code = 'SEND_NOT_CONFIRMED';
      err.mayHaveSent = mayHaveSent;
      err.details = diag;
      throw err;
    }

    // 9. Confirmação em dois níveis
    const blobMb = blob.size / (1024 * 1024);
    const timeoutMs = Math.min(120000, 10000 + Math.ceil(blobMb) * 2000);
    const confirmStart = Date.now();
    let previewClosedAt = !isPreviewOpen() ? Date.now() : null;

    let candidateRow = null;
    let candidateTestId = null;
    let isConfirmed = false;
    let isProbable = false;

    logDebug(`Iniciando polling de confirmação em #main (timeout=${timeoutMs}ms)...`);

    while (Date.now() - confirmStart < timeoutMs) {
      if (!previewClosedAt && !isPreviewOpen()) {
        previewClosedAt = Date.now();
        logDebug(`Preview fechou em ${previewClosedAt - startTime}ms.`);
      }

      const rows = Array.from(document.querySelectorAll('#main [data-testid^="conv-msg-"]'));
      const newRows = rows.filter(r => !snapshot.testIds.has(r.getAttribute('data-testid')));

      // Ponto 2(b): Na confirmação, se o preview ainda estiver aberto e não houver linha nova 8s depois do último clique em Enviar, abortar do mesmo jeito.
      if (isPreviewOpen() && newRows.length === 0 && lastSendClickTime > 0 && (Date.now() - lastSendClickTime >= 8000)) {
        logWarn('Preview ainda aberto e sem linha nova 8s após último clique em Enviar. Fechando preview e abortando...');
        try {
          await activateClose();
        } catch (closeErr) {
          logWarn('Falha ao fechar preview aos 8s pós-clique:', closeErr.message);
        }
        const diag = buildDiag(snapshot, startTime, previewClosedAt);
        const err = new Error('Envio não confirmado: preview continuou aberto 8s após o clique em Enviar.');
        err.code = 'SEND_NOT_CONFIRMED';
        err.mayHaveSent = mayHaveSent;
        err.details = diag;
        throw err;
      }

      if (newRows.length > 0) {
        for (const row of newRows) {
          const testId = row.getAttribute('data-testid');
          // N2 Classificação: CONFIRMADA se tem aria-label de status
          const hasStatusLabel = !!row.querySelector(
            `[aria-label="${LABELS.STATUS_PENDING}"], [aria-label="${LABELS.STATUS_SENT}"], [aria-label="${LABELS.STATUS_DELIVERED}"], [aria-label="${LABELS.STATUS_READ}"]`
          );

          if (hasStatusLabel) {
            candidateRow = row;
            candidateTestId = testId;
            isConfirmed = true;

            const isDone = !!row.querySelector(
              `[aria-label="${LABELS.STATUS_SENT}"], [aria-label="${LABELS.STATUS_DELIVERED}"], [aria-label="${LABELS.STATUS_READ}"]`
            );

            if (isDone) {
              const elapsed = Date.now() - startTime;
              logDebug(`Mensagem confirmada como SENT (${elapsed}ms): ${testId}`);
              return {
                ok: true,
                stage: 'sent',
                verified: true,
                strategy: asDocument ? 'MENU_INTERCEPT_DOCUMENT' : 'MENU_INTERCEPT_MEDIA',
                ms: elapsed,
                messageTestId: testId,
                activation
              };
            }
          } else {
            // PROVÁVEL: nova, após a última linha do snapshot, preview fechado, sem remetente de terceiros
            const lastSnapshotIdx = snapshot.lastId ? rows.findIndex(r => r.getAttribute('data-testid') === snapshot.lastId) : -1;
            const thisIdx = rows.indexOf(row);
            const isAfterLast = thisIdx > lastSnapshotIdx;
            const hasThirdPartyLabel = !!row.querySelector('[aria-label$=":"]:not([aria-label="Você:"])');

            if (isAfterLast && previewClosedAt && !hasThirdPartyLabel) {
              candidateRow = row;
              candidateTestId = testId;
              isProbable = true;
            }
          }
        }
      }

      // Se a mensagem ficou em Pendente ou PROVÁVEL por mais de 8s após o preview fechar
      if ((isConfirmed || isProbable) && previewClosedAt && (Date.now() - previewClosedAt >= CONFIG.STATUS_WAIT_AFTER_CLOSE_MS)) {
        const elapsed = Date.now() - startTime;
        logDebug(`Status não mudou para Enviada após 8s pós-preview (${elapsed}ms). Retornando queued (verified=false).`);
        return {
          ok: true,
          stage: 'queued',
          verified: false,
          strategy: asDocument ? 'MENU_INTERCEPT_DOCUMENT' : 'MENU_INTERCEPT_MEDIA',
          ms: elapsed,
          messageTestId: candidateTestId,
          activation
        };
      }

      await wait(CONFIG.CONFIRM_POLL_MS);
    }

    // Se saiu pelo timeout e temos um candidato pendente/provável
    if (candidateTestId) {
      const elapsed = Date.now() - startTime;
      return {
        ok: true,
        stage: 'queued',
        verified: false,
        strategy: asDocument ? 'MENU_INTERCEPT_DOCUMENT' : 'MENU_INTERCEPT_MEDIA',
        ms: elapsed,
        messageTestId: candidateTestId,
        activation
      };
    }

    // Ponto 2(c): No timeout final, se o preview ainda estiver aberto, fechá-lo antes de lançar o erro.
    if (isPreviewOpen()) {
      logWarn('Preview ainda aberto no esgotamento do timeout final. Fechando preview...');
      try {
        await activateClose();
      } catch (closeErr) {
        logWarn('Falha ao fechar preview no timeout final:', closeErr.message);
      }
    }

    const diag = buildDiag(snapshot, startTime, previewClosedAt);
    logWarn('[Enxame][DomSender] Confirmação falhou após timeout:', diag);

    const err = new Error('Envio não pôde ser confirmado no tempo limite.');
    err.code = 'SEND_NOT_CONFIRMED';
    err.mayHaveSent = mayHaveSent;
    err.details = diag;
    throw err;
  }

  // API Pública protegida por mutex
  const EnxameDomSender = {
    send(params) {
      const task = sendQueue.then(() => internalSend(params));
      sendQueue = task.catch(() => {});
      return task;
    }
  };

  window.EnxameDomSender = EnxameDomSender;
  logDebug('EnxameDomSender v2.8.1 inicializado com sucesso.');
})();
