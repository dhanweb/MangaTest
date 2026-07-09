"use client";

import { Box } from "@mantine/core";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, type ReactNode } from "react";

import { normalizeAdminTabPath } from "./admin-tab-registry";
import { AdminTabPaneIdProvider } from "./admin-tab-pane-context";
import { useAdminTabs } from "./admin-tab-provider";

interface CachedPane {
  id: string;
  node: ReactNode;
}

type PaneAction = {
  children: ReactNode;
  openTabKey: string;
  routeTabId: string;
  type: "sync";
};

export function AdminCachedOutlet({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeTabId = normalizeAdminTabPath(searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname);
  const { activeTabId, tabs } = useAdminTabs();
  const openTabKey = useMemo(() => tabs.map((tab) => tab.id).join("\n"), [tabs]);
  const [panes, dispatchPanes] = useReducer(syncPanes, [{ id: routeTabId, node: children }]);
  const visibleTabId = tabs.some((tab) => tab.id === activeTabId) ? activeTabId : routeTabId;

  useEffect(() => {
    dispatchPanes({ children, openTabKey, routeTabId, type: "sync" });
  }, [children, openTabKey, routeTabId]);

  return (
    <Box style={{ position: "relative", minHeight: "100%" }}>
      {panes.map((pane) => (
        <Box
          key={pane.id}
          data-admin-tab-pane={pane.id}
          style={{
            display: pane.id === visibleTabId ? "block" : "none",
            minHeight: "100%",
          }}
        >
          <AdminTabPaneIdProvider tabId={pane.id}>{pane.node}</AdminTabPaneIdProvider>
        </Box>
      ))}
    </Box>
  );
}

function syncPanes(current: CachedPane[], action: PaneAction): CachedPane[] {
  const openTabIds = new Set(action.openTabKey.split("\n").filter(Boolean));
  const withoutClosed = current.filter((pane) => openTabIds.has(pane.id) || pane.id === action.routeTabId);
  const existing = withoutClosed.find((pane) => pane.id === action.routeTabId);

  if (existing) {
    return withoutClosed.map((pane) => (pane.id === action.routeTabId ? { ...pane, node: action.children } : pane));
  }

  return [...withoutClosed, { id: action.routeTabId, node: action.children }];
}
