"use client";

import { Box } from "@mantine/core";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";

import { normalizeAdminTabPath } from "./admin-tab-registry";
import { AdminTabPaneIdProvider } from "./admin-tab-pane-context";

export function AdminCachedOutlet({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeTabId = normalizeAdminTabPath(searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname);

  return (
    <Box style={{ position: "relative", minHeight: "100%" }}>
      <Box data-admin-tab-pane={routeTabId} style={{ minHeight: "100%" }}>
        <AdminTabPaneIdProvider tabId={routeTabId}>{children}</AdminTabPaneIdProvider>
      </Box>
    </Box>
  );
}
