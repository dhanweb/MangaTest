import { getAdminTabInfo, normalizeAdminTabPath } from "./admin-tab-registry";
import {
  ADMIN_TAB_CACHE_VERSION,
  DEFAULT_ADMIN_TAB_ID,
  MAX_ADMIN_TABS,
  type AdminTab,
  type AdminTabCache,
} from "./admin-tab-types";

export function createInitialAdminTabCache(now = Date.now()): AdminTabCache {
  const info = getAdminTabInfo(DEFAULT_ADMIN_TAB_ID);

  return {
    version: ADMIN_TAB_CACHE_VERSION,
    activeTabId: DEFAULT_ADMIN_TAB_ID,
    tabs: [
      {
        id: DEFAULT_ADMIN_TAB_ID,
        href: DEFAULT_ADMIN_TAB_ID,
        title: info.title,
        kind: info.kind,
        closeable: info.closeable,
        createdAt: now,
        lastActiveAt: now,
      },
    ],
  };
}

export function openAdminTab(cache: AdminTabCache, href: string, title?: string, now = Date.now()): AdminTabCache {
  const id = normalizeAdminTabPath(href);
  const existing = cache.tabs.find((tab) => tab.id === id);

  if (existing) {
    return pruneTabs({
      ...cache,
      activeTabId: id,
      tabs: cache.tabs.map((tab) => (tab.id === id ? { ...tab, title: title ?? tab.title, lastActiveAt: now } : tab)),
    });
  }

  const info = getAdminTabInfo(id);
  const nextTab: AdminTab = {
    id,
    href: id,
    title: title ?? info.title,
    kind: info.kind,
    closeable: info.closeable,
    createdAt: now,
    lastActiveAt: now,
  };

  return pruneTabs({
    ...cache,
    activeTabId: id,
    tabs: [...cache.tabs, nextTab],
  });
}

export function activateAdminTab(cache: AdminTabCache, tabId: string, now = Date.now()): AdminTabCache {
  if (!cache.tabs.some((tab) => tab.id === tabId)) {
    return cache;
  }

  return {
    ...cache,
    activeTabId: tabId,
    tabs: cache.tabs.map((tab) => (tab.id === tabId ? { ...tab, lastActiveAt: now } : tab)),
  };
}

export function closeAdminTab(cache: AdminTabCache, tabId: string, now = Date.now()): AdminTabCache {
  const closingIndex = cache.tabs.findIndex((tab) => tab.id === tabId);
  const closingTab = cache.tabs[closingIndex];

  if (!closingTab) {
    return cache;
  }

  // 只剩后台首页时不能关；其它页签即使只剩一个也可以关，并回退到首页
  if (cache.tabs.length <= 1) {
    return closingTab.id === DEFAULT_ADMIN_TAB_ID ? cache : createInitialAdminTabCache(now);
  }

  // 后台首页在仍有其它页签时可关；不可关闭页签除外
  if (!closingTab.closeable && closingTab.id !== DEFAULT_ADMIN_TAB_ID) {
    return cache;
  }

  if (closingTab.id === DEFAULT_ADMIN_TAB_ID && cache.tabs.every((tab) => tab.id === DEFAULT_ADMIN_TAB_ID)) {
    return cache;
  }

  const tabs = cache.tabs.filter((tab) => tab.id !== tabId);
  // 若关掉后没有任何页签（理论上不会），回退首页
  if (tabs.length === 0) {
    return createInitialAdminTabCache(now);
  }

  const fallback = tabs[Math.max(0, closingIndex - 1)] ?? tabs[0];

  return {
    ...cache,
    activeTabId: cache.activeTabId === tabId ? fallback.id : cache.activeTabId,
    tabs: tabs.map((tab) => (tab.id === fallback.id ? { ...tab, lastActiveAt: now } : tab)),
  };
}

/** 关闭全部页签并回到后台首页。 */
export function closeAllTabs(_cache: AdminTabCache, now = Date.now()): AdminTabCache {
  return createInitialAdminTabCache(now);
}

export function closeOtherTabs(cache: AdminTabCache, tabId: string, now = Date.now()): AdminTabCache {
  const tab = cache.tabs.find((t) => t.id === tabId);
  if (!tab) {
    return cache;
  }

  // 只保留目标页签 + 不可关闭页签（首页与其它页签一视同仁，可被关掉）
  const tabs = cache.tabs.filter((t) => t.id === tabId || !t.closeable);
  if (!tabs.some((t) => t.id === tabId)) {
    return cache;
  }

  return {
    ...cache,
    activeTabId: tabId,
    tabs: tabs.map((t) => (t.id === tabId ? { ...t, lastActiveAt: now } : t)),
  };
}

export function closeTabsToRight(cache: AdminTabCache, tabId: string, now = Date.now()): AdminTabCache {
  const idx = cache.tabs.findIndex((t) => t.id === tabId);
  if (idx < 0) {
    return cache;
  }

  // 右侧可关闭页签全部关掉（含后台首页）；不可关闭页签保留
  const tabs = cache.tabs.filter((t, i) => i <= idx || !t.closeable);
  const activeStillOpen = tabs.some((t) => t.id === cache.activeTabId);
  // 若当前激活页签被关掉，回落到右键所在页签
  const activeTabId = activeStillOpen ? cache.activeTabId : tabId;

  return {
    ...cache,
    activeTabId,
    tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, lastActiveAt: now } : t)),
  };
}

export function renameAdminTab(cache: AdminTabCache, tabId: string, title: string): AdminTabCache {
  const trimmed = title.trim();

  if (!trimmed) {
    return cache;
  }

  return {
    ...cache,
    tabs: cache.tabs.map((tab) => (tab.id === tabId ? { ...tab, title: trimmed } : tab)),
  };
}

function pruneTabs(cache: AdminTabCache): AdminTabCache {
  if (cache.tabs.length <= MAX_ADMIN_TABS) {
    return cache;
  }

  const pinned = cache.tabs.filter((tab) => tab.id === cache.activeTabId);
  const closeable = cache.tabs
    .filter((tab) => tab.id !== cache.activeTabId)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const keepIds = new Set([...pinned, ...closeable].slice(0, MAX_ADMIN_TABS).map((tab) => tab.id));

  return {
    ...cache,
    tabs: cache.tabs.filter((tab) => keepIds.has(tab.id)),
  };
}
