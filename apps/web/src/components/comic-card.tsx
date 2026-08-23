"use client";

import { Box, Card, Group, Text } from "@mantine/core";
import { Play } from "lucide-react";
import Link from "next/link";

import { ComicCover } from "@/components/comic-cover";
import type { LibraryComicCardRecord } from "@/modules/library";

export function ComicCard({ comic, index }: { comic: LibraryComicCardRecord; index: number }) {
  return (
    <Card
      padding={0}
      radius="md"
      withBorder={false}
      style={{
        position: "relative",
        boxShadow: "0 8px 24px rgba(239,59,145,0.08)",
        transition: "box-shadow 160ms ease, transform 160ms ease",
        cursor: "pointer",
      }}
      className="comic-card"
    >
      <Link className="absolute inset-0 z-[1]" href={`/comics/${comic.id}`} aria-label={`打开 ${comic.displayTitle}`}>
        <span className="sr-only">{comic.displayTitle}</span>
      </Link>

      <ComicCover comicId={comic.id} title={`${comic.chapterCount || 1}话`} index={index} compact />

      <Box p="sm" pb="md">
        <Text fw={700} size="sm" lineClamp={1} mb={2} style={{ color: "var(--mantine-color-ink-7)" }}>
          {comic.displayTitle}
        </Text>
        <Text size="xs" c="ink.5" mb="sm">
          {comic.pageCount} 页 · 作者：{formatAuthors(comic.authorNames)}
        </Text>
        <Group justify="space-between" gap={8}>
          <Box
            component="span"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 24,
              padding: "0 8px",
              borderRadius: 7,
              background: "#e4f9ed",
              color: "#00894a",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            就绪
          </Box>
          <Text size="xs" c="ink.5">
            {formatDate(comic.addedAt)}
          </Text>
        </Group>
      </Box>

      <Box
        component={Link}
        href={`/reader/${comic.id}`}
        aria-label={`继续阅读 ${comic.displayTitle}`}
        className="quick-read"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
          display: "grid",
          width: 34,
          height: 34,
          placeItems: "center",
          borderRadius: "50%",
          background: "var(--mantine-color-pink-5)",
          color: "white",
          transition: "background 160ms ease, box-shadow 160ms ease",
        }}
      >
        <Play size={14} />
      </Box>
    </Card>
  );
}

function formatAuthors(authors: string[]) {
  return authors.length ? authors.join("、") : "N/A";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
