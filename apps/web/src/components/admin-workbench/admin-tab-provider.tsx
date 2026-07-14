"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { normalizeAdminTabPath } from "./admin-tab-registry";
import { loadAdminTabCache, saveAdminTabCache } from "./admin-tab-storage";
import {
  activateAdminTab,
  closeAdminTab,
  closeAllTabs,
  closeOtherTabs,
  closeTabsToRight,
  createInitialAdminTabCache,
  openAdminTab,
  renameAdminTab,
} from "./admin-tab-state";
import { ADMIN_TAB_STATE_PREFIX, DEFAULT_ADMIN_TAB_ID, type AdminTab, type AdminTabCache } from "./admin-tab-types";

interface AdminTabContextValue {
  activeTabId: string;
  tabs: AdminTab[];
  openTab(href: string, title?: string): void;
  activateTab(tabId: string): void;
  closeTab(tabId: string): void;
  closeOtherTabs(tabId: string): void;
  closeTabsToRight(tabId: string): void;
  closeAllTabs(): void;
  refreshActiveTab(): void;
  setCurrentTabTitle(title: string): void;
  setTabTitle(tabId: string, title: string): void;
}

const AdminTabContext = createContext<AdminTabContextValue | null>(null);

export function AdminTabProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = useMemo(() => normalizeAdminTabPath(searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname), [pathname, searchParams]);
  const [cache, setCache] = useState<AdminTabCache>(() => openAdminTab(createInitialAdminTabCache(), currentHref));
  const [isHydrated, setIsHydrated] = useState(false);
  const cacheRef = useRef(cache);
  const hydratedRef = useRef(false);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    if (!hydratedRef.current) {
      const stored = loadAdminTabCache(window.localStorage);
      const restored = openAdminTab(stored ?? createInitialAdminTabCache(), currentHref);

      hydratedRef.current = true;
      setCache(restored);
      setIsHydrated(true);
      return;
    }

    setCache((current) => openAdminTab(current, currentHref));
  }, [currentHref]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveAdminTabCache(window.localStorage, cache);
  }, [cache, isHydrated]);

  const openTab = useCallback(
    (href: string, title?: string) => {
      const tabId = normalizeAdminTabPath(href);

      setCache((current) => openAdminTab(current, tabId, title));
      if (tabId !== currentHref) {
        startTransition(() => router.push(tabId));
      }
    },
    [currentHref, router],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const targetTab = cacheRef.current.tabs.find((tab) => tab.id === tabId);

      if (!targetTab) {
        return;
      }

      setCache((current) => activateAdminTab(current, tabId));
      if (targetTab.href !== currentHref) {
        startTransition(() => router.push(targetTab.href));
      }
    },
    [currentHref, router],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const previous = cacheRef.current;
      const next = closeAdminTab(previous, tabId);

      if (next === previous) {
        return;
      }

      setCache(next);
      clearStoredTabState(tabId);

      if (previous.activeTabId !== next.activeTabId) {
        const nextTab = next.tabs.find((tab) => tab.id === next.activeTabId);

        if (nextTab) {
          startTransition(() => router.push(nextTab.href));
        }
      }
    },
    [router],
  );

  const handleCloseOtherTabs = useCallback(
    (tabId: string) => {
      const previous = cacheRef.current;
      const next = closeOtherTabs(previous, tabId);

      if (next === previous) {
        return;
      }

      setCache(next);

      for (const tab of previous.tabs) {
        if (!next.tabs.some((t) => t.id === tab.id)) {
          clearStoredTabState(tab.id);
        }
      }

      const nextTab = next.tabs.find((t) => t.id === next.activeTabId);
      if (nextTab && nextTab.href !== currentHref) {
        startTransition(() => router.push(nextTab.href));
      }
    },
    [currentHref, router],
  );

  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      const previous = cacheRef.current;
      const next = closeTabsToRight(previous, tabId);

      if (next === previous) {
        return;
      }

      setCache(next);

      for (const tab of previous.tabs) {
        if (!next.tabs.some((t) => t.id === tab.id)) {
          clearStoredTabState(tab.id);
        }
      }

      const nextTab = next.tabs.find((t) => t.id === next.activeTabId);
      if (nextTab && nextTab.href !== currentHref) {
        startTransition(() => router.push(nextTab.href));
      }
    },
    [currentHref, router],
  );

  const handleCloseAllTabs = useCallback(() => {
    const previous = cacheRef.current;
    const next = closeAllTabs(previous);

    setCache(next);

    for (const tab of previous.tabs) {
      if (tab.id !== DEFAULT_ADMIN_TAB_ID) {
        clearStoredTabState(tab.id);
      }
    }

    if (currentHref !== DEFAULT_ADMIN_TAB_ID) {
      startTransition(() => router.push(DEFAULT_ADMIN_TAB_ID));
    }
  }, [currentHref, router]);

  const refreshActiveTab = useCallback(() => {
    router.refresh();
  }, [router]);

  const setCurrentTabTitle = useCallback((title: string) => {
    setCache((current) => renameAdminTab(current, current.activeTabId, title));
  }, []);

  const setTabTitle = useCallback((tabId: string, title: string) => {
    setCache((current) => renameAdminTab(current, tabId, title));
  }, []);

  const value = useMemo<AdminTabContextValue>(
    () => ({
      activeTabId: cache.activeTabId,
      tabs: cache.tabs,
      openTab,
      activateTab,
      closeTab,
      closeOtherTabs: handleCloseOtherTabs,
      closeTabsToRight: handleCloseTabsToRight,
      closeAllTabs: handleCloseAllTabs,
      refreshActiveTab,
      setCurrentTabTitle,
      setTabTitle,
    }),
    [
      activateTab,
      cache.activeTabId,
      cache.tabs,
      closeTab,
      handleCloseAllTabs,
      handleCloseOtherTabs,
      handleCloseTabsToRight,
      openTab,
      refreshActiveTab,
      setCurrentTabTitle,
      setTabTitle,
    ],
  );

  return <AdminTabContext.Provider value={value}>{children}</AdminTabContext.Provider>;
}

export function useAdminTabs() {
  const value = useContext(AdminTabContext);

  if (!value) {
    throw new Error("useAdminTabs must be used within AdminTabProvider");
  }

  return value;
}

function clearStoredTabState(tabId: string) {
  const prefix = `${ADMIN_TAB_STATE_PREFIX}:${encodeURIComponent(tabId)}:`;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(prefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // The tab itself is already closed; storage cleanup is best-effort.
  }
}
