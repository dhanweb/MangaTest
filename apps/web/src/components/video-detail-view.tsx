"use client";

import { Box, Flex, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { ExternalLink, FolderOpen, Pencil, Play, Tag } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { AppBadge, AppButton, AppLink } from "@/components/ui/app-components";
import { formatDuration } from "@/components/video-card";
import type { VideoDetailRecord } from "@/modules/video-library";

export function VideoDetailView({ video }: { video: VideoDetailRecord }) {
  const initialEpisode = useMemo(() => video.episodes.find((episode) => episode.id === video.lastWatchedEpisodeId && !episode.isMissing) ?? video.episodes.find((episode) => !episode.isMissing) ?? video.episodes[0], [video]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(initialEpisode?.id ?? "");
  const [isOpening, setIsOpening] = useState(false);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedAtRef = useRef(0);
  const selectedEpisode = video.episodes.find((episode) => episode.id === selectedEpisodeId) ?? initialEpisode;

  async function saveProgress(force = false, completed = false) {
    const player = playerRef.current;
    if (!player || !selectedEpisode) return;
    const now = Date.now();
    if (!force && now - lastSavedAtRef.current < 5000) return;
    lastSavedAtRef.current = now;
    const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : selectedEpisode.durationSeconds ?? 0;
    const positionSeconds = Math.max(0, Math.round(player.currentTime));
    const progressPercent = duration > 0 ? Math.min(100, Math.round((positionSeconds / duration) * 100)) : 0;
    await fetch("/api/video-progress", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: video.id, episodeId: selectedEpisode.id, positionSeconds, progressPercent, isCompleted: completed }) }).catch(() => undefined);
  }

  async function openWithPotPlayer() {
    if (!selectedEpisode) return;
    setIsOpening(true);
    try {
      const response = await fetch(`/api/videos/${video.id}/open-potplayer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId: selectedEpisode.id }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) window.alert(payload.error ?? "打开 PotPlayer 失败。");
    } finally {
      setIsOpening(false);
    }
  }

  if (!selectedEpisode) return <Text c="red">没有可播放的视频集数。</Text>;
  const protocolHref = `potplayer://play?file=${encodeURIComponent(selectedEpisode.absolutePath)}`;

  return <Stack gap="lg">
    <Flex direction={{ base: "column", lg: "row" }} gap="lg" align="stretch">
      <Box style={{ flex: 1, minWidth: 0, background: "#17121b", borderRadius: 14, overflow: "hidden", boxShadow: "0 12px 28px rgba(37, 23, 46, 0.16)" }}>
        <video
          ref={playerRef}
          key={selectedEpisode.id}
          controls
          preload="metadata"
          poster={`/api/videos/${video.id}/cover`}
          src={`/api/videos/${video.id}/stream?episodeId=${encodeURIComponent(selectedEpisode.id)}`}
          style={{ display: "block", width: "100%", maxHeight: "min(72vh, 720px)", background: "#17121b" }}
          onLoadedMetadata={(event) => {
            const seconds = selectedEpisode.progressSeconds;
            if (seconds > 0 && seconds < event.currentTarget.duration - 2) event.currentTarget.currentTime = seconds;
          }}
          onTimeUpdate={() => void saveProgress()}
          onPause={() => void saveProgress(true)}
          onEnded={() => void saveProgress(true, true)}
        />
      </Box>
      <Paper p="md" withBorder style={{ width: "min(100%, 330px)", borderColor: "var(--mantine-color-pink-2)", alignSelf: "stretch" }}>
        <Group justify="space-between" mb="sm"><Text fw={800}>集数</Text><Text size="xs" c="ink.5">{video.episodes.length} 集</Text></Group>
        <Stack gap={6} style={{ maxHeight: "min(72vh, 620px)", overflowY: "auto" }}>
          {video.episodes.map((episode) => <Box key={episode.id} component="button" type="button" disabled={episode.isMissing} onClick={() => { void saveProgress(true); setSelectedEpisodeId(episode.id); }} style={{ width: "100%", display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "10px 12px", border: selectedEpisode.id === episode.id ? "1px solid var(--mantine-color-pink-5)" : "1px solid transparent", borderRadius: 10, background: selectedEpisode.id === episode.id ? "var(--mantine-color-pink-0)" : "transparent", color: "inherit", textAlign: "left", cursor: episode.isMissing ? "not-allowed" : "pointer", opacity: episode.isMissing ? 0.5 : 1 }}>
            <Box style={{ display: "grid", placeItems: "center", width: 30, height: 26, borderRadius: 7, background: selectedEpisode.id === episode.id ? "var(--mantine-color-pink-5)" : "#f1e8ef", color: selectedEpisode.id === episode.id ? "white" : "#7a5b7e", fontWeight: 800, fontSize: 12 }}>{episode.sortOrder + 1}</Box>
            <Box style={{ minWidth: 0 }}><Text size="sm" fw={700} lineClamp={1}>{episode.title}</Text><Text size="xs" c="ink.5" mt={2}>{formatDuration(episode.durationSeconds)} · {episode.progressPercent}%</Text></Box>
            {episode.isCompleted ? <Text size="xs" c="green.7" fw={800}>已看</Text> : <Play size={14} style={{ color: "var(--mantine-color-ink-3)" }} />}
          </Box>)}
        </Stack>
      </Paper>
    </Flex>

    <Box>
      <Text size="xs" fw={800} c="ink.5" mb={4}>Local Video</Text>
      <Text component="h1" size="34px" fw={700} lh="1.15" c="pink.5" mb="md" mt={0}>{video.displayTitle}</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="md">
        <Stat value={String(video.episodeCount)} label="总集数" /><Stat value={formatDuration(video.totalDurationSeconds)} label="总时长" /><Stat value={formatBytes(video.totalSizeBytes)} label="文件大小" /><Stat value={selectedEpisode.extension.toUpperCase()} label="格式" />
      </SimpleGrid>
      <Group gap={8} mb="md" wrap="wrap"><AppBadge>本地可读</AppBadge>{video.tags.map((tag) => <AppBadge key={tag.id}><Tag size={12} /> {tag.displayNameZh || tag.name}</AppBadge>)}</Group>
      <Group gap={10} wrap="wrap">
        <AppButton variant="filled" loading={isOpening} onClick={() => void openWithPotPlayer()} leftSection={<FolderOpen size={16} />}>用 PotPlayer 打开</AppButton>
        <AppButton component="a" href={protocolHref} variant="outline" leftSection={<ExternalLink size={16} />}>PotPlayer 协议打开</AppButton>
        <AppLink href={`/admin/videos/${video.id}`} variant="outline" leftSection={<Pencil size={16} />} target="_blank" rel="noreferrer">编辑信息</AppLink>
      </Group>
    </Box>
  </Stack>;
}

function Stat({ value, label }: { value: string; label: string }) { return <Box style={{ display: "grid", placeItems: "center", minHeight: 70, border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "white" }}><Text fw={700} size="lg" c="pink.5">{value}</Text><Text size="xs" c="ink.5">{label}</Text></Box>; }
function formatBytes(value: number) { if (!value) return "-"; if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`; if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`; return `${Math.round(value / 1024)} KB`; }
