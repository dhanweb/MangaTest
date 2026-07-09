"use client";

import { createContext, useContext, type ReactNode } from "react";

const AdminTabPaneIdContext = createContext<string | null>(null);

export function AdminTabPaneIdProvider({ children, tabId }: { children: ReactNode; tabId: string }) {
  return <AdminTabPaneIdContext.Provider value={tabId}>{children}</AdminTabPaneIdContext.Provider>;
}

export function useAdminTabPaneId() {
  return useContext(AdminTabPaneIdContext);
}
