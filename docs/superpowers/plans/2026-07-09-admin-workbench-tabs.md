# Admin Workbench Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin area open from the public site in a browser tab, then provide browser-like in-app tabs inside `/admin` with cached tab metadata and retained page state during tab switching.

**Architecture:** Keep the feature inside `apps/web` as an Admin UI orchestration concern. `AdminShell` becomes the workbench host: it owns the side navigation, the tab strip, route interception, tab persistence, and a cached outlet that keeps visited admin route trees mounted while switching between app tabs. Business rules stay in modules and existing admin pages continue to load data through their current services/APIs.

**Tech Stack:** Next.js App Router, TypeScript, Mantine components, lucide-react icons, Vitest for pure tab model tests, browser smoke verification with Playwright/Chrome.

## Global Constraints

- `docs/plan.md` remains the source of truth; this plan is scoped to the current `apps/web` stabilization phase.
- Implement this in `apps/web`; `apps/prototype` is reference only and should not receive functional work unless visual comparison requires it.
- Use Mantine-first UI for the admin workbench tab strip and controls.
- Do not move business rules into route handlers or UI components.
- Do not add production dependencies for this unless a Mantine/React/Next built-in path is insufficient after a failed spike.
- Do not cache secret values such as OpenList passwords, tokens, cookies, magnet links, or private URLs in localStorage.
- Keep admin tab state local to the browser. No database schema changes are required.

---

## File Structure

- Modify `docs/plan.md`
  - Records that admin workbench tabs are part of the current stabilization scope.
- Create `apps/web/src/components/admin-workbench/admin-tab-types.ts`
  - Defines `AdminTab`, `AdminTabCache`, tab constants, and storage key names.
- Create `apps/web/src/components/admin-workbench/admin-tab-registry.ts`
  - Maps known admin path patterns to titles and icons.
  - Produces fallback titles for dynamic routes such as `/admin/comics/:id`.
- Create `apps/web/src/components/admin-workbench/admin-tab-storage.ts`
  - Safe localStorage load/save helpers with versioning and validation.
- Create `apps/web/src/components/admin-workbench/admin-tab-state.ts`
  - Pure reducers/helpers for opening, activating, closing, moving, and pruning tabs.
- Create `apps/web/src/components/admin-workbench/admin-tab-provider.tsx`
  - React context around tab state, router integration, and persistence.
- Create `apps/web/src/components/admin-workbench/admin-tab-strip.tsx`
  - Mantine-based horizontal tab strip with close, refresh, and overflow behavior.
- Create `apps/web/src/components/admin-workbench/admin-cached-outlet.tsx`
  - Keeps visited admin route `children` mounted by tab id and hides inactive panes.
- Create `apps/web/src/components/admin-workbench/admin-navigation-interceptor.tsx`
  - Captures normal left-clicks on `/admin` anchors inside the admin shell and opens/activates an app tab.
- Create `apps/web/src/components/admin-workbench/use-admin-tab-title.ts`
  - Lets dynamic pages refine the current tab title after route data loads.
- Create `apps/web/src/components/admin-workbench/use-admin-tab-state.ts`
  - Small typed hook for per-tab persisted UI state, excluding secrets.
- Modify `apps/web/src/components/admin-shell.tsx`
  - Wraps admin layout with the provider, side nav, tab strip, navigation interceptor, and cached outlet.
- Modify `apps/web/src/components/site-header.tsx`
  - The public "管理" entry opens `/admin` in a browser new tab.
- Modify public admin entry links:
  - `apps/web/src/app/(site)/library-home.tsx`
  - `apps/web/src/components/comic-detail-view.tsx`
  - Any other non-admin link found by `rg -n 'href="/admin|href=\\{`/admin' apps/web/src`.
- Modify selected admin client panels:
  - `apps/web/src/app/admin/comics/comics-panel.tsx`
  - `apps/web/src/app/admin/paths/paths-panel.tsx`
  - `apps/web/src/app/admin/files/files-panel.tsx`
  - `apps/web/src/app/admin/tags/tags-panel.tsx`
  - `apps/web/src/app/admin/downloads/downloads-panel.tsx`
  - `apps/web/src/app/admin/settings/page.tsx`
  - `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`
- Create tests:
  - `apps/web/src/components/admin-workbench/admin-tab-state.test.ts`
  - `apps/web/src/components/admin-workbench/admin-tab-storage.test.ts`

## Key Decisions

1. Browser tab behavior:
   - Public site entries to `/admin` use `target="_blank"` and `rel="noreferrer"`.
   - Links already inside `/admin` stay in the same browser tab and create/activate app tabs instead.

2. App tab identity:
   - The default tab id is the full path plus query string, for example `/admin/comics?page=2`.
   - Same tab id is reused instead of creating duplicates. This matches common admin systems and avoids many identical tabs.
   - If duplicate tabs are desired later, add `tabInstanceId` as an optional suffix; do not build it in MVP.

3. Cached outlet behavior:
   - `AdminShell` stores each visited route's `children` React tree by tab id and renders inactive panes with `display: none`.
   - Closing a tab removes its cached tree and frees local UI state for that tab.
   - Refreshing a tab calls `router.refresh()` for the active tab and replaces its cached node on the next render.

4. Persistent cache:
   - `localStorage` key `mangatest.admin.tabs.v1` stores tab metadata and active tab id.
   - Per-tab UI state uses `mangatest.admin.tabState.v1:${encodeURIComponent(tabId)}:${stateKey}`.
   - Never persist secrets, passwords, upload `File` objects, or modal open state.

5. Route interception:
   - Capture normal left-clicks on anchors under the admin shell.
   - Respect browser conventions: do not intercept middle click, Ctrl/Cmd click, Shift click, `target="_blank"`, external origins, hash-only links, downloads, or non-`/admin` links.
   - Programmatic navigation can use context helper `openAdminTab(href)`, but the capture layer covers existing `Link` and `AppButton component={Link}` usage.

## Task 1: Tab Model And Storage

**Files:**
- Create: `apps/web/src/components/admin-workbench/admin-tab-types.ts`
- Create: `apps/web/src/components/admin-workbench/admin-tab-registry.ts`
- Create: `apps/web/src/components/admin-workbench/admin-tab-state.ts`
- Create: `apps/web/src/components/admin-workbench/admin-tab-storage.ts`
- Test: `apps/web/src/components/admin-workbench/admin-tab-state.test.ts`
- Test: `apps/web/src/components/admin-workbench/admin-tab-storage.test.ts`

**Interfaces:**
- Produces:
  - `type AdminTab`
  - `type AdminTabCache`
  - `ADMIN_TABS_STORAGE_KEY`
  - `getAdminTabInfo(path: string): { title: string; closeable: boolean }`
  - `normalizeAdminTabPath(path: string): string`
  - `openAdminTab(cache: AdminTabCache, href: string, title?: string): AdminTabCache`
  - `activateAdminTab(cache: AdminTabCache, tabId: string): AdminTabCache`
  - `closeAdminTab(cache: AdminTabCache, tabId: string): AdminTabCache`
  - `loadAdminTabCache(storage: StorageLike): AdminTabCache | null`
  - `saveAdminTabCache(storage: StorageLike, cache: AdminTabCache): void`

- [ ] **Step 1: Create the types file**

Create `apps/web/src/components/admin-workbench/admin-tab-types.ts`:

```ts
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
```

- [ ] **Step 2: Create route title registry**

Create `apps/web/src/components/admin-workbench/admin-tab-registry.ts`:

```ts
import { DEFAULT_ADMIN_TAB_ID, type AdminTabKind } from "./admin-tab-types";

interface AdminTabInfo {
  title: string;
  kind: AdminTabKind;
  closeable: boolean;
}

const EXACT_TITLES: Record<string, AdminTabInfo> = {
  "/admin": { title: "后台首页", kind: "dashboard", closeable: false },
  "/admin/paths": { title: "漫画路径", kind: "list", closeable: true },
  "/admin/comics": { title: "漫画管理", kind: "list", closeable: true },
  "/admin/files": { title: "文件维护", kind: "list", closeable: true },
  "/admin/tags": { title: "标签管理", kind: "list", closeable: true },
  "/admin/collections": { title: "收藏夹", kind: "list", closeable: true },
  "/admin/downloads": { title: "下载任务", kind: "list", closeable: true },
  "/admin/settings": { title: "系统设置", kind: "settings", closeable: true },
};

export function normalizeAdminTabPath(path: string) {
  if (!path.startsWith("/admin")) {
    return DEFAULT_ADMIN_TAB_ID;
  }

  const [pathname = DEFAULT_ADMIN_TAB_ID, search = ""] = path.split("?");
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return search ? `${normalizedPathname}?${search}` : normalizedPathname;
}

export function getAdminTabInfo(path: string): AdminTabInfo {
  const [pathname = DEFAULT_ADMIN_TAB_ID] = normalizeAdminTabPath(path).split("?");
  const exact = EXACT_TITLES[pathname];

  if (exact) {
    return exact;
  }

  if (/^\/admin\/comics\/[^/]+$/.test(pathname)) {
    return { title: "漫画详情", kind: "detail", closeable: true };
  }

  return { title: "管理页面", kind: "detail", closeable: true };
}
```

- [ ] **Step 3: Write failing reducer tests**

Create `apps/web/src/components/admin-workbench/admin-tab-state.test.ts`:

```ts
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
```

- [ ] **Step 4: Implement reducer helpers**

Create `apps/web/src/components/admin-workbench/admin-tab-state.ts`:

```ts
import { getAdminTabInfo, normalizeAdminTabPath } from "./admin-tab-registry";
import { ADMIN_TAB_CACHE_VERSION, DEFAULT_ADMIN_TAB_ID, MAX_ADMIN_TABS, type AdminTab, type AdminTabCache } from "./admin-tab-types";

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
```

- [ ] **Step 5: Write storage tests**

Create `apps/web/src/components/admin-workbench/admin-tab-storage.test.ts`:

```ts
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
```

- [ ] **Step 6: Implement storage helpers**

Create `apps/web/src/components/admin-workbench/admin-tab-storage.ts`:

```ts
import { ADMIN_TAB_CACHE_VERSION, ADMIN_TABS_STORAGE_KEY, DEFAULT_ADMIN_TAB_ID, type AdminTab, type AdminTabCache, type StorageLike } from "./admin-tab-types";

export function loadAdminTabCache(storage: StorageLike): AdminTabCache | null {
  const raw = storage.getItem(ADMIN_TABS_STORAGE_KEY);

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
    storage.removeItem(ADMIN_TABS_STORAGE_KEY);
    return null;
  }
}

export function saveAdminTabCache(storage: StorageLike, cache: AdminTabCache) {
  storage.setItem(ADMIN_TABS_STORAGE_KEY, JSON.stringify(cache));
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
    cache.tabs.some((tab) => tab.id === DEFAULT_ADMIN_TAB_ID) &&
    cache.tabs.every(isAdminTab)
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
    typeof tab.lastActiveAt === "number"
  );
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test -w apps/web -- admin-tab
```

Expected: new tab model tests pass.

## Task 2: Admin Workbench Provider, Tab Strip, And Cached Outlet

**Files:**
- Create: `apps/web/src/components/admin-workbench/admin-tab-provider.tsx`
- Create: `apps/web/src/components/admin-workbench/admin-tab-strip.tsx`
- Create: `apps/web/src/components/admin-workbench/admin-cached-outlet.tsx`
- Create: `apps/web/src/components/admin-workbench/admin-navigation-interceptor.tsx`
- Create: `apps/web/src/components/admin-workbench/use-admin-tab-title.ts`
- Modify: `apps/web/src/components/admin-shell.tsx`

**Interfaces:**
- Consumes:
  - Task 1 tab model/storage helpers.
- Produces:
  - `AdminTabProvider`
  - `useAdminTabs`
  - `AdminTabStrip`
  - `AdminCachedOutlet`
  - `AdminNavigationInterceptor`
  - `useAdminTabTitle(title: string)`

- [ ] **Step 1: Create provider**

Create `apps/web/src/components/admin-workbench/admin-tab-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { normalizeAdminTabPath } from "./admin-tab-registry";
import { loadAdminTabCache, saveAdminTabCache } from "./admin-tab-storage";
import { activateAdminTab, closeAdminTab, createInitialAdminTabCache, openAdminTab, renameAdminTab } from "./admin-tab-state";
import type { AdminTab, AdminTabCache } from "./admin-tab-types";

interface AdminTabContextValue {
  activeTabId: string;
  tabs: AdminTab[];
  openTab: (href: string, title?: string) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  refreshActiveTab: () => void;
  setCurrentTabTitle: (title: string) => void;
}

const AdminTabContext = createContext<AdminTabContextValue | null>(null);

export function AdminTabProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeTabId = normalizeAdminTabPath(searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname);
  const [cache, setCache] = useState<AdminTabCache>(() => createInitialAdminTabCache());

  useEffect(() => {
    const loaded = loadAdminTabCache(window.localStorage);
    setCache(loaded ?? createInitialAdminTabCache());
  }, []);

  useEffect(() => {
    setCache((current) => openAdminTab(current, routeTabId));
  }, [routeTabId]);

  useEffect(() => {
    saveAdminTabCache(window.localStorage, cache);
  }, [cache]);

  const openTab = useCallback(
    (href: string, title?: string) => {
      const id = normalizeAdminTabPath(href);
      setCache((current) => openAdminTab(current, id, title));
      router.push(id);
    },
    [router],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      setCache((current) => activateAdminTab(current, tabId));
      router.push(tabId);
    },
    [router],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setCache((current) => {
        const next = closeAdminTab(current, tabId);
        if (current.activeTabId === tabId && next.activeTabId !== tabId) {
          router.push(next.activeTabId);
        }
        return next;
      });
    },
    [router],
  );

  const refreshActiveTab = useCallback(() => {
    router.refresh();
  }, [router]);

  const setCurrentTabTitle = useCallback((title: string) => {
    setCache((current) => renameAdminTab(current, current.activeTabId, title));
  }, []);

  const value = useMemo<AdminTabContextValue>(
    () => ({
      activeTabId: cache.activeTabId,
      tabs: cache.tabs,
      openTab,
      activateTab,
      closeTab,
      refreshActiveTab,
      setCurrentTabTitle,
    }),
    [activateTab, cache.activeTabId, cache.tabs, closeTab, openTab, refreshActiveTab, setCurrentTabTitle],
  );

  return <AdminTabContext.Provider value={value}>{children}</AdminTabContext.Provider>;
}

export function useAdminTabs() {
  const value = useContext(AdminTabContext);
  if (!value) {
    throw new Error("useAdminTabs must be used inside AdminTabProvider");
  }
  return value;
}
```

- [ ] **Step 2: Create tab strip**

Create `apps/web/src/components/admin-workbench/admin-tab-strip.tsx`:

```tsx
"use client";

import { ActionIcon, Box, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import { RefreshCw, X } from "lucide-react";

import { useAdminTabs } from "./admin-tab-provider";

export function AdminTabStrip() {
  const { activeTabId, activateTab, closeTab, refreshActiveTab, tabs } = useAdminTabs();

  return (
    <Box
      style={{
        height: 42,
        borderBottom: "1px solid var(--mantine-color-pink-1)",
        background: "white",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      <ScrollArea type="hover" scrollbarSize={6} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={0} wrap="nowrap" h={42} style={{ minWidth: "max-content" }}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <Box
                key={tab.id}
                component="button"
                type="button"
                onClick={() => activateTab(tab.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 42,
                  maxWidth: 220,
                  minWidth: 112,
                  padding: "0 8px 0 14px",
                  border: 0,
                  borderRight: "1px solid var(--mantine-color-pink-1)",
                  borderBottom: active ? "2px solid var(--mantine-color-pink-5)" : "2px solid transparent",
                  background: active ? "var(--mantine-color-pink-0)" : "white",
                  color: active ? "var(--mantine-color-pink-6)" : "var(--mantine-color-ink-7)",
                  cursor: "pointer",
                  font: "inherit",
                }}
                aria-current={active ? "page" : undefined}
              >
                <Text size="sm" fw={800} truncate style={{ flex: 1, minWidth: 0 }}>
                  {tab.title}
                </Text>
                {tab.closeable ? (
                  <ActionIcon
                    aria-label={`关闭 ${tab.title}`}
                    color="pink"
                    size="xs"
                    variant="subtle"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={13} />
                  </ActionIcon>
                ) : null}
              </Box>
            );
          })}
        </Group>
      </ScrollArea>
      <Tooltip label="刷新当前页签" withArrow>
        <ActionIcon color="pink" variant="subtle" h={42} w={42} radius={0} onClick={refreshActiveTab} aria-label="刷新当前页签">
          <RefreshCw size={16} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
```

- [ ] **Step 3: Create cached outlet**

Create `apps/web/src/components/admin-workbench/admin-cached-outlet.tsx`:

```tsx
"use client";

import { Box } from "@mantine/core";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { normalizeAdminTabPath } from "./admin-tab-registry";
import { useAdminTabs } from "./admin-tab-provider";

interface CachedPane {
  id: string;
  node: ReactNode;
}

export function AdminCachedOutlet({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeTabId = normalizeAdminTabPath(searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname);
  const { activeTabId, tabs } = useAdminTabs();
  const openTabIds = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabs]);
  const [panes, setPanes] = useState<CachedPane[]>([]);

  useEffect(() => {
    setPanes((current) => {
      const withoutClosed = current.filter((pane) => openTabIds.has(pane.id));
      const existing = withoutClosed.find((pane) => pane.id === routeTabId);

      if (existing) {
        return withoutClosed.map((pane) => (pane.id === routeTabId ? { ...pane, node: children } : pane));
      }

      return [...withoutClosed, { id: routeTabId, node: children }];
    });
  }, [children, openTabIds, routeTabId]);

  return (
    <Box style={{ position: "relative", minHeight: "100%" }}>
      {panes.map((pane) => (
        <Box
          key={pane.id}
          data-admin-tab-pane={pane.id}
          style={{
            display: pane.id === activeTabId ? "block" : "none",
            minHeight: "100%",
          }}
        >
          {pane.node}
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Create navigation interceptor**

Create `apps/web/src/components/admin-workbench/admin-navigation-interceptor.tsx`:

```tsx
"use client";

import { type MouseEvent, type ReactNode } from "react";

import { useAdminTabs } from "./admin-tab-provider";

export function AdminNavigationInterceptor({ children }: { children: ReactNode }) {
  const { openTab } = useAdminTabs();

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
      return;
    }

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) {
      return;
    }

    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/admin")) {
      return;
    }

    event.preventDefault();
    openTab(`${url.pathname}${url.search}${url.hash}`, anchor.textContent?.trim() || undefined);
  }

  return <div onClickCapture={handleClick}>{children}</div>;
}
```

- [ ] **Step 5: Create title hook**

Create `apps/web/src/components/admin-workbench/use-admin-tab-title.ts`:

```ts
"use client";

import { useEffect } from "react";

import { useAdminTabs } from "./admin-tab-provider";

export function useAdminTabTitle(title: string) {
  const { setCurrentTabTitle } = useAdminTabs();

  useEffect(() => {
    setCurrentTabTitle(title);
  }, [setCurrentTabTitle, title]);
}
```

- [ ] **Step 6: Modify admin shell**

Modify `apps/web/src/components/admin-shell.tsx`:

```tsx
"use client";

import { Box } from "@mantine/core";
import { Bookmark, CloudDownload, Folder, Gauge, Library, Settings, Tag, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminCachedOutlet } from "@/components/admin-workbench/admin-cached-outlet";
import { AdminNavigationInterceptor } from "@/components/admin-workbench/admin-navigation-interceptor";
import { AdminTabProvider, useAdminTabs } from "@/components/admin-workbench/admin-tab-provider";
import { AdminTabStrip } from "@/components/admin-workbench/admin-tab-strip";
import { SiteHeader } from "@/components/site-header";

const navItems = [
  { href: "/admin", icon: Gauge, label: "后台首页", exact: true },
  { href: "/admin/paths", icon: Folder, label: "漫画路径" },
  { href: "/admin/comics", icon: Library, label: "漫画管理" },
  { href: "/admin/files", icon: Wrench, label: "文件维护" },
  { href: "/admin/tags", icon: Tag, label: "标签管理" },
  { href: "/admin/collections", icon: Bookmark, label: "收藏夹" },
  { href: "/admin/downloads", icon: CloudDownload, label: "下载任务" },
  { href: "/admin/settings", icon: Settings, label: "系统设置" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminTabProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AdminTabProvider>
  );
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { openTab } = useAdminTabs();

  return (
    <>
      <SiteHeader active="admin" />
      <Box style={{ height: "calc(100vh - 60px)", background: "#fff7fb", overflow: "hidden", display: "flex" }}>
        <Box component="nav" style={{ minWidth: 220, background: "white", borderRight: "1px solid #fde0eb", paddingTop: 18, overflowY: "auto", height: "100%", display: "flex", flexDirection: "column" }} aria-label="后台导航">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Box
                key={item.href}
                component={Link}
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  openTab(item.href, item.label);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 52,
                  padding: "0 28px",
                  color: isActive ? "var(--mantine-color-pink-5)" : "#5a3b4e",
                  fontWeight: 800,
                  fontSize: 14,
                  textDecoration: "none",
                  borderLeft: isActive ? "4px solid var(--mantine-color-pink-5)" : "4px solid transparent",
                  background: isActive ? "var(--mantine-color-pink-0)" : "transparent",
                  transition: "background 160ms ease, color 160ms ease, border-color 160ms ease",
                }}
              >
                <item.icon size={18} />
                {item.label}
              </Box>
            );
          })}
        </Box>

        <Box style={{ flex: 1, minWidth: 0, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
          <AdminTabStrip />
          <Box style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px 48px" }}>
            <AdminNavigationInterceptor>
              <AdminCachedOutlet>{children}</AdminCachedOutlet>
            </AdminNavigationInterceptor>
          </Box>
        </Box>
      </Box>
    </>
  );
}
```

- [ ] **Step 7: Run checks**

Run:

```bash
npm run lint -w apps/web
npm run typecheck -w apps/web
```

Expected: both pass. If `AdminCachedOutlet` triggers lint about setting state from effect, move pane storage into `useReducer` with a `syncPane` action dispatched from effect; keep the public behavior unchanged.

## Task 3: Browser New Tab Admin Entry

**Files:**
- Modify: `apps/web/src/components/site-header.tsx`
- Modify: `apps/web/src/app/(site)/library-home.tsx`
- Modify: `apps/web/src/components/comic-detail-view.tsx`
- Search/modify: every non-admin link to `/admin`.

**Interfaces:**
- Consumes:
  - Existing `SiteHeader`, `AppLink`, Mantine button/link wrappers.
- Produces:
  - Public site admin links open in a browser new tab.
  - Admin-internal links stay in the same browser tab and are handled by app tabs.

- [ ] **Step 1: Modify SiteHeader admin nav item**

In `apps/web/src/components/site-header.tsx`, replace the nav item render with target handling:

```tsx
const isAdmin = item.id === "admin";

<Box
  key={item.id}
  component={Link}
  href={item.href}
  target={isAdmin ? "_blank" : undefined}
  rel={isAdmin ? "noreferrer" : undefined}
  style={{
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 9,
    color: "white",
    fontWeight: 800,
    textDecoration: "none",
    background: active === item.id ? "rgba(255,255,255,0.18)" : "transparent",
  }}
>
  <item.icon size={16} />
  {item.label}
</Box>
```

- [ ] **Step 2: Update public admin action links**

Run:

```bash
rg -n "href=(\"/admin|\\{`/admin)" apps/web/src -g "*.tsx"
```

For links outside `apps/web/src/app/admin` and outside `apps/web/src/components/admin-shell.tsx`, add:

```tsx
target="_blank"
rel="noreferrer"
```

Known examples:

```tsx
<AppLink href="/admin/paths" variant="filled" target="_blank" rel="noreferrer">
  配置漫画路径
</AppLink>
```

```tsx
<AppLink href={`/admin/comics/${comic.id}`} variant="outline" target="_blank" rel="noreferrer">
  管理漫画信息
</AppLink>
```

- [ ] **Step 3: Keep admin-internal links unchanged**

Do not add browser `target="_blank"` to links under `apps/web/src/app/admin/**`. Those are handled by `AdminNavigationInterceptor`.

- [ ] **Step 4: Verify via search**

Run:

```bash
rg -n "href=(\"/admin|\\{`/admin)" apps/web/src -g "*.tsx"
```

Expected:
- Public links to `/admin` include `target="_blank"` and `rel="noreferrer"`.
- Admin-internal links do not include `target="_blank"`.

## Task 4: Per-Tab UI State Cache

**Files:**
- Create: `apps/web/src/components/admin-workbench/use-admin-tab-state.ts`
- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`
- Modify: `apps/web/src/app/admin/files/files-panel.tsx`
- Modify: `apps/web/src/app/admin/tags/tags-panel.tsx`
- Modify: `apps/web/src/app/admin/downloads/downloads-panel.tsx`
- Modify: `apps/web/src/app/admin/settings/page.tsx`
- Modify: `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`

**Interfaces:**
- Consumes:
  - `useAdminTabs().activeTabId`
  - `ADMIN_TAB_STATE_PREFIX`
- Produces:
  - `useAdminTabState<T>(stateKey: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void]`

- [ ] **Step 1: Create per-tab state hook**

Create `apps/web/src/components/admin-workbench/use-admin-tab-state.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { useAdminTabs } from "./admin-tab-provider";
import { ADMIN_TAB_STATE_PREFIX } from "./admin-tab-types";

export function useAdminTabState<T>(stateKey: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { activeTabId } = useAdminTabs();
  const storageKey = useMemo(() => `${ADMIN_TAB_STATE_PREFIX}:${encodeURIComponent(activeTabId)}:${stateKey}`, [activeTabId, stateKey]);
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setValue(initialValue);
      return;
    }

    try {
      setValue(JSON.parse(raw) as T);
    } catch {
      window.localStorage.removeItem(storageKey);
      setValue(initialValue);
    }
  }, [initialValue, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [storageKey, value]);

  const reset = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setValue(initialValue);
  }, [initialValue, storageKey]);

  return [value, setValue, reset];
}
```

- [ ] **Step 2: Cache safe list-page state**

Modify panels so safe filter/page state uses `useAdminTabState`:

`apps/web/src/app/admin/comics/comics-panel.tsx`:

```tsx
const [page, setPage] = useAdminTabState("page", 1);
const [pageSize, setPageSize] = useAdminTabState("pageSize", "10");
const [search, setSearch] = useAdminTabState("search", "");
```

`apps/web/src/app/admin/paths/paths-panel.tsx`:

```tsx
const [search, setSearch] = useAdminTabState("search", "");
```

`apps/web/src/app/admin/files/files-panel.tsx`:

```tsx
const [search, setSearch] = useAdminTabState("search", "");
```

`apps/web/src/app/admin/tags/tags-panel.tsx`:

```tsx
const [search, setSearch] = useAdminTabState("search", "");
const [namespaceFilter, setNamespaceFilter] = useAdminTabState<string | null>("namespaceFilter", null);
```

`apps/web/src/app/admin/downloads/downloads-panel.tsx`:

```tsx
const [search, setSearch] = useAdminTabState("search", "");
const [selectedResourceId, setSelectedResourceId] = useAdminTabState<string | null>("selectedResourceId", resources[0]?.id ?? null);
const [provider, setProvider] = useAdminTabState<DownloadProvider>("provider", resources[0]?.defaultProvider ?? "aria2");
const [targetDirectory, setTargetDirectory] = useAdminTabState("targetDirectory", "");
```

- [ ] **Step 3: Cache settings active section only**

Modify `apps/web/src/app/admin/settings/page.tsx`:

```tsx
const [activeTab, setActiveTab] = useAdminTabState<SettingsTab>("activeSettingsTab", "常规设置");
```

Do not persist:
- `openListLoginPassword`
- `openListLoginOtp`
- `runtimeSettings.openlistToken` outside the existing settings API
- backup/download messages

- [ ] **Step 4: Set dynamic comic detail tab title**

Modify `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`:

```tsx
import { useAdminTabTitle } from "@/components/admin-workbench/use-admin-tab-title";

useAdminTabTitle(currentComic.displayTitle);
```

Place the hook after `currentComic` state is created.

- [ ] **Step 5: Decide what not to persist**

Do not convert these to `useAdminTabState`:
- Modal open states.
- Upload `File` values.
- OpenList login password and OTP.
- Raw token/password fields.
- Pending/loading flags.
- Error messages caused by one-time API responses.

Cached outlet already preserves these while switching tabs in the same browser session. The localStorage hook is only for safe state recovery after refresh.

- [ ] **Step 6: Run checks**

Run:

```bash
npm run lint -w apps/web
npm run typecheck -w apps/web
npm run test -w apps/web -- admin-tab
```

Expected: all pass.

## Task 5: Browser QA And Regression Fixes

**Files:**
- Modify files from Tasks 1-4 only if QA exposes regressions.

**Interfaces:**
- Consumes:
  - Completed admin workbench implementation.
- Produces:
  - Verified admin tab behavior in a real browser.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev -w apps/web
```

Expected: app serves at `http://127.0.0.1:4317`.

- [ ] **Step 2: Verify public admin entry opens a browser tab**

Browser steps:

1. Open `http://127.0.0.1:4317/`.
2. Inspect the top nav "管理" link.
3. Confirm it has `target="_blank"` and `rel="noreferrer"`.
4. Click it in a headed browser and confirm a new browser tab opens at `/admin`.

- [ ] **Step 3: Verify app tabs open and persist**

Browser steps:

1. Open `/admin`.
2. Click side nav "漫画路径", "漫画管理", "标签管理".
3. Confirm the app tab strip shows `后台首页`, `漫画路径`, `漫画管理`, `标签管理`.
4. Reload the browser page.
5. Confirm the same app tabs are restored from localStorage.

- [ ] **Step 4: Verify cached page state**

Browser steps:

1. Open `/admin/comics`.
2. Type `abc` in search and switch to page size `20`.
3. Open `/admin/tags` via side nav.
4. Return to app tab `漫画管理`.
5. Confirm search remains `abc` and page size remains `20`.
6. Reload the browser.
7. Confirm safe state remains restored.

- [ ] **Step 5: Verify dynamic detail tab**

Browser steps:

1. Open `/admin/comics`.
2. Click a comic "查看".
3. Confirm a new app tab opens for `/admin/comics/[id]`.
4. Confirm its title changes from `漫画详情` to the comic display title.
5. Click "返回漫画管理".
6. Confirm it activates/reuses the existing `漫画管理` app tab.

- [ ] **Step 6: Verify close behavior**

Browser steps:

1. Close an inactive app tab.
2. Confirm the active tab does not change.
3. Close the active app tab.
4. Confirm the nearest tab to the left becomes active.
5. Try closing `后台首页`.
6. Confirm it stays open.

- [ ] **Step 7: Verify browser conventions**

Browser steps:

1. Ctrl-click an admin side nav link.
2. Confirm the browser opens a browser tab and the app interceptor does not hijack it.
3. Middle-click an admin link.
4. Confirm browser behavior is preserved.

- [ ] **Step 8: Full verification**

Run:

```bash
npm run lint -w apps/web
npm run typecheck -w apps/web
npm run test -w apps/web
npm run build -w apps/web
git diff --check
```

Expected:
- lint passes.
- typecheck passes.
- all Vitest tests pass.
- build succeeds; existing Turbopack NFT trace warning may remain if unrelated.
- `git diff --check` has no whitespace errors.

## Rollout Notes

- This feature changes only admin UI navigation and client-side state. No database migration is needed.
- If cached outlet causes stale data after destructive actions, use the tab strip refresh button or close/reopen the tab. A later enhancement can add automatic invalidation on selected API/server actions.
- If keeping server `children` mounted exposes a Next.js App Router incompatibility during QA, fall back to preserving tab metadata plus `useAdminTabState` state and remove `AdminCachedOutlet` from the same plan before committing. Do not ship an unstable keep-alive layer.

## Self-Review

- Spec coverage:
  - Browser new tab admin entry: Task 3.
  - App-internal admin tabs for route jumps: Task 2 and Task 5.
  - Tab cache: Task 1 storage and Task 4 per-tab state.
  - Backend-system-like behavior: cached outlet, close/refresh/restore behavior, route interception.
- Placeholder scan:
  - No task uses TBD/TODO.
  - Each task lists exact files and commands.
- Type consistency:
  - `AdminTabCache`, `AdminTab`, `openAdminTab`, `closeAdminTab`, `useAdminTabs`, and `useAdminTabState` signatures are consistent across tasks.
