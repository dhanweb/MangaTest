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
    const currentHashOnly = url.pathname === window.location.pathname && url.search === window.location.search && Boolean(url.hash);

    if (url.origin !== window.location.origin || !url.pathname.startsWith("/admin") || currentHashOnly) {
      return;
    }

    event.preventDefault();
    openTab(`${url.pathname}${url.search}`);
  }

  return <div onClickCapture={handleClick}>{children}</div>;
}
