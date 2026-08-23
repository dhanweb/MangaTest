"use client";

import { ActionIcon, Box, Group, Modal, Paper, Radio, Stack, Table, Text, TextInput } from "@mantine/core";
import { ArrowDown, ArrowLeft, ArrowUp, EyeOff, GitMerge, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatDuration } from "@/components/video-card";
import { AppButton } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { VideoAdminRowRecord, VideoDetailRecord, VideoTagRecord } from "@/modules/video-library";

type VideoMergeResponse = { videos?: VideoAdminRowRecord[]; video?: VideoDetailRecord; error?: string };

export function VideoAdminDetailPanel({ video: initialVideo, videos: initialVideos }: { video: VideoDetailRecord; videos: VideoAdminRowRecord[] }) {
  const [video, setVideo] = useState(initialVideo);
  const [videoRows, setVideoRows] = useState(initialVideos);
  const [title, setTitle] = useState(initialVideo.displayTitle);
  const [episodes, setEpisodes] = useState(initialVideo.episodes);
  const [tags, setTags] = useState<VideoTagRecord[]>(initialVideo.tags);
  const [tagName, setTagName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [mergeModalOpened, setMergeModalOpened] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeSourceId, setSelectedMergeSourceId] = useState<string | null>(null);

  const isMerged = Boolean(video.parentVideoId || video.mergedAsEpisodeId);
  const parentVideo = video.parentVideoId ? videoRows.find((row) => row.id === video.parentVideoId) : null;
  const mergeCandidates = useMemo(() => {
    const query = mergeSearch.trim().toLowerCase();
    return videoRows
      .filter((row) => row.id !== video.id && row.status === "readable" && row.episodeCount === 1 && !row.parentVideoId && !row.mergedAsEpisodeId)
      .filter((row) => !query || `${row.displayTitle} ${row.fileTitle} ${row.primaryPath ?? ""}`.toLowerCase().includes(query));
  }, [mergeSearch, video.id, videoRows]);

  async function saveTitle() {
    setPending("title");
    const response = await fetch(`/api/videos/${video.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayTitle: title }) });
    const payload = await response.json() as { video?: VideoDetailRecord; error?: string };
    if (!response.ok || !payload.video) toast.error(payload.error ?? "保存失败");
    else { setVideo(payload.video); toast.success("标题已保存"); }
    setPending(null);
  }

  async function changeStatus(action: "hide" | "restore" | "soft_delete") {
    setPending(action);
    const response = await fetch(`/api/videos/${video.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const payload = await response.json() as { status?: VideoDetailRecord["status"]; error?: string };
    if (!response.ok || !payload.status) toast.error(payload.error ?? "操作失败");
    else { setVideo((current) => ({ ...current, status: payload.status! })); toast.success("状态已更新"); }
    setPending(null);
  }

  async function saveOrder() {
    setPending("order");
    const response = await fetch(`/api/videos/${video.id}/episodes/order`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeIds: episodes.map((episode) => episode.id) }) });
    if (!response.ok) toast.error("保存集数顺序失败"); else toast.success("集数顺序已保存");
    setPending(null);
  }

  async function mergeVideo() {
    if (!selectedMergeSourceId) return;
    setPending("merge");
    try {
      const response = await fetch(`/api/videos/${video.id}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVideoId: selectedMergeSourceId }) });
      const payload = await response.json() as VideoMergeResponse;
      if (!response.ok || !payload.video) throw new Error(payload.error ?? "合并失败");
      setVideo(payload.video);
      setEpisodes(payload.video.episodes);
      setVideoRows(payload.videos ?? videoRows);
      setSelectedMergeSourceId(null);
      setMergeModalOpened(false);
      toast.success("已将视频添加为当前视频的集数");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "合并失败");
    } finally {
      setPending(null);
    }
  }

  async function restoreMerge() {
    setPending("merge:restore");
    try {
      const response = await fetch(`/api/videos/${video.id}/merge`, { method: "DELETE" });
      const payload = await response.json() as VideoMergeResponse;
      if (!response.ok || !payload.video) throw new Error(payload.error ?? "恢复失败");
      setVideo(payload.video);
      setEpisodes(payload.video.episodes);
      setVideoRows(payload.videos ?? videoRows);
      toast.success("已恢复为独立视频");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setPending(null);
    }
  }

  async function addTag() { if (!tagName.trim()) return; setPending("tag"); const response = await fetch(`/api/videos/${video.id}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tagName }) }); const payload = await response.json(); if (!response.ok) toast.error(payload.error ?? "添加标签失败"); else { setTags(payload.tags); setTagName(""); toast.success("标签已添加"); } setPending(null); }
  async function removeTag(tagId: string) { const response = await fetch(`/api/videos/${video.id}/tags`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId }) }); const payload = await response.json(); if (response.ok) setTags(payload.tags); }

  function move(index: number, delta: number) { const next = [...episodes]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setEpisodes(next.map((episode, sortOrder) => ({ ...episode, sortOrder }))); }

  return <Stack gap="lg">
    <Group><AppButton component={Link} href="/admin/videos" variant="subtle" leftSection={<ArrowLeft size={15} />}>返回视频管理</AppButton><Text component="h1" size="20px" fw={700}>{video.displayTitle}</Text></Group>
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Text fw={700} mb="md">基本信息</Text><Group align="flex-end"><TextInput label="展示标题" value={title} onChange={(event) => setTitle(event.currentTarget.value)} style={{ flex: 1 }} /><AppButton loading={pending === "title"} leftSection={<Save size={15} />} onClick={() => void saveTitle()}>保存标题</AppButton></Group><Text size="xs" c="ink.5" mt="sm">来源标题：{video.fileTitle} · {video.videoRootName || "视频库"}</Text></Paper>
    {isMerged && <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "var(--mantine-color-pink-0)" }}><Group justify="space-between" align="center"><Box><Text fw={700}>已合并为其他视频的集数</Text><Text size="sm" c="ink.6" mt={4}>当前集数属于：{parentVideo?.displayTitle ?? video.parentVideoId}</Text><Text size="xs" c="ink.5" mt={4}>恢复操作只修改数据库归属，不会移动真实视频文件。</Text></Box><AppButton variant="outline" loading={pending === "merge:restore"} onClick={() => void restoreMerge()}>恢复为独立视频</AppButton></Group></Paper>}
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Group justify="space-between" mb="md"><Text fw={700}>集数顺序</Text><Group gap="xs"><AppButton size="xs" variant="outline" leftSection={<GitMerge size={14} />} disabled={isMerged || video.status !== "readable"} onClick={() => setMergeModalOpened(true)}>合并其他视频为集数</AppButton><AppButton size="xs" loading={pending === "order"} disabled={isMerged} onClick={() => void saveOrder()}>保存顺序</AppButton></Group></Group><Table><Table.Thead><Table.Tr><Table.Th w={50}>#</Table.Th><Table.Th>集标题</Table.Th><Table.Th w={130}>时长</Table.Th><Table.Th w={90}>状态</Table.Th><Table.Th w={90}>操作</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{episodes.length ? episodes.map((episode, index) => <Table.Tr key={episode.id}><Table.Td>{index + 1}</Table.Td><Table.Td><Text size="sm" fw={600}>{episode.title}</Text><Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{episode.relativePath}</Text></Table.Td><Table.Td>{formatDuration(episode.durationSeconds)}</Table.Td><Table.Td>{episode.isMissing ? <Text size="xs" c="red">缺文件</Text> : <Text size="xs" c="green">正常</Text>}</Table.Td><Table.Td><Group gap={3}><ActionIcon size="sm" variant="default" disabled={isMerged || index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></ActionIcon><ActionIcon size="sm" variant="default" disabled={isMerged || index === episodes.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></ActionIcon></Group></Table.Td></Table.Tr>) : <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="ink.5" ta="center" py="md">暂无独立集数</Text></Table.Td></Table.Tr>}</Table.Tbody></Table></Paper>
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Text fw={700} mb="md">标签</Text><Group mb="md" gap="xs" wrap="wrap">{tags.map((tag) => <Box key={tag.id} component="span" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid var(--mantine-color-pink-2)", borderRadius: 7, color: "var(--mantine-color-pink-6)", fontSize: 12 }}>{tag.displayNameZh || tag.name}<button type="button" onClick={() => void removeTag(tag.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "inherit" }}>×</button></Box>)}</Group><Group align="flex-end"><TextInput label="新增通用标签" placeholder="例如 action" value={tagName} onChange={(event) => setTagName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void addTag(); }} style={{ width: 260 }} /><AppButton loading={pending === "tag"} onClick={() => void addTag()}>添加</AppButton></Group><Text size="xs" c="ink.5" mt="sm">视频来源标签内部使用 general 命名空间，界面不显示命名空间。</Text></Paper>
    <Paper p="md" style={{ border: "1px solid rgba(217,58,78,0.3)", borderRadius: 10, background: "white" }}><Text fw={700} c="red" mb="md">状态维护</Text><Group><AppButton variant="outline" leftSection={<EyeOff size={15} />} disabled={isMerged || video.status === "hidden" || video.status === "deleted"} loading={pending === "hide"} onClick={() => void changeStatus("hide")}>隐藏</AppButton><AppButton variant="outline" leftSection={<RotateCcw size={15} />} disabled={isMerged || video.status === "readable"} loading={pending === "restore"} onClick={() => void changeStatus("restore")}>恢复</AppButton><AppButton color="red" variant="outline" leftSection={<Trash2 size={15} />} disabled={isMerged || video.status === "deleted"} loading={pending === "soft_delete"} onClick={() => void changeStatus("soft_delete")}>软删除</AppButton></Group></Paper>
    <Modal opened={mergeModalOpened} onClose={() => setMergeModalOpened(false)} title="选择要合并的视频" centered><Text size="sm" c="ink.5" mb="md">选择一个单集视频，作为当前视频的新集数。真实文件不会移动。</Text><TextInput leftSection={<Search size={15} />} placeholder="搜索视频标题或路径..." value={mergeSearch} onChange={(event) => setMergeSearch(event.currentTarget.value)} mb="md" /><Radio.Group value={selectedMergeSourceId} onChange={setSelectedMergeSourceId}><Stack gap="xs" mah={320} style={{ overflowY: "auto" }}>{mergeCandidates.map((candidate) => <Radio key={candidate.id} value={candidate.id} label={<Box><Text size="sm" fw={600}>{candidate.displayTitle}</Text><Text size="xs" c="ink.5">{candidate.primaryPath ?? candidate.fileTitle} · 1 集</Text></Box>} />)}{mergeCandidates.length === 0 && <Text size="sm" c="ink.5" py="md" ta="center">没有可合并的单集视频</Text>}</Stack></Radio.Group><Group justify="flex-end" mt="lg"><AppButton variant="outline" onClick={() => setMergeModalOpened(false)}>取消</AppButton><AppButton loading={pending === "merge"} disabled={!selectedMergeSourceId} onClick={() => void mergeVideo()}>确认合并</AppButton></Group></Modal>
  </Stack>;
}
