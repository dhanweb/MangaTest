"use client";

import { Box, Flex, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { ChevronRight, Edit3, Heart, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ComicCover } from "@/components/comic-cover";
import { AppBadge, AppButton, AppLink } from "@/components/ui/app-components";
import type { LibraryComicDetailRecord } from "@/modules/library";

export function ComicDetailView({ comic }: { comic: LibraryComicDetailRecord }) {
  const [favorite, setFavorite] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);
  const firstChapter = comic.chapters[0];
  const chapters = sortNewest ? [...comic.chapters].reverse() : [...comic.chapters];

  const statisticGrid = [
    { value: comic.chapterCount || 1, label: "总话数" },
    { value: comic.pageCount, label: "总页数" },
    { value: formatKind(comic.localFileKind), label: "格式" },
    { value: formatBytes(comic.sizeBytes), label: "文件大小" },
  ];

  return (
    <>
      <Flex direction={{ base: "column", sm: "row" }} gap={28} mb={42}>
        <ComicCover comicId={comic.id} title={`第1页 / 共${comic.pageCount}页`} index={hashIndex(comic.id)} compact={false} use="cover" />
        <Box style={{ flex: 1 }}>
          <Text size="xs" fw={800} c="ink.5" mb={4}>
            Local Scan
          </Text>
          <Text component="h1" size="34px" fw={700} lh="1.15" c="pink.5" mb={4} mt={0}>
            {comic.displayTitle}
          </Text>
          <Text size="sm" c="ink.5" mb="md">
            {comic.originalTitle ?? comic.fileTitle}
          </Text>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" my="lg">
            {statisticGrid.map((stat) => (
              <Box
                key={stat.label}
                style={{
                  display: "grid",
                  placeItems: "center",
                  minHeight: 70,
                  border: "1px solid var(--mantine-color-pink-2)",
                  borderRadius: 10,
                  background: "white",
                }}
              >
                <Text fw={700} size="lg" c="pink.5">
                  {stat.value}
                </Text>
                <Text size="xs" c="ink.5">
                  {stat.label}
                </Text>
              </Box>
            ))}
          </SimpleGrid>

          <Group gap={8} mb="xl" wrap="wrap">
            <AppBadge>{statusLabel(comic.status)}</AppBadge>
            <AppBadge>{formatKind(comic.localFileKind)}</AppBadge>
            <AppBadge>本地可读</AppBadge>
          </Group>

          <Text size="sm" mb="xl" c="ink.7">
            {comic.fileTitle}
          </Text>

          <Group gap={10} mt={28} className="detail-actions">
            <AppLink href={`/reader/${comic.id}`} variant="filled" className="primary-action">
              <Play size={16} />
              继续 {firstChapter?.title ?? "阅读"}
            </AppLink>
            <AppButton variant={favorite ? "light" : "outline"} color="pink" onClick={() => setFavorite((cur) => !cur)} leftSection={<Heart size={16} />}>
              {favorite ? "已收藏" : "收藏"}
            </AppButton>
            <AppLink href={`/admin/comics/${comic.id}`} variant="outline" leftSection={<Edit3 size={16} />} target="_blank" rel="noreferrer">
              编辑信息
            </AppLink>
          </Group>
        </Box>
      </Flex>

      <Box component="section">
        <Group justify="space-between" mb="md" align="center">
          <Text component="h2" size="lg" fw={700}>
            章节列表 · {comic.chapters.length || 1} 话
          </Text>
          <AppButton
            variant="subtle"
            size="xs"
            onClick={() => setSortNewest((value) => !value)}
            styles={{
              root: {
                fontWeight: 700,
                fontSize: 12,
                color: "var(--mantine-color-ink-5)",
              },
            }}
          >
            {sortNewest ? "最新优先 ↑" : "最早优先 ↓"}
          </AppButton>
        </Group>
        <Stack gap={6}>
          {(chapters.length ? chapters : [{ id: "single", title: null, pageCount: comic.pageCount, addedAt: comic.addedAt, sortOrder: 0 }]).map(
            (chapter, index) => {
              const chapterNum = sortNewest ? chapters.length - index || 1 : index + 1;

              return (
                <Box
                  key={chapter.id}
                  component={Link}
                  href={`/reader/${comic.id}?chapter=${chapter.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px minmax(0, 1fr) 18px",
                    gap: 14,
                    alignItems: "center",
                    minHeight: 58,
                    padding: "10px 16px",
                    borderRadius: 12,
                    background: "white",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background 160ms ease, box-shadow 160ms ease",
                  }}
                  className="chapter-link-hover"
                >
                  <Box
                    style={{
                      display: "grid",
                      width: 44,
                      height: 32,
                      placeItems: "center",
                      borderRadius: 8,
                      background: index === 0 && sortNewest ? "var(--mantine-color-pink-5)" : "#f0e6ee",
                      color: index === 0 && sortNewest ? "white" : "#7a5b7e",
                      fontSize: 14,
                      fontWeight: 800,
                      transition: "background 160ms ease, color 160ms ease",
                    }}
                  >
                    {chapterNum}
                  </Box>
                  <Box style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm" style={{ lineHeight: 1.3 }}>
                      {chapter.title ?? "单章节"}
                    </Text>
                    <Text size="xs" c="ink.5" mt={2}>
                      {chapter.pageCount} 页 · {formatDate(chapter.addedAt)}
                    </Text>
                  </Box>
                  <ChevronRight size={15} style={{ color: "var(--mantine-color-ink-3)", flexShrink: 0 }} />
                </Box>
              );
            },
          )}
        </Stack>
      </Box>
    </>
  );
}

function statusLabel(status: LibraryComicDetailRecord["status"]) {
  const labels: Record<LibraryComicDetailRecord["status"], string> = {
    readable: "就绪",
    missing_local_file: "缺文件",
    remote_only: "远程记录",
    hidden: "已隐藏",
    deleted: "已删除",
  };

  return labels[status];
}

function formatKind(kind: LibraryComicDetailRecord["localFileKind"]) {
  if (kind === "directory") {
    return "DIR";
  }

  return kind?.toUpperCase() ?? "LOCAL";
}

function formatBytes(value: number | null) {
  if (!value) {
    return "-";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${Math.round(value / 1024 / 1024)} MB`;
  }

  return `${Math.round(value / 1024)} KB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function hashIndex(input: string) {
  return input.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
