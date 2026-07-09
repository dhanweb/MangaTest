"use client";

import { useEffect } from "react";

import { useAdminTabPaneId } from "./admin-tab-pane-context";
import { useAdminTabs } from "./admin-tab-provider";

export function useAdminTabTitle(title: string) {
  const paneTabId = useAdminTabPaneId();
  const { activeTabId, setCurrentTabTitle, setTabTitle } = useAdminTabs();

  useEffect(() => {
    if (paneTabId) {
      setTabTitle(paneTabId, title);
      return;
    }

    setCurrentTabTitle(title);
  }, [activeTabId, paneTabId, setCurrentTabTitle, setTabTitle, title]);
}
