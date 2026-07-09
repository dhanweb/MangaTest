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

  if (!closingTab?.closeable) {
    return cache;
  }

  const tabs = cache.tabs.filter((tab) => tab.id !== tabId);
  const fallback = tabs[Math.max(0, closingIndex - 1)] ?? tabs[0];

  return {
    ...cache,
    activeTabId: cache.activeTabId === tabId ? fallback.id : cache.activeTabId,
    tabs: tabs.map((tab) => (tab.id === fallback.id ? { ...tab, lastActiveAt: now } : tab)),
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

  const pinned = cache.tabs.filter((tab) => !tab.closeable || tab.id === cache.activeTabId);
  const closeable = cache.tabs
    .filter((tab) => tab.closeable && tab.id !== cache.activeTabId)
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  const keepIds = new Set([...pinned, ...closeable].slice(0, MAX_ADMIN_TABS).map((tab) => tab.id));

  return {
    ...cache,
    tabs: cache.tabs.filter((tab) => keepIds.has(tab.id)),
  };
}
