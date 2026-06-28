"use client";

import { Box, Text } from "@mantine/core";
import { Library } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";
import { comics } from "@/lib/mock-data";

export default function ComicsPage() {
  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Library size={22} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>漫画管理</Text>
          <Text size="sm" c="ink.5">查看扫描结果、文件状态和需要维护的漫画记录。</Text>
        </Box>
      </Box>

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)", marginTop: 20 }}>
        {comics.map((comic) => (
          <Box
            key={comic.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 160px 100px 90px",
              gap: 12,
              alignItems: "center",
              minHeight: 54,
              padding: "0 14px",
              borderBottom: "1px solid var(--mantine-color-pink-2)",
            }}
          >
            <Text fw={700} size="sm" truncate>{comic.title}</Text>
            <Text size="sm">{comic.artist}</Text>
            <Text size="sm">{comic.pages} 页</Text>
            <AppButton variant="outline" size="xs">编辑</AppButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
