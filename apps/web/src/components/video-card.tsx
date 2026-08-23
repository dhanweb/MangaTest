"use client";

import { Box, Card, Group, Text } from "@mantine/core";
import { Play, Video as VideoIcon } from "lucide-react";
import Link from "next/link";

import type { VideoCardRecord } from "@/modules/video-library";

export function VideoCard({ video }: { video: VideoCardRecord }) {
  return (
    <Card padding={0} radius="md" withBorder={false} style={{ position: "relative", overflow: "hidden", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }} className="comic-card">
      <Link className="absolute inset-0 z-[1]" href={`/videos/${video.id}`} aria-label={`打开 ${video.displayTitle}`}>
        <span className="sr-only">{video.displayTitle}</span>
      </Link>
      <Box style={{ position: "relative", aspectRatio: "16 / 9", background: "#251a2d", overflow: "hidden" }}>
        <Box component="img" src={`/api/videos/${video.id}/cover`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <Box style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#ffd2e7", pointerEvents: "none" }}>
          <VideoIcon size={30} />
        </Box>
        <Box component={Link} href={`/videos/${video.id}`} aria-label={`播放 ${video.displayTitle}`} className="quick-read" style={{ position: "absolute", top: 8, right: 8, zIndex: 2, display: "grid", width: 34, height: 34, placeItems: "center", borderRadius: "50%", background: "var(--mantine-color-pink-5)", color: "white" }}>
          <Play size={14} />
        </Box>
      </Box>
      <Box p="sm" pb="md">
        <Text fw={700} size="sm" lineClamp={1} mb={2}>{video.displayTitle}</Text>
        <Text size="xs" c="ink.5" mb="sm">{video.episodeCount} 集 · {formatDuration(video.totalDurationSeconds)} · 作者：{formatAuthors(video.authorNames)}</Text>
        <Group justify="space-between" gap={8}>
          <Text size="xs" c="green.7" fw={800}>就绪</Text>
          <Text size="xs" c="ink.5">{formatDate(video.addedAt)}</Text>
        </Group>
      </Box>
    </Card>
  );
}

export function formatDuration(seconds: number | null) {
  if (!seconds || seconds < 1) return "时长未知";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${hours}时${String(minutes).padStart(2, "0")}分` : `${minutes}分${String(rest).padStart(2, "0")}秒`;
}

function formatAuthors(authors: string[]) {
  return authors.length ? authors.join("、") : "N/A";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}
