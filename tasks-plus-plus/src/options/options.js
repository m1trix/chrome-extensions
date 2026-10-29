const DEFAULTS = { enabled: true, density: 'cozy' };

const form = document.getElementById('options-form');
const statusEl = document.getElementById('status');

const settings = await chrome.storage.sync.get(DEFAULTS);
form.elements.enabled.checked = settings.enabled;
form.elements.compact.checked = settings.density === 'compact';

function readForm() {
  return {
    enabled: form.elements.enabled.checked,
    density: form.elements.compact.checked ? 'compact' : 'cozy',
  };
}

let statusTimer;
function showStatus(text) {
  statusEl.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 1500);
}

// Each change is saved (and takes effect) immediately. Only the changed setting
// is written, so one changed elsewhere meanwhile (e.g. Enabled in the side
// panel) isn't overwritten with this page's stale value.
form.addEventListener('change', async (event) => {
  const key = event.target.name === 'compact' ? 'density' : event.target.name;
  await chrome.storage.sync.set({ [key]: readForm()[key] });
  showStatus('Saved.');
});
