
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ENXAME_DOWNLOAD') {
    try {
      chrome.downloads.download({
        url: msg.dataUrl,
        filename: msg.filename,
        saveAs: false
      }, () => {
        sendResponse({ok:true});
      });
      return true;
    } catch(e) {
      console.error('Enxame download error', e);
      sendResponse({ok:false, error: e.message});
    }
  }
  if (msg.type === 'ENXAME_OPEN_BUILDER') {
    const url = chrome.runtime.getURL('builder.html') + (msg.funnelId ? `?id=${msg.funnelId}` : '');
    chrome.tabs.create({url});
    sendResponse({ok:true});
    return true;
  }
});
