// Content script — runs in the context of pages matched in manifest.json.

(async () => {
  const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (!settings?.enabled) return;

  console.log('[Tasks++] content script loaded on', location.href);
})();
