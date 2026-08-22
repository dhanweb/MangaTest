"use client";

import { Box } from "@mantine/core";
import { Bookmark, CloudDownload, Folder, Gauge, Library, Settings, Tag, Video, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { AdminCachedOutlet } from "@/components/admin-workbench/admin-cached-outlet";
import { AdminNavigationInterceptor } from "@/components/admin-workbench/admin-navigation-interceptor";
import { AdminTabProvider, useAdminTabs } from "@/components/admin-workbench/admin-tab-provider";
import { AdminTabStrip } from "@/components/admin-workbench/admin-tab-strip";
import { SiteHeader } from "@/components/site-header";

const navItems = [
  { href: "/admin", icon: Gauge, label: "后台首页", exact: true },
  { href: "/admin/paths", icon: Folder, label: "媒体路径" },
  { href: "/admin/comics", icon: Library, label: "漫画管理" },
  { href: "/admin/videos", icon: Video, label: "视频管理" },
  { href: "/admin/files", icon: Wrench, label: "文件维护" },
  { href: "/admin/tags", icon: Tag, label: "标签管理" },
  { href: "/admin/collections", icon: Bookmark, label: "收藏夹" },
  { href: "/admin/downloads", icon: CloudDownload, label: "下载任务" },
  { href: "/admin/settings", icon: Settings, label: "系统设置" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellFallback />}>
      <AdminTabProvider>
        <AdminShellInner>{children}</AdminShellInner>
      </AdminTabProvider>
    </Suspense>
  );
}

function AdminShellFallback() {
  return (
    <>
      <SiteHeader active="admin" />
      <Box style={{ minHeight: "calc(100vh - 60px)", background: "#fff7fb", padding: "24px 32px 48px" }} />
    </>
  );
}

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { openTab } = useAdminTabs();

  return (
    <>
      <SiteHeader active="admin" />
      <Box style={{ height: "calc(100vh - 60px)", background: "#fff7fb", overflow: "hidden", display: "flex" }}>
        <Box
          component="nav"
          style={{
            minWidth: 220,
            background: "white",
            borderRight: "1px solid #fde0eb",
            paddingTop: 18,
            overflowY: "auto",
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
          aria-label="后台导航"
        >
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Box
                key={item.href}
                component={Link}
                href={item.href}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                    return;
                  }

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
