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
async function save(values) {
  await chrome.storage.sync.set(values);
  statusEl.textContent = 'Saved.';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 1500);
}

// The Compact tables switch takes effect immediately; Save stores everything.
form.elements.compact.addEventListener('change', () => save({ density: readForm().density }));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save(readForm());
});
