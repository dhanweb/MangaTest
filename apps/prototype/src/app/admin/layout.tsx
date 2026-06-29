"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Text } from "@mantine/core";
import { Folder, Library, Settings, Tag } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

const navItems = [
  { href: "/admin/paths", icon: Folder, label: "漫画路径" },
  { href: "/admin/comics", icon: Library, label: "漫画管理" },
  { href: "/admin/tags", icon: Tag, label: "标签管理" },
  { href: "/admin/settings", icon: Settings, label: "系统设置" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <SiteHeader active="admin" />
      <Box style={{ height: "calc(100vh - 60px)", background: "#fff7fb", overflow: "hidden", display: "flex" }}>
        {/* Sidebar — independent scroll */}
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

        {/* Content area — independent scroll, renders route page */}
        <Box style={{ flex: 1, minWidth: 0, overflowY: "auto", height: "100%", padding: "24px 32px 48px" }}>
          {children}
        </Box>
      </Box>
    </>
  );
}
