"use client";

import { Box } from "@mantine/core";
import { Folder, Library, Settings, Tag, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SiteHeader } from "@/components/site-header";

const navItems = [
  { href: "/admin/paths", icon: Folder, label: "漫画路径" },
  { href: "/admin/comics", icon: Library, label: "漫画管理" },
  { href: "/admin/files", icon: Wrench, label: "文件维护" },
  { href: "/admin/tags", icon: Tag, label: "标签管理" },
  { href: "/admin/settings", icon: Settings, label: "系统设置" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
            const isActive = pathname.startsWith(item.href);
            return (
              <Box
                key={item.href}
                component={Link}
                href={item.href}
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

        <Box style={{ flex: 1, minWidth: 0, overflowY: "auto", height: "100%", padding: "24px 32px 48px" }}>{children}</Box>
      </Box>
    </>
  );
}
