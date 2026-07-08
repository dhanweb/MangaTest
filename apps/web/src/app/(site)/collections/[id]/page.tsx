import { Box, Button, Group, Text } from "@mantine/core";
import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComicCard } from "@/components/comic-card";
import { SiteHeader } from "@/components/site-header";
import { createCollectionRepository } from "@/modules/collections";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collection = await createCollectionRepository().getDetail(id);

  if (!collection) {
    notFound();
  }

  const firstComic = collection.items[0];

  return (
    <Box component="main">
      <SiteHeader active="favorites" />
      <Box maw={1200} mx="auto" px={16} py={24}>
        <Group justify="space-between" align="flex-start" mb={20}>
          <Box>
            <Box component={Link} href="/collections" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--mantine-color-gray-5)", fontSize: 13, textDecoration: "none" }}>
              <ArrowLeft size={14} />
              返回收藏列表
            </Box>
            <Group gap={10} align="baseline" mt={6}>
              <Text fw={900} fz={24}>
                {collection.name}
              </Text>
              <Text size="xs" fw={700} c={collection.kind === "queue" ? "#2563eb" : "#d6336c"}>
                {collection.kind === "queue" ? "阅读队列" : "收藏夹"}
              </Text>
            </Group>
            {collection.description ? (
              <Text size="sm" c="ink.5" mt={4} style={{ maxWidth: 720 }}>
                {collection.description}
              </Text>
            ) : null}
            <Text size="xs" c="ink.5" mt={4}>
              共 {collection.comicCount} 本漫画
            </Text>
          </Box>
          {collection.kind === "queue" && firstComic ? (
            <Button component={Link} href={`/reader/${firstComic.id}`} size="sm" leftSection={<Play size={14} />}>
              开始阅读队列
            </Button>
          ) : null}
        </Group>

        {collection.items.length === 0 ? (
          <Box
            p={32}
            style={{
              textAlign: "center",
              border: "1px dashed var(--mantine-color-gray-3)",
              borderRadius: 12,
              color: "var(--mantine-color-gray-5)",
            }}
          >
            <Text size="sm">这个收藏夹还没有漫画。</Text>
          </Box>
        ) : (
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            {collection.items.map((item, index) => (
              <Box key={item.id} style={{ position: "relative" }}>
                {collection.kind === "queue" ? (
                  <Box
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      zIndex: 2,
                      background: "rgba(37, 23, 46, 0.72)",
                      color: "white",
                      fontSize: 12,
                      fontWeight: 800,
                      borderRadius: 6,
                      padding: "2px 8px",
                    }}
                  >
                    {index + 1}
                  </Box>
                ) : null}
                <ComicCard comic={item} index={index} />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
