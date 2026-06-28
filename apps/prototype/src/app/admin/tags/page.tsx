"use client";

import { ActionIcon, Box, Text } from "@mantine/core";
import { Plus, Tag } from "lucide-react";
import { AppButton, AppInput } from "@/components/ui/app-components";
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
            <Text ta="right" fw={900} c="#b77792" size="sm">{group.label}:</Text>
            <Box style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {group.values.map((tag) => (
                <AppButton key={tag} variant="outline" size="xs">
                  {tag} x
                </AppButton>
              ))}
              <ActionIcon
                variant="subtle"
                color="pink"
                size={28}
                styles={{
                  root: {
                    border: "1px dashed var(--mantine-color-pink-2)",
                    "&:hover": { background: "var(--mantine-color-pink-1)" },
                  },
                }}
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
