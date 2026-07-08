import { Box, Group, Text } from "@mantine/core";
import { ListPlus } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { createCollectionRepository } from "@/modules/collections";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await createCollectionRepository().list();

  return (
    <Box component="main">
      <SiteHeader active="favorites" />
      <Box maw={1200} mx="auto" px={16} py={24}>
        <Group justify="space-between" align="baseline" mb={20}>
          <Text fw={900} fz={24}>
            收藏与阅读队列
          </Text>
          <Text size="sm" c="ink.5">
            管理收藏夹与阅读队列请在后台操作
          </Text>
        </Group>

        {collections.length === 0 ? (
          <Box
            p={32}
            style={{
              textAlign: "center",
              border: "1px dashed var(--mantine-color-gray-3)",
              borderRadius: 12,
              color: "var(--mantine-color-gray-5)",
            }}
          >
            <ListPlus size={28} style={{ marginBottom: 8 }} />
            <Text size="sm">还没有收藏夹或阅读队列。</Text>
            <Text size="xs" c="ink.5" mt={4}>
              前往后台创建收藏夹，并把漫画加入其中。
            </Text>
          </Box>
        ) : (
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {collections.map((collection) => (
              <Box
                key={collection.id}
                component={Link}
                href={`/collections/${collection.id}`}
                style={{
                  display: "block",
                  padding: 18,
                  borderRadius: 12,
                  background: "var(--mantine-color-white)",
                  border: "1px solid var(--mantine-color-gray-2)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <Group justify="space-between" align="center" mb={6}>
                  <Text fw={800} fz={16} lineClamp={1}>
                    {collection.name}
                  </Text>
                  <Text size="xs" fw={700} c={collection.kind === "queue" ? "#2563eb" : "#d6336c"}>
                    {collection.kind === "queue" ? "队列" : "收藏"}
                  </Text>
                </Group>
                <Text size="sm" c="ink.5" lineClamp={2} mih={40}>
                  {collection.description ?? "暂无描述"}
                </Text>
                <Group justify="space-between" mt={10}>
                  <Text size="xs" c="ink.5">
                    {collection.comicCount} 本漫画
                  </Text>
                  {!collection.isEnabled ? (
                    <Text size="xs" c="dimmed">
                      已停用
                    </Text>
                  ) : null}
                </Group>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
