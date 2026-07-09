import { describe, expect, it } from "vitest";

import { DEFAULT_ADMIN_TAB_ID, type AdminTabCache } from "./admin-tab-types";
import { activateAdminTab, closeAdminTab, createInitialAdminTabCache, openAdminTab } from "./admin-tab-state";

describe("admin tab state", () => {
  it("starts with a non-closeable dashboard tab", () => {
    const cache = createInitialAdminTabCache(100);

    expect(cache.activeTabId).toBe(DEFAULT_ADMIN_TAB_ID);
    expect(cache.tabs).toHaveLength(1);
    expect(cache.tabs[0]).toMatchObject({ id: DEFAULT_ADMIN_TAB_ID, title: "后台首页", closeable: false });
  });

  it("opens a new path tab and reuses it on repeated open", () => {
    const first = openAdminTab(createInitialAdminTabCache(100), "/admin/comics", undefined, 200);
    const second = openAdminTab(first, "/admin/comics", undefined, 300);

    expect(second.activeTabId).toBe("/admin/comics");
    expect(second.tabs.map((tab) => tab.id)).toEqual(["/admin", "/admin/comics"]);
    expect(second.tabs.find((tab) => tab.id === "/admin/comics")?.lastActiveAt).toBe(300);
  });

  it("activates an existing tab", () => {
    const cache = openAdminTab(createInitialAdminTabCache(100), "/admin/tags", undefined, 200);
    const activated = activateAdminTab(cache, "/admin", 300);

    expect(activated.activeTabId).toBe("/admin");
    expect(activated.tabs.find((tab) => tab.id === "/admin")?.lastActiveAt).toBe(300);
  });

  it("closes active tab and activates the nearest tab to the left", () => {
    const cache = ["/admin/paths", "/admin/comics", "/admin/tags"].reduce(
      (current, href, index) => openAdminTab(current, href, undefined, 200 + index),
      createInitialAdminTabCache(100),
    );
    const closed = closeAdminTab(cache, "/admin/tags", 400);

    expect(closed.activeTabId).toBe("/admin/comics");
    expect(closed.tabs.map((tab) => tab.id)).toEqual(["/admin", "/admin/paths", "/admin/comics"]);
  });

  it("does not close the dashboard tab", () => {
    const cache = openAdminTab(createInitialAdminTabCache(100), "/admin/files", undefined, 200);
    const closed = closeAdminTab(cache, "/admin", 300);

    expect(closed.tabs.some((tab) => tab.id === "/admin")).toBe(true);
    expect(closed.activeTabId).toBe("/admin/files");
  });

  it("prunes least recently used closeable tabs when over limit", () => {
    let cache: AdminTabCache = createInitialAdminTabCache(100);

    for (let index = 0; index < 14; index += 1) {
      cache = openAdminTab(cache, `/admin/comics/${index}`, `漫画 ${index}`, 200 + index);
    }

    expect(cache.tabs).toHaveLength(12);
    expect(cache.tabs.some((tab) => tab.id === "/admin")).toBe(true);
    expect(cache.tabs.some((tab) => tab.id === "/admin/comics/0")).toBe(false);
    expect(cache.activeTabId).toBe("/admin/comics/13");
  });
});
