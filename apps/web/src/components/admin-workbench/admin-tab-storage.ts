import {
  ADMIN_TAB_CACHE_VERSION,
  ADMIN_TABS_STORAGE_KEY,
  DEFAULT_ADMIN_TAB_ID,
  type AdminTab,
  type AdminTabCache,
  type StorageLike,
} from "./admin-tab-types";

export function loadAdminTabCache(storage: StorageLike): AdminTabCache | null {
  let raw: string | null;

  try {
    raw = storage.getItem(ADMIN_TABS_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isAdminTabCache(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    try {
      storage.removeItem(ADMIN_TABS_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
    return null;
  }
}

export function saveAdminTabCache(storage: StorageLike, cache: AdminTabCache) {
  try {
    storage.setItem(ADMIN_TABS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota or browser storage failures; tabs still work in memory.
  }
}

function isAdminTabCache(value: unknown): value is AdminTabCache {
  if (!value || typeof value !== "object") {
    return false;
  }

  const cache = value as Partial<AdminTabCache>;

  return (
    cache.version === ADMIN_TAB_CACHE_VERSION &&
    typeof cache.activeTabId === "string" &&
    Array.isArray(cache.tabs) &&
    cache.tabs.length > 0 &&
    cache.tabs.some((tab) => isAdminTab(tab) && tab.id === DEFAULT_ADMIN_TAB_ID) &&
    cache.tabs.every(isAdminTab) &&
    cache.tabs.some((tab) => tab.id === cache.activeTabId)
  );
}

function isAdminTab(value: unknown): value is AdminTab {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tab = value as Partial<AdminTab>;

  return (
    typeof tab.id === "string" &&
    tab.id.startsWith("/admin") &&
    typeof tab.href === "string" &&
    tab.href.startsWith("/admin") &&
    typeof tab.title === "string" &&
    typeof tab.closeable === "boolean" &&
    typeof tab.createdAt === "number" &&
    typeof tab.lastActiveAt === "number" &&
    (tab.kind === "dashboard" || tab.kind === "list" || tab.kind === "detail" || tab.kind === "settings")
  );
}
