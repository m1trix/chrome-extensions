// A stand-in for the parts of the `chrome` extension API the popup uses, so its
// page can run in a plain browser tab. It keeps one window of tabs and tab
// groups in memory, starting from `seed`:
//
//   { groups: [{ id, title, color }], tabs: [{ url, title, groupId, pinned, active }],
//     local: {…}, session: {…} }
//
// Tabs are listed in tab-strip order; ids are given out from 1. Like the
// browser, pinned tabs stay at the start and emptied groups go away.
// `window.fakeBrowser.snapshot()` returns the tabs and groups, for assertions.
//
// Runs in the page (via page.addInitScript), so it must be self-contained.
export function installFakeChrome(seed) {
  const WINDOW_ID = 1;
  const NONE = -1;
  const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  const event = () => {
    const list = [];
    return {
      list,
      addListener: (listener) => list.push(listener),
      removeListener: (listener) => list.splice(list.indexOf(listener), 1),
    };
  };

  // ---- Storage ----

  const storageChanged = event();

  function storageArea(areaName, initial) {
    const data = structuredClone(initial);
    const notify = (changes) => {
      for (const listener of [...storageChanged.list]) listener(structuredClone(changes), areaName);
    };
    return {
      async get(keys) {
        if (keys == null) return structuredClone(data);
        const defaults =
          typeof keys === 'string' ? { [keys]: undefined }
          : Array.isArray(keys) ? Object.fromEntries(keys.map((key) => [key, undefined]))
          : keys;
        const result = {};
        for (const [key, fallback] of Object.entries(defaults)) {
          const value = key in data ? data[key] : fallback;
          if (value !== undefined) result[key] = structuredClone(value);
        }
        return result;
      },
      async set(items) {
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
          data[key] = structuredClone(value);
        }
        notify(changes);
      },
      async remove(keys) {
        const changes = {};
        for (const key of [keys].flat()) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        if (Object.keys(changes).length) notify(changes);
      },
    };
  }

  // ---- Tabs and groups ----

  let nextTabId = 1;
  let nextGroupId = 100;
  const groups = (seed.groups ?? []).map((g) => ({ windowId: WINDOW_ID, color: 'grey', title: '', collapsed: false, ...g }));
  // In tab-strip order; each tab's index is its position here.
  const tabs = (seed.tabs ?? []).map((t) => ({
    windowId: WINDOW_ID,
    groupId: NONE,
    pinned: false,
    active: false,
    ...t,
    id: nextTabId++,
  }));
  if (!tabs.some((t) => t.active) && tabs.length) tabs[0].active = true;

  const view = (t) => ({ ...t, index: tabs.indexOf(t) });
  const findTab = (id) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) throw new Error(`No tab with id: ${id}.`);
    return tab;
  };
  const findGroup = (id) => {
    const group = groups.find((g) => g.id === id);
    if (!group) throw new Error(`No group with id: ${id}.`);
    return group;
  };
  const pinnedCount = () => tabs.filter((t) => t.pinned).length;
  const place = (tab, index) => {
    tabs.splice(tabs.indexOf(tab), 1);
    tabs.splice(Math.max(0, Math.min(index, tabs.length)), 0, tab);
  };
  const lastIndexOf = (groupId) => tabs.findLastIndex((t) => t.groupId === groupId);
  const dropEmptyGroups = () => {
    for (const g of [...groups]) if (!tabs.some((t) => t.groupId === g.id)) groups.splice(groups.indexOf(g), 1);
  };

  const tabsApi = {
    async query({ windowId, groupId, pinned } = {}) {
      return tabs
        .filter((t) => (windowId == null || t.windowId === windowId)
          && (groupId == null || t.groupId === groupId)
          && (pinned == null || t.pinned === pinned))
        .map(view);
    },
    async get(id) {
      return view(findTab(id));
    },
    async create({ url = 'chrome://newtab/', active = true, pinned = false } = {}) {
      const tab = { id: nextTabId++, windowId: WINDOW_ID, groupId: NONE, pinned, active, url, title: url };
      if (active) for (const t of tabs) t.active = false;
      tabs.splice(pinned ? pinnedCount() : tabs.length, 0, tab);
      return view(tab);
    },
    async update(id, { active, pinned }) {
      const tab = findTab(id);
      if (active) for (const t of tabs) t.active = t === tab;
      if (pinned != null && pinned !== tab.pinned) {
        if (pinned) {
          tab.groupId = NONE;
          place(tab, pinnedCount());
          tab.pinned = true;
          dropEmptyGroups();
        } else {
          tab.pinned = false;
          place(tab, pinnedCount());
        }
      }
      return view(tab);
    },
    async move(id, { index }) {
      const tab = findTab(id);
      place(tab, index === -1 ? tabs.length : index);
      return view(tab);
    },
    async remove(ids) {
      for (const id of [ids].flat()) tabs.splice(tabs.indexOf(findTab(id)), 1);
      dropEmptyGroups();
    },
    // New groups start where their first tab is; tabs joining a group go to its end.
    async group({ tabIds, groupId }) {
      const moving = [tabIds].flat().map(findTab).sort((a, b) => tabs.indexOf(a) - tabs.indexOf(b));
      if (moving.some((t) => t.pinned)) throw new Error('Cannot group pinned tabs.');
      let group;
      if (groupId == null) {
        group = { id: nextGroupId++, windowId: WINDOW_ID, title: '', color: COLORS[groups.length % COLORS.length], collapsed: false };
        groups.push(group);
        const at = tabs.indexOf(moving[0]);
        for (const t of moving) tabs.splice(tabs.indexOf(t), 1);
        tabs.splice(Math.min(at, tabs.length), 0, ...moving);
      } else {
        group = findGroup(groupId);
        for (const t of moving) {
          if (t.groupId === group.id) continue;
          tabs.splice(tabs.indexOf(t), 1);
          tabs.splice(lastIndexOf(group.id) + 1, 0, t);
          t.groupId = group.id;
        }
      }
      for (const t of moving) t.groupId = group.id;
      dropEmptyGroups();
      return group.id;
    },
    // Ungrouped tabs move to just after their group.
    async ungroup(ids) {
      for (const tab of [ids].flat().map(findTab)) {
        if (tab.groupId === NONE) continue;
        const end = lastIndexOf(tab.groupId);
        tab.groupId = NONE;
        place(tab, end);
      }
      dropEmptyGroups();
    },
  };
  for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onAttached', 'onDetached', 'onActivated']) {
    tabsApi[name] = event();
  }

  const tabGroupsApi = {
    TAB_GROUP_ID_NONE: NONE,
    async query({ windowId } = {}) {
      return groups.filter((g) => windowId == null || g.windowId === windowId).map((g) => ({ ...g }));
    },
    async get(id) {
      return { ...findGroup(id) };
    },
    async update(id, props) {
      return { ...Object.assign(findGroup(id), props) };
    },
    async move(id, { index }) {
      const own = tabs.filter((t) => t.groupId === id);
      for (const t of own) tabs.splice(tabs.indexOf(t), 1);
      tabs.splice(Math.min(index, tabs.length), 0, ...own);
      return { ...findGroup(id) };
    },
  };
  for (const name of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved']) tabGroupsApi[name] = event();

  window.fakeBrowser = {
    snapshot: () => ({
      tabs: tabs.map((t) => {
        const { id, url, title, groupId, pinned } = view(t);
        return { id, url, title, groupId, pinned };
      }),
      groups: groups.map((g) => ({ ...g })),
    }),
  };

  window.chrome = {
    storage: {
      local: storageArea('local', seed.local ?? {}),
      session: storageArea('session', seed.session ?? {}),
      onChanged: storageChanged,
    },
    windows: {
      getCurrent: async () => ({ id: WINDOW_ID }),
    },
    tabs: tabsApi,
    tabGroups: tabGroupsApi,
    // The page is the toolbar popup, not the side panel.
    extension: {
      getViews: ({ type } = {}) => (type === 'popup' ? [window] : []),
    },
    runtime: {
      getURL: (path) => new URL(`/${path}`, location.origin).href,
    },
    action: {
      setPopup: async () => {},
    },
    sidePanel: {
      open: async () => {},
      setPanelBehavior: async () => {},
    },
    downloads: {
      download: async () => 1,
    },
  };
}
