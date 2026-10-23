const DEFAULTS = { enabled: true, density: 'cozy' };

const form = document.getElementById('options-form');
const statusEl = document.getElementById('status');

async function loadForm() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  form.elements.enabled.checked = settings.enabled;
  form.elements.compact.checked = settings.density === 'compact';
}

await loadForm();

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

async function save(values) {
  await chrome.storage.sync.set(values);
  showStatus('Saved.');
}

// Downloads everything the extension stores (settings in sync storage, tasks
// and topics in local storage) as a JSON file.
async function exportState() {
  const state = {
    exportedAt: new Date().toISOString(),
    version: chrome.runtime.getManifest().version,
    sync: await chrome.storage.sync.get(null),
    local: await chrome.storage.local.get(null),
  };
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `tasks-plus-plus-${state.exportedAt.slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
  showStatus('Exported.');
}

// The Compact tables switch takes effect immediately; Save stores everything.
form.elements.compact.addEventListener('change', () => save({ density: readForm().density }));

// Replaces everything stored in `area` with `items`. New values are written
// before stale keys are removed, so a failure never leaves the area empty.
async function replaceArea(area, items) {
  const staleKeys = Object.keys(await area.get(null)).filter((key) => !(key in items));
  await area.set(items);
  await area.remove(staleKeys);
}

// Restores a file written by exportState, replacing all current state.
async function importState(file) {
  let state;
  try {
    state = JSON.parse(await file.text());
  } catch {
    showStatus('Import failed: not a JSON file.');
    return;
  }
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(state) || !isObject(state.sync) || !isObject(state.local)) {
    showStatus('Import failed: not a Tasks++ export.');
    return;
  }
  if (!confirm(`Replace all Tasks++ settings, tasks and topics with the contents of ${file.name}?`)) return;

  try {
    await replaceArea(chrome.storage.sync, state.sync);
    await replaceArea(chrome.storage.local, state.local);
  } catch (error) {
    console.error('[Tasks++] import failed', error);
    showStatus(`Import failed: ${error.message}`);
    return;
  }
  await loadForm();
  showStatus('Imported.');
}

document.getElementById('export').addEventListener('click', exportState);

const importFile = document.getElementById('import-file');
document.getElementById('import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const [file] = importFile.files;
  importFile.value = ''; // so picking the same file again still fires 'change'
  if (file) await importState(file);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save(readForm());
});
