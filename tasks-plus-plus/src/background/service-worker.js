// Background service worker (Manifest V3).
// Note: service workers are terminated when idle — don't keep state in globals,
// persist it with chrome.storage instead.

const DEFAULT_SETTINGS = {
  enabled: true,
};

// Open side panels, keyed by window id. Each open panel holds a port to this
// worker (and reconnects if the worker restarts), so this map stays accurate.
const panelPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  const [name, windowId] = port.name.split(':');
  if (name !== 'sidepanel') return;

  panelPorts.set(Number(windowId), port);
  port.onDisconnect.addListener(() => {
    if (panelPorts.get(Number(windowId)) === port) panelPorts.delete(Number(windowId));
  });
});

// Toggle the side panel when the toolbar icon is clicked.
// sidePanel.open() must be called synchronously inside the click handler
// (it requires a user gesture), so don't await anything before it.
chrome.action.onClicked.addListener((tab) => {
  const port = panelPorts.get(tab.windowId);
  console.log(`[Tasks++] icon clicked in window ${tab.windowId}, panel open: ${Boolean(port)}`);
  if (port) {
    // sidePanel.close() needs Chrome 141+; older versions let the panel close itself.
    if (chrome.sidePanel.close) {
      chrome.sidePanel
        .close({ windowId: tab.windowId })
        .catch((error) => console.error('[Tasks++] sidePanel.close failed', error));
    } else {
      port.postMessage({ type: 'CLOSE' });
    }
    return;
  }

  chrome.sidePanel
    .open({ windowId: tab.windowId })
    .catch((error) => console.error('[Tasks++] sidePanel.open failed', error));
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
  console.log(`[Tasks++] onInstalled: ${reason}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'PING':
      sendResponse({ type: 'PONG', from: 'background' });
      return false;
    case 'GET_SETTINGS':
      chrome.storage.sync.get(DEFAULT_SETTINGS).then(sendResponse);
      return true; // keep the channel open for the async response
    default:
      return false;
  }
});
