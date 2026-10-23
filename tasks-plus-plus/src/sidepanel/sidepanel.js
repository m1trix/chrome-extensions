// Keep a port open to the service worker so it knows this panel is open and can
// ask it to close when the toolbar icon is clicked again. The worker may be
// terminated while idle, which drops the port, so reconnect when that happens.
const { id: windowId } = await chrome.windows.getCurrent();

function connectToWorker() {
  const port = chrome.runtime.connect({ name: `sidepanel:${windowId}` });
  port.onMessage.addListener((message) => {
    if (message?.type === 'CLOSE') window.close();
  });
  port.onDisconnect.addListener(connectToWorker);
}

connectToWorker();

// Task tables: one per tab. In the Pending and In Progress tabs the last row is
// an input row (Enter or "+" adds a task), and each task has buttons to move it
// on (Pending: Start; In Progress: Pause back to Pending, or Done) or to
// Abandoned. Every task in every tab can be deleted. Complete and Abandoned
// show fewer columns, giving the title more room.
const COLUMNS = [
  { key: 'title', label: 'TITLE', size: 20, placeholder: 'Add a task…' },
  { key: 'pr', label: 'PR', size: 6 },
  { key: 'branch', label: 'BRANCH', size: 16, mono: true },
  { key: 'base', label: 'BASE', size: 8, mono: true },
  { key: 'sr', label: 'SR', checkbox: true },
  { key: 'mt', label: 'MT', checkbox: true },
  { key: 'cr', label: 'CR', checkbox: true },
  // Generated from BRANCH and BASE; shown only as a copy button.
  { key: 'rebaseCommand', label: 'REBASE', copy: true },
];

const rebaseCommand = ({ branch, base }) =>
  branch && base ? `git checkout ${branch} && git merge --no-edit ${base} && git push` : null;

const ICONS = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9l7-4.5z" /></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4v8M10.5 4v8" /></svg>',
  ban: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M4.1 11.9l7.8-7.8" /></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>',
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" /><circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" /></svg>',
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" /></svg>',
};

const DELETE_ACTION = { key: 'delete', label: 'Delete', icon: ICONS.x, run: (status, id) => deleteTask(status, id) };

const SUMMARY_COLUMNS = ['title', 'pr', 'branch', 'base'];

// What each tab offers, keyed by status (the tab panel id without "panel-").
// `columns` lists the column keys to show; omitted means all of them.
const DONE_ACTION = { key: 'done', label: 'Mark as done', icon: ICONS.check, run: (status, id) => moveTask(status, id, 'complete') };
const START_ACTION = { key: 'start', label: 'Start (move to In Progress)', icon: ICONS.play, run: (status, id) => moveTask(status, id, 'in-progress') };
const PAUSE_ACTION = { key: 'pause', label: 'Pause (move back to Pending)', icon: ICONS.pause, run: (status, id) => moveTask(status, id, 'pending') };
const ABANDON_ACTION = { key: 'abandon', label: 'Abandon', icon: ICONS.ban, run: (status, id) => moveTask(status, id, 'abandoned') };

const TAB_OPTIONS = {
  'in-progress': {
    inputRow: true,
    rowActions: [PAUSE_ACTION, DONE_ACTION, ABANDON_ACTION, DELETE_ACTION],
    emptyText: 'No tasks in progress. Add one below.',
  },
  pending: {
    inputRow: true,
    rowActions: [START_ACTION, ABANDON_ACTION, DELETE_ACTION],
    emptyText: 'No pending tasks. Add one below.',
  },
  complete: {
    inputRow: false,
    rowActions: [DELETE_ACTION],
    columns: SUMMARY_COLUMNS,
    emptyText: 'No completed tasks yet.',
  },
  abandoned: {
    inputRow: false,
    rowActions: [DELETE_ACTION],
    columns: SUMMARY_COLUMNS,
    emptyText: 'No abandoned tasks.',
  },
};

// Tasks are stored per topic and status, e.g. under "tasks:<topic id>:in-progress".
// Unless given, the topic is the one this panel is showing.
const STATUSES = Object.keys(TAB_OPTIONS);
let currentTopic; // id of the topic shown in this panel, set before the first render
const statusOf = (panel) => panel.id.replace(/^panel-/, '');
const storageKey = (status, topic = currentTopic) => `tasks:${topic}:${status}`;

async function loadTasks(status) {
  const key = storageKey(status);
  return (await chrome.storage.local.get({ [key]: [] }))[key];
}

async function addTask(status, task) {
  const tasks = await loadTasks(status);
  await chrome.storage.local.set({ [storageKey(status)]: [...tasks, task] });
}

async function updateTask(status, id, fields) {
  const tasks = await loadTasks(status);
  await chrome.storage.local.set({
    [storageKey(status)]: tasks.map((task) => (task.id === id ? { ...task, ...fields } : task)),
  });
}

// Moves a task to position `toIndex` within its own status list.
async function reorderTask(status, id, toIndex) {
  const tasks = await loadTasks(status);
  const from = tasks.findIndex((task) => task.id === id);
  if (from === -1) return;
  const [task] = tasks.splice(from, 1);
  tasks.splice(Math.max(0, Math.min(toIndex, tasks.length)), 0, task);
  await chrome.storage.local.set({ [storageKey(status)]: tasks });
}

async function deleteTask(status, id) {
  const tasks = await loadTasks(status);
  await chrome.storage.local.set({ [storageKey(status)]: tasks.filter((task) => task.id !== id) });
}

// Keeps only the fields the target tab shows (plus id, and the PR link with the
// PR); anything else is discarded when a task moves there.
function fieldsFor(status, task) {
  const keys = TAB_OPTIONS[status].columns;
  if (!keys) return task;
  const kept = ['id', ...keys, ...(keys.includes('pr') ? ['prUrl'] : [])];
  return Object.fromEntries(kept.filter((key) => key in task).map((key) => [key, task[key]]));
}

// Moves a task between statuses in a single write, so it is never in both or
// neither. It goes to position `toIndex` in the target list (default: the end).
async function moveTask(from, id, to, toIndex = Infinity) {
  const [source, target] = await Promise.all([loadTasks(from), loadTasks(to)]);
  const task = source.find((t) => t.id === id);
  if (!task) return;
  const updated = [...target];
  updated.splice(Math.min(toIndex, updated.length), 0, fieldsFor(to, task));
  await chrome.storage.local.set({
    [storageKey(from)]: source.filter((t) => t.id !== id),
    [storageKey(to)]: updated,
  });
}

// Recognises a GitHub pull request link, e.g. https://github.com/me/repo/pull/11/files,
// and returns its number and canonical URL (https://github.com/me/repo/pull/11).
function parsePrUrl(text) {
  const match = text.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (!match) return null;
  const [, owner, repo, number] = match;
  return { number, url: `https://github.com/${owner}/${repo}/pull/${number}` };
}

function createCheckbox(checked, ariaLabel) {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.setAttribute('aria-label', ariaLabel);
  return checkbox;
}

function createIconButton({ key, label, icon }, ariaLabel = label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button ${key}`;
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

// A button that copies `text` to the clipboard and briefly shows a check mark.
// Without text (e.g. a task with no branch or base) it is disabled.
function createCopyButton(text, { label, ariaLabel, disabledLabel }) {
  const button = createIconButton({ key: 'copy', label, icon: ICONS.copy }, ariaLabel);
  if (!text) {
    button.disabled = true;
    button.title = disabledLabel;
    return button;
  }

  let resetTimer;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[Tasks++] copy failed', error);
      button.title = 'Copy failed';
      return;
    }
    button.innerHTML = ICONS.check;
    button.classList.add('copied');
    button.title = 'Copied!';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.innerHTML = ICONS.copy;
      button.classList.remove('copied');
      button.title = label;
    }, 1500);
  });
  return button;
}

// Pasting a GitHub PR link into the PR input shows "#<number>" and keeps the
// link in data-url. Editing the text afterwards drops the link.
function setUpPrInput(input, draftUrl) {
  if (draftUrl) input.dataset.url = draftUrl;
  input.addEventListener('paste', (event) => {
    const pr = parsePrUrl(event.clipboardData.getData('text'));
    if (!pr) return;
    event.preventDefault();
    input.value = `#${pr.number}`;
    input.dataset.url = pr.url;
  });
  input.addEventListener('input', () => delete input.dataset.url);
}

// Drag and drop. Rows are dragged by their grip handle (so text selection and
// the row's controls keep working). Dropping within a tab reorders; dropping on
// another tab's name (or into its table, which opens after a short hover) moves
// the task there.
let dragged = null; // { status, id } while a row is being dragged

function createDragHandle(status, tasks, task, row) {
  const handle = createIconButton({ key: 'drag-handle', label: 'Drag to reorder (or use ↑/↓)', icon: ICONS.grip }, `Move ${task.title}`);
  handle.classList.remove('icon-button');

  // The row is only draggable while the handle is held down.
  handle.addEventListener('pointerdown', () => (row.draggable = true));
  handle.addEventListener('pointerup', () => (row.draggable = false));

  row.addEventListener('dragstart', (event) => {
    dragged = { status, id: task.id };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.title);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    dragged = null;
    row.draggable = false;
    row.classList.remove('dragging');
    clearDropMarkers(row.parentElement);
  });

  handle.addEventListener('keydown', (event) => {
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = tasks.indexOf(task);
    if (index + step >= 0 && index + step < tasks.length) reorderTask(status, task.id, index + step);
  });
  return handle;
}

function clearDropMarkers(body) {
  for (const row of body.querySelectorAll('.drop-before, .drop-after')) {
    row.classList.remove('drop-before', 'drop-after');
  }
}

// Where a drop at `clientY` over `row` would land: before or after it.
function dropPosition(row, clientY) {
  const rect = row.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function setUpRowDrop(body, status, tasks) {
  const targetRow = (event) => event.target.closest?.('tr:not(.empty-row)');
  // A drop is possible over a task row, or anywhere in another tab's table
  // (e.g. its "No tasks" line) to add the task at the end.
  const canDrop = (event) => dragged && (targetRow(event) || dragged.status !== status);

  body.addEventListener('dragover', (event) => {
    if (!canDrop(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropMarkers(body);
    const row = targetRow(event);
    if (row) row.classList.add(`drop-${dropPosition(row, event.clientY)}`);
    else body.rows[body.rows.length - 1]?.classList.add('drop-after');
  });

  body.addEventListener('dragleave', (event) => {
    if (!body.contains(event.relatedTarget)) clearDropMarkers(body);
  });

  body.addEventListener('drop', (event) => {
    if (!canDrop(event)) return;
    event.preventDefault();
    clearDropMarkers(body);
    const { status: fromStatus, id } = dragged;
    dragged = null;

    const row = targetRow(event);
    let to = row ? row.sectionRowIndex + (dropPosition(row, event.clientY) === 'after' ? 1 : 0) : tasks.length;
    if (fromStatus !== status) {
      moveTask(fromStatus, id, status, to);
      return;
    }
    const from = tasks.findIndex((task) => task.id === id);
    if (from < to) to -= 1; // removing the dragged row shifts later rows up
    if (from !== -1 && to !== from) reorderTask(status, id, to);
  });
}

// A dragged row can be removed (moved to another tab) before its dragend
// fires, so also reset drag state whenever any drag ends or drops.
for (const type of ['dragend', 'drop']) {
  document.addEventListener(type, () => {
    dragged = null;
    for (const el of document.querySelectorAll('.drop-before, .drop-after, .drop-target')) {
      el.classList.remove('drop-before', 'drop-after', 'drop-target');
    }
  });
}

// Identifies a control across re-renders: "<task id or 'new'>:<column or action key>".
const controlId = (taskId, key) => `${taskId}:${key}`;

function renderTable(panel, tasks) {
  const status = statusOf(panel);
  const { inputRow: hasInputRow, rowActions, columns: columnKeys, emptyText } = TAB_OPTIONS[status];
  const columns = columnKeys ? COLUMNS.filter(({ key }) => columnKeys.includes(key)) : COLUMNS;
  const hasActions = hasInputRow || rowActions.length > 0;

  // Keep any half-filled input row and the focused control across re-renders.
  const oldInputs = [...panel.querySelectorAll('.input-row input')];
  const drafts = Object.fromEntries(
    oldInputs.map((input) => [input.name, input.type === 'checkbox' ? input.checked : input.value]),
  );
  const draftPrUrl = oldInputs.find((input) => input.name === 'pr')?.dataset.url;
  const focused = panel.contains(document.activeElement) ? document.activeElement : null;
  const focusedId = focused?.dataset.controlId;
  // If the focused row is moved away, focus the same control on the row that takes its place.
  const focusedRowIndex = focused?.closest('tbody tr')?.sectionRowIndex;
  const focusedKey = focusedId?.split(':')[1];

  const table = document.createElement('table');
  // With fewer columns the table fits the panel, so the title takes the spare width.
  table.classList.toggle('fill-title', columns !== COLUMNS);

  const headRow = table.createTHead().insertRow();
  for (const { key, label, checkbox, copy } of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    if (key === 'title') th.classList.add('title');
    if (checkbox) th.classList.add('check');
    if (copy) th.classList.add('copy-col');
    headRow.append(th);
  }
  if (hasActions) {
    const actionsTh = document.createElement('th');
    actionsTh.className = 'actions';
    actionsTh.innerHTML = '<span class="visually-hidden">Actions</span>';
    headRow.append(actionsTh);
  }

  const body = table.createTBody();
  for (const task of tasks) {
    const row = body.insertRow();
    for (const { key, label, mono, checkbox, copy } of columns) {
      const cell = row.insertCell();
      if (key === 'title') cell.classList.add('title');
      if (copy) {
        const button = createCopyButton(rebaseCommand(task), {
          label: 'Copy rebase command',
          ariaLabel: `Copy rebase command: ${task.title}`,
          disabledLabel: 'Add a branch and base to get a rebase command',
        });
        button.dataset.controlId = controlId(task.id, key);
        cell.classList.add('copy-col');
        cell.append(button);
      } else if (checkbox) {
        const input = createCheckbox(Boolean(task[key]), `${label} for ${task.title}`);
        input.dataset.controlId = controlId(task.id, key);
        input.addEventListener('change', () => updateTask(status, task.id, { [key]: input.checked }));
        cell.classList.add('check');
        cell.append(input);
      } else if (key === 'pr' && task.prUrl) {
        const link = document.createElement('a');
        link.href = task.prUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = task.pr;
        link.title = task.prUrl;
        cell.append(link);
      } else {
        cell.textContent = task[key] ?? '';
        if (mono) {
          cell.classList.add('mono');
          cell.title = cell.textContent; // full value on hover when truncated
        }
      }

      if (key === 'title') {
        const handle = createDragHandle(status, tasks, task, row);
        handle.dataset.controlId = controlId(task.id, 'move');
        cell.prepend(handle);
      }
    }

    if (hasActions) {
      const cell = row.insertCell();
      cell.className = 'actions';
      for (const action of rowActions) {
        const button = createIconButton(action, `${action.label}: ${task.title}`);
        button.dataset.controlId = controlId(task.id, action.key);
        button.addEventListener('click', () => action.run(status, task.id));
        cell.append(button);
      }
    }
  }

  if (tasks.length === 0) {
    const row = body.insertRow();
    row.className = 'empty-row';
    const cell = row.insertCell();
    cell.colSpan = headRow.cells.length;
    cell.textContent = emptyText;
  }

  let inputs = [];
  if (hasInputRow) {
    const inputRow = table.createTFoot().insertRow();
    inputRow.className = 'input-row';
    for (const { key, label, size, mono, checkbox, copy, placeholder } of columns) {
      const cell = inputRow.insertCell();
      if (key === 'title') cell.classList.add('title');
      if (copy) {
        cell.classList.add('copy-col'); // generated column: nothing to type
        continue;
      }
      let input;
      if (checkbox) {
        input = createCheckbox(drafts[key] ?? false, `New task ${label}`);
        cell.classList.add('check');
      } else {
        input = document.createElement('input');
        input.size = size;
        input.placeholder = placeholder ?? '';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = drafts[key] ?? '';
        input.setAttribute('aria-label', `New task ${label.toLowerCase()}`);
        if (mono) input.classList.add('mono');
        if (key === 'pr') setUpPrInput(input, draftPrUrl);
      }
      input.name = key;
      input.dataset.controlId = controlId('new', key);
      cell.append(input);
      inputs.push(input);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'add-button';
    addButton.textContent = '+';
    addButton.title = 'Add task';
    addButton.setAttribute('aria-label', 'Add task');
    addButton.dataset.controlId = controlId('new', 'add');
    const addCell = inputRow.insertCell();
    addCell.className = 'actions';
    addCell.append(addButton);

    async function submit() {
      const task = Object.fromEntries(
        inputs.map((input) => [input.name, input.type === 'checkbox' ? input.checked : input.value.trim()]),
      );
      // A PR link (pasted earlier, or typed in full) is saved as "#<number>" plus its URL.
      const prInput = inputs.find((input) => input.name === 'pr');
      const pr = prInput && parsePrUrl(prInput.dataset.url ?? task.pr);
      if (pr) {
        task.pr = `#${pr.number}`;
        task.prUrl = pr.url;
      }
      if (!task.title) {
        inputs[0].focus();
        return;
      }

      // Clear the row before saving: storage.onChanged re-renders the table and
      // carries the (now empty) inputs and the focus on TITLE over to the new row.
      for (const input of inputs) {
        if (input.type === 'checkbox') input.checked = false;
        else input.value = '';
        delete input.dataset.url;
      }
      inputs[0].focus();
      await addTask(status, { id: crypto.randomUUID(), ...task });
    }

    addButton.addEventListener('click', submit);
    inputRow.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || event.target === addButton) return;
      event.preventDefault();
      submit();
    });
  }

  setUpRowDrop(body, status, tasks);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.append(table);
  panel.replaceChildren(wrap);

  if (!focusedId) return;
  const restored = panel.querySelector(`[data-control-id="${CSS.escape(focusedId)}"]`);
  if (restored) {
    restored.focus();
  } else if (focusedRowIndex !== undefined) {
    const rows = body.rows;
    const row = rows[Math.min(focusedRowIndex, rows.length - 1)];
    const sameControl = row && [...row.querySelectorAll('[data-control-id]')].find(
      (el) => el.dataset.controlId.split(':')[1] === focusedKey,
    );
    (sameControl ?? inputs[0])?.focus();
  }
}

const panels = [...document.querySelectorAll('[role="tabpanel"]')];

// Topics: each topic has its own tasks in all four tabs. The list of topics
// ({ id, name }) is stored under "topics" and the last selected one under
// "activeTopic". There is always at least one topic.
let topics = [];

async function loadTopics() {
  const { topics: stored } = await chrome.storage.local.get({ topics: [] });
  if (stored.length) return stored;

  // First run with topics: tasks saved before topics existed go into "General".
  const topic = { id: crypto.randomUUID(), name: 'General' };
  const legacyKey = (status) => `tasks:${status}`;
  const legacy = await chrome.storage.local.get(STATUSES.map(legacyKey));
  await chrome.storage.local.set({
    topics: [topic],
    ...Object.fromEntries(
      STATUSES.filter((status) => legacy[legacyKey(status)]).map((status) => [
        storageKey(status, topic.id),
        legacy[legacyKey(status)],
      ]),
    ),
  });
  await chrome.storage.local.remove(STATUSES.map(legacyKey));
  return [topic];
}

async function loadTopicTasks(topic) {
  const keys = STATUSES.map((status) => storageKey(status, topic));
  const stored = await chrome.storage.local.get(keys);
  return Object.fromEntries(STATUSES.map((status, i) => [status, stored[keys[i]] ?? []]));
}

const topicBar = document.getElementById('topic-bar');
const topicName = document.getElementById('topic-name');
const topicRename = document.getElementById('topic-rename');
const switchTopicButton = document.getElementById('switch-topic');
const topicMenu = document.getElementById('topic-menu');
const newTopicButton = document.getElementById('new-topic');
const newTopicForm = document.getElementById('new-topic-form');
const newTopicName = document.getElementById('new-topic-name');
const deleteTopicButton = document.getElementById('delete-topic');
const deleteTopicDialog = document.getElementById('delete-topic-dialog');

const topicById = (id) => topics.find((topic) => topic.id === id);

// Topic names are unique, ignoring case. `except` is the topic being renamed.
const isNameTaken = (name, except) =>
  topics.some((topic) => topic.id !== except && topic.name.toLowerCase() === name.toLowerCase());

function renderTopics() {
  topicName.textContent = topicById(currentTopic)?.name ?? '';
  const single = topics.length < 2;
  switchTopicButton.disabled = single;
  switchTopicButton.title = single ? 'No other topics yet' : 'Switch to another topic';
  deleteTopicButton.disabled = single;
  deleteTopicButton.title = single ? 'The only topic can’t be deleted' : 'Delete this topic and its tasks';

  topicMenu.replaceChildren(
    ...topics.map(({ id, name }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.role = 'menuitemradio';
      item.textContent = name;
      item.setAttribute('aria-checked', String(id === currentTopic));
      item.addEventListener('click', () => {
        topicMenu.hidePopover();
        if (id !== currentTopic) switchTopic(id);
      });
      return item;
    }),
  );
}

async function switchTopic(id) {
  if (!topicRename.hidden) editTopicName(false); // drop an unsaved rename of the old topic
  currentTopic = id;
  renderTopics();
  chrome.storage.local.set({ activeTopic: id });
  const tasks = await loadTopicTasks(id);
  if (currentTopic !== id) return; // switched again while loading
  for (const panel of panels) {
    panel.replaceChildren(); // don't carry a half-typed task over to the other topic
    renderTable(panel, tasks[statusOf(panel)]);
  }
}

async function createTopic(name) {
  const { topics: stored } = await chrome.storage.local.get({ topics: [] });
  const topic = { id: crypto.randomUUID(), name };
  await chrome.storage.local.set({ topics: [...stored, topic] });
  await switchTopic(topic.id);
}

async function renameTopic(id, name) {
  const { topics: stored } = await chrome.storage.local.get({ topics: [] });
  await chrome.storage.local.set({ topics: stored.map((topic) => (topic.id === id ? { ...topic, name } : topic)) });
}

// Removes the topic and its tasks. If a panel is showing it, the topics
// listener below moves that panel to a neighbouring topic.
async function deleteTopic(id) {
  const { topics: stored } = await chrome.storage.local.get({ topics: [] });
  const remaining = stored.filter((topic) => topic.id !== id);
  if (remaining.length === 0) return;
  await chrome.storage.local.set({ topics: remaining });
  await chrome.storage.local.remove(STATUSES.map((status) => storageKey(status, id)));
}

// Rename: clicking the topic title turns it into an input. Enter (or clicking
// away) saves, Escape cancels. An empty or already used name isn't saved.
function editTopicName(editing, { focus = false } = {}) {
  topicName.hidden = editing;
  topicRename.hidden = !editing;
  topicRename.setCustomValidity('');
  if (editing) {
    topicRename.value = topicById(currentTopic).name;
    topicRename.focus();
    topicRename.select();
  } else if (focus) {
    topicName.focus();
  }
}

async function commitTopicName({ focus = false } = {}) {
  if (topicRename.hidden) return; // already saved or cancelled
  const id = currentTopic;
  const name = topicRename.value.trim();
  const changed = name && name !== topicById(id).name;
  if (changed && isNameTaken(name, id) && focus) {
    topicRename.setCustomValidity(`A topic named “${name}” already exists.`);
    topicRename.reportValidity();
    return;
  }
  editTopicName(false, { focus });
  if (changed && !isNameTaken(name, id)) await renameTopic(id, name);
}

topicName.addEventListener('click', () => editTopicName(true));
topicRename.addEventListener('input', () => topicRename.setCustomValidity(''));
topicRename.addEventListener('blur', () => commitTopicName());
topicRename.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    commitTopicName({ focus: true });
  } else if (event.key === 'Escape') {
    editTopicName(false, { focus: true });
  }
});

// Switch: a menu of topics under the Switch button (a popover, so clicking
// outside or pressing Escape closes it). Arrow keys move between topics.
topicMenu.addEventListener('toggle', (event) => {
  if (event.newState !== 'open') return;
  const button = switchTopicButton.getBoundingClientRect();
  topicMenu.style.top = `${button.bottom + 4}px`;
  topicMenu.style.left = `${Math.max(8, button.right - topicMenu.offsetWidth)}px`;
  topicMenu.querySelector('[aria-checked="true"]')?.focus();
});

topicMenu.addEventListener('keydown', (event) => {
  const items = [...topicMenu.children];
  const index = items.indexOf(document.activeElement);
  const next = {
    ArrowDown: items[(index + 1) % items.length],
    ArrowUp: items[(index - 1 + items.length) % items.length],
    Home: items[0],
    End: items.at(-1),
  }[event.key];
  if (next) {
    event.preventDefault();
    next.focus();
  }
});

// New: swaps the topic bar for a name input. Enter creates, Escape cancels.
function showNewTopicForm(show) {
  topicBar.hidden = show;
  newTopicForm.hidden = !show;
  newTopicName.value = '';
  newTopicName.setCustomValidity('');
  (show ? newTopicName : newTopicButton).focus();
}

newTopicButton.addEventListener('click', () => showNewTopicForm(true));
document.getElementById('cancel-new-topic').addEventListener('click', () => showNewTopicForm(false));
newTopicForm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') showNewTopicForm(false);
});
newTopicName.addEventListener('input', () => newTopicName.setCustomValidity(''));

newTopicForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = newTopicName.value.trim();
  if (!name) {
    newTopicName.focus();
    return;
  }
  if (isNameTaken(name)) {
    newTopicName.setCustomValidity(`A topic named “${name}” already exists.`);
    newTopicName.reportValidity();
    return;
  }
  showNewTopicForm(false);
  await createTopic(name);
});

// Delete: asks first, saying how many tasks go with the topic.
deleteTopicButton.addEventListener('click', async () => {
  const topic = topicById(currentTopic);
  const count = Object.values(await loadTopicTasks(topic.id)).reduce((sum, tasks) => sum + tasks.length, 0);
  document.getElementById('delete-topic-message').textContent =
    count === 0
      ? `Delete the topic “${topic.name}”?`
      : `Delete the topic “${topic.name}” and its ${count} task${count === 1 ? '' : 's'}?`;
  deleteTopicDialog.returnValue = '';
  deleteTopicDialog.dataset.topic = topic.id;
  deleteTopicDialog.showModal();
});

deleteTopicDialog.addEventListener('close', () => {
  if (deleteTopicDialog.returnValue === 'delete') deleteTopic(deleteTopicDialog.dataset.topic);
});

// Keep the topic list in step with other windows, and leave a topic that was deleted.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.topics) return;
  const oldTopics = changes.topics.oldValue ?? [];
  topics = changes.topics.newValue ?? [];
  renderTopics();
  if (topics.length && !topics.some(({ id }) => id === currentTopic)) {
    const index = oldTopics.findIndex(({ id }) => id === currentTopic);
    switchTopic(topics[Math.min(Math.max(index, 0), topics.length - 1)].id);
  }
});

topics = await loadTopics();
const { activeTopic } = await chrome.storage.local.get('activeTopic');
currentTopic = topics.some(({ id }) => id === activeTopic) ? activeTopic : topics[0].id;
renderTopics();

for (const panel of panels) {
  renderTable(panel, await loadTasks(statusOf(panel)));
}

// Re-render a table when its tasks change, whether from this panel or one in another window.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const panel of panels) {
    const change = changes[storageKey(statusOf(panel))];
    if (change) renderTable(panel, change.newValue ?? []);
  }
});

// Tabs: In Progress / Complete / Abandoned. The last selected tab is remembered.
const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab, { focus = false } = {}) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
  chrome.storage.local.set({ activeTab: tab.id });
}

// Dragging a row onto another tab's name: drop there to move the task to the
// end of that tab, or hover a moment to open the tab and drop at a position.
const statusOfTab = (tab) => tab.getAttribute('aria-controls').replace(/^panel-/, '');
const TAB_HOVER_OPEN_MS = 500;

for (const tab of tabs) {
  let hoverTimer;
  const isDropTarget = () => dragged && dragged.status !== statusOfTab(tab);

  tab.addEventListener('dragenter', () => {
    if (!isDropTarget()) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => selectTab(tab), TAB_HOVER_OPEN_MS);
  });
  tab.addEventListener('dragover', (event) => {
    if (!isDropTarget()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    tab.classList.add('drop-target');
  });
  tab.addEventListener('dragleave', () => {
    clearTimeout(hoverTimer);
    tab.classList.remove('drop-target');
  });
  tab.addEventListener('drop', (event) => {
    clearTimeout(hoverTimer);
    tab.classList.remove('drop-target');
    if (!isDropTarget()) return;
    event.preventDefault();
    moveTask(dragged.status, dragged.id, statusOfTab(tab));
    dragged = null;
  });
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(tab);
    const next = {
      ArrowRight: tabs[(index + 1) % tabs.length],
      ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs.at(-1),
    }[event.key];
    if (next) {
      event.preventDefault();
      selectTab(next, { focus: true });
    }
  });
}

const { activeTab } = await chrome.storage.local.get('activeTab');
const savedTab = tabs.find((t) => t.id === activeTab);
if (savedTab) selectTab(savedTab);

// Table density: Cozy (default) or Compact, set on the Options page. Applied
// live when it changes there.
function applyDensity(density) {
  document.documentElement.dataset.density = density;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.density) applyDensity(changes.density.newValue ?? 'cozy');
});

applyDensity((await chrome.storage.sync.get({ density: 'cozy' })).density);

const enabledEl = document.getElementById('enabled');
const statusEl = document.getElementById('status');

const { enabled } = await chrome.storage.sync.get({ enabled: true });
enabledEl.checked = enabled;

enabledEl.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
  statusEl.textContent = 'Saved.';
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

const response = await chrome.runtime.sendMessage({ type: 'PING' });
if (response?.type === 'PONG') {
  statusEl.textContent = 'Background connected.';
}
