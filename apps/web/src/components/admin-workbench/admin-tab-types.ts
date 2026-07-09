export const ADMIN_TABS_STORAGE_KEY = "mangatest.admin.tabs.v1";
export const ADMIN_TAB_STATE_PREFIX = "mangatest.admin.tabState.v1";
export const ADMIN_TAB_CACHE_VERSION = 1;
export const DEFAULT_ADMIN_TAB_ID = "/admin";
export const MAX_ADMIN_TABS = 12;

export type AdminTabKind = "dashboard" | "list" | "detail" | "settings";

export interface AdminTab {
  id: string;
  href: string;
  title: string;
  kind: AdminTabKind;
  closeable: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface AdminTabCache {
  version: typeof ADMIN_TAB_CACHE_VERSION;
  activeTabId: string;
  tabs: AdminTab[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
