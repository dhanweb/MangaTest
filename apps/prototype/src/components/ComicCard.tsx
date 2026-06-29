"use client";

import Link from "next/link";
import { Box, Card, Group, Text } from "@mantine/core";
import { Play } from "lucide-react";
import type { Comic } from "@/lib/mock-data";
import { statusLabel } from "@/lib/mock-data";
import { CoverBlock } from "./SiteHeader";
import { AppBadge } from "@/components/ui/app-components";

export function ComicCard({ comic }: { comic: Comic }) {
  const isProblem = comic.status === "missing_cover" || comic.status === "local_file_missing";

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
      className="comic-card-hover"
      component={Link}
      href={`/comics/${comic.id}`}
    >
      <CoverBlock title={`${comic.episodes}话`} color={comic.color} compact />

      <Box p="sm" pb="md">
        <Text fw={700} size="sm" lineClamp={1} mb={2} style={{ color: "var(--mantine-color-ink-7)" }}>
          {comic.title}
        </Text>
        <Text size="xs" c="ink.5" mb="sm">
          {comic.artist} · {comic.pages} 页 · {comic.format}
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
              background: isProblem ? "#ffe3e6" : "#e4f9ed",
              color: isProblem ? "#d93a4e" : "#00894a",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {statusLabel[comic.status]}
          </Box>
          <Text size="xs" c="ink.5">{comic.addedAt}</Text>
        </Group>
      </Box>

      <Box
        component={Link}
        href={`/reader/${comic.id}`}
        aria-label={`继续阅读 ${comic.title}`}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "grid",
          width: 34,
          height: 34,
          placeItems: "center",
          borderRadius: "50%",
          background: "var(--mantine-color-pink-5)",
          color: "white",
          transition: "background 160ms ease, box-shadow 160ms ease",
        }}
        className="quick-read-hover"
      >
        <Play size={14} />
      </Box>
    </Card>
  );
}
