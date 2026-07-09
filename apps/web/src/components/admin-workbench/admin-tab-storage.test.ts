import { describe, expect, it } from "vitest";

import { ADMIN_TABS_STORAGE_KEY, type StorageLike } from "./admin-tab-types";
import { createInitialAdminTabCache, openAdminTab } from "./admin-tab-state";
import { loadAdminTabCache, saveAdminTabCache } from "./admin-tab-storage";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("admin tab storage", () => {
  it("round trips valid cache", () => {
    const storage = new MemoryStorage();
    const cache = openAdminTab(createInitialAdminTabCache(100), "/admin/comics", undefined, 200);

    saveAdminTabCache(storage, cache);

    expect(loadAdminTabCache(storage)).toEqual(cache);
  });

  it("returns null for invalid json and removes the bad value", () => {
    const storage = new MemoryStorage();
    storage.setItem(ADMIN_TABS_STORAGE_KEY, "{bad");

    expect(loadAdminTabCache(storage)).toBeNull();
    expect(storage.getItem(ADMIN_TABS_STORAGE_KEY)).toBeNull();
  });

  it("rejects wrong cache version", () => {
    const storage = new MemoryStorage();
    storage.setItem(ADMIN_TABS_STORAGE_KEY, JSON.stringify({ version: 0, activeTabId: "/admin", tabs: [] }));

    expect(loadAdminTabCache(storage)).toBeNull();
  });
});
