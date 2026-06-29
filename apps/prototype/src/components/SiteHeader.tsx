"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Box, Group } from "@mantine/core";
import { BookOpen, Heart, Library, Settings } from "lucide-react";
import { AppLink } from "@/components/ui/app-components";

interface SiteHeaderProps {
  active?: "library" | "favorites" | "admin";
}

const navItems = [
  { id: "library", icon: Library, label: "漫画库", href: "/" },
  { id: "favorites", icon: Heart, label: "收藏", href: "/?view=favorites" },
  { id: "admin", icon: Settings, label: "管理", href: "/admin" },
] as const;

export function SiteHeader({ active = "library" }: SiteHeaderProps) {
  return (
    <Box
      component="header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--mantine-color-pink-5)",
        boxShadow: "0 4px 14px rgba(206, 33, 113, 0.24)",
      }}
    >
      <Group
        justify="space-between"
        h={60}
        mx="auto"
        maw={1200}
        px={16}
        gap={16}
      >
        <Box
          component={Link}
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "white",
            fontSize: 20,
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          <Box
            w={22}
            h={22}
            style={{
              borderRadius: 4,
              background: "linear-gradient(135deg, #46cf9f 0 40%, #6b7cf2 40% 68%, #ffb540 68%)",
              boxShadow: "4px 4px 0 rgba(255, 255, 255, 0.28)",
            }}
            aria-hidden="true"
          />
          <strong>ComicWeb</strong>
        </Box>

        <Group component="nav" gap={12} aria-label="主导航">
          {navItems.map((item) => (
            <Box
              key={item.id}
              component={Link}
              href={item.href}
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
          ))}
        </Group>
      </Group>
    </Box>
  );
}

export function CoverBlock({ title, color, compact = false }: { title: string; color: string; compact?: boolean }) {
  return (
    <Box
      className={compact ? "" : ""}
      style={{
        display: "grid",
        placeItems: "center",
        width: compact ? "100%" : 260,
        maxWidth: "100%",
        aspectRatio: "2 / 3",
        borderRadius: compact ? "10px 10px 0 0" : 14,
        background: color,
        color: "#ffd6ec",
        boxShadow: compact ? "none" : "0 12px 24px rgba(37, 23, 46, 0.18)",
      } as CSSProperties}
    >
      <BookOpen aria-hidden="true" size={compact ? 22 : 30} />
      <Box component="span" style={{ color: "#ff4ba0", fontSize: 12, fontWeight: 900 }}>
        {title}
      </Box>
    </Box>
  );
}
