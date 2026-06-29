"use client";

import { ActionIcon, Box, Text } from "@mantine/core";
import { Plus, Tag } from "lucide-react";
import { AppBadge, AppButton, AppInput } from "@/components/ui/app-components";
import { tagGroups } from "@/lib/mock-data";

export default function TagsPage() {
  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Tag size={22} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>标签管理</Text>
          <Text size="sm" c="ink.5">管理所有可用的分类标签。点击 x 可删除标签。</Text>
        </Box>
      </Box>

      <Box style={{ marginTop: 30, borderTop: "1px solid #fde6ef" }}>
        {tagGroups.map((group) => (
          <Box
            key={group.label}
            style={{
              display: "grid",
              gridTemplateColumns: "118px minmax(0, 1fr)",
              gap: 8,
              alignItems: "center",
              minHeight: 46,
              padding: "8px 0",
              borderBottom: "1px solid #fde6ef",
            }}
          >
            <Text ta="right" fw={900} c="#8d5a6e" size="sm">{group.label}:</Text>
            <Box style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {group.values.map((tag) => (
                <AppBadge
                  key={tag}
                  size="lg"
                  rightSection={
                    <Box
                      component="span"
                      className="tag-x-hover"
                      style={{
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--mantine-color-ink-5)",
                        transition: "color 160ms ease",
                      }}
                    >
                      x
                    </Box>
                  }
                  styles={{
                    root: {
                      cursor: "default",
                      fontSize: 13,
                      fontWeight: 800,
                      textTransform: "none",
                    },
                  }}
                >
                  {tag}
                </AppBadge>
              ))}
              <ActionIcon
                variant="outline"
                color="pink"
                size={28}
                className="add-chip-hover"
              >
                +
              </ActionIcon>
            </Box>
          </Box>
        ))}
      </Box>

      <Box style={{ marginTop: 24 }}>
        <Box component="label" style={{ display: "grid", gap: 10 }}>
          <Text fw={900} c="#3a2034" size="sm">添加新分类</Text>
          <Box style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10 }}>
            <AppInput placeholder="例如 parody 或 cosplayer" />
            <AppButton leftSection={<Plus size={16} />}>添加分类</AppButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
