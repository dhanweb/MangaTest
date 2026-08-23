"use client";

import { ActionIcon, Box, Checkbox, Group, Modal, Paper, Stack, Table, Text, TextInput } from "@mantine/core";
import { ArrowDown, ArrowLeft, ArrowUp, EyeOff, GitMerge, RotateCcw, Save, Search, Trash2, Unlink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatDuration } from "@/components/video-card";
import { AppButton } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import { insertItemAt } from "@/lib/order-utils";
import type { VideoAdminRowRecord, VideoDetailRecord, VideoTagRecord } from "@/modules/video-library";

type VideoMergeResponse = { videos?: VideoAdminRowRecord[]; video?: VideoDetailRecord; error?: string };

export function VideoAdminDetailPanel({ video: initialVideo, videos: initialVideos }: { video: VideoDetailRecord; videos: VideoAdminRowRecord[] }) {
  const [video, setVideo] = useState(initialVideo);
  const [videoRows, setVideoRows] = useState(initialVideos);
  const [title, setTitle] = useState(initialVideo.displayTitle);
  const [episodes, setEpisodes] = useState(initialVideo.episodes);
  const [episodePositionDrafts, setEpisodePositionDrafts] = useState<Record<string, string>>(() => createPositionDrafts(initialVideo.episodes));
  const [tags, setTags] = useState<VideoTagRecord[]>(initialVideo.tags);
  const [tagName, setTagName] = useState("");
  const [episodeTitleDrafts, setEpisodeTitleDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initialVideo.episodes.map((episode) => [episode.id, episode.title])));
  const [pending, setPending] = useState<string | null>(null);
  const [mergeModalOpened, setMergeModalOpened] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeSourceIds, setSelectedMergeSourceIds] = useState<string[]>([]);
  const [mergeOrderDrafts, setMergeOrderDrafts] = useState<Record<string, string>>({});

  const isMerged = Boolean(video.parentVideoId || video.mergedAsEpisodeId);
  const parentVideo = video.parentVideoId ? videoRows.find((row) => row.id === video.parentVideoId) : null;
  const mergeCandidates = useMemo(() => {
    const query = mergeSearch.trim().toLowerCase();
    return videoRows
      .filter((row) => row.id !== video.id && row.status === "readable" && row.episodeCount === 1 && !row.parentVideoId && !row.mergedAsEpisodeId)
      .filter((row) => !query || `${row.displayTitle} ${row.fileTitle} ${row.primaryPath ?? ""}`.toLowerCase().includes(query));
  }, [mergeSearch, video.id, videoRows]);
  const selectedMergeCandidates = useMemo(
    () => selectedMergeSourceIds.map((id) => videoRows.find((row) => row.id === id)).filter((row): row is VideoAdminRowRecord => Boolean(row)),
    [selectedMergeSourceIds, videoRows],
  );

  function applyVideo(nextVideo: VideoDetailRecord) {
    setVideo(nextVideo);
    setEpisodes(nextVideo.episodes);
    setEpisodePositionDrafts(createPositionDrafts(nextVideo.episodes));
    setEpisodeTitleDrafts(Object.fromEntries(nextVideo.episodes.map((episode) => [episode.id, episode.title])));
  }

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

  async function saveEpisodeTitle(episodeId: string) {
    const nextTitle = (episodeTitleDrafts[episodeId] ?? "").trim();
    if (!nextTitle) { toast.error("集标题不能为空"); return; }
    setPending(`episode-title:${episodeId}`);
    try {
      const response = await fetch(`/api/videos/${video.id}/episodes/${episodeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: nextTitle }) });
      const payload = await response.json() as { video?: VideoDetailRecord; error?: string };
      if (!response.ok || !payload.video) throw new Error(payload.error ?? "保存集标题失败");
      applyVideo(payload.video);
      toast.success("集标题已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存集标题失败");
    } finally {
      setPending(null);
    }
  }

  async function mergeVideo() {
    if (!selectedMergeSourceIds.length) return;
    const mergeCount = selectedMergeSourceIds.length;
    const orderedSourceIds = getOrderedMergeSourceIds();
    setPending("merge");
    try {
      const response = await fetch(`/api/videos/${video.id}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVideoIds: orderedSourceIds }) });
      const payload = await response.json() as VideoMergeResponse;
      if (!response.ok || !payload.video) throw new Error(payload.error ?? "合并失败");
      applyVideo(payload.video);
      setVideoRows(payload.videos ?? videoRows);
      setSelectedMergeSourceIds([]);
      setMergeOrderDrafts({});
      setMergeModalOpened(false);
      toast.success(`已添加 ${mergeCount} 个视频集数`);
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
      applyVideo(payload.video);
      setVideoRows(payload.videos ?? videoRows);
      toast.success("已恢复为独立视频");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    } finally {
      setPending(null);
    }
  }

  async function removeMergedEpisode(episodeId: string) {
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode?.mergedFromVideoId) return;
    const sourceTitle = videoRows.find((row) => row.id === episode.mergedFromVideoId)?.displayTitle ?? "来源视频";
    if (!window.confirm(`确定移除“${episode.title}”吗？\n移除后会恢复来源视频“${sourceTitle}”，不会删除真实文件。`)) return;

    setPending(`remove-episode:${episodeId}`);
    try {
      const response = await fetch(`/api/videos/${video.id}/episodes/${episodeId}`, { method: "DELETE" });
      const payload = await response.json() as VideoMergeResponse;
      if (!response.ok || !payload.video) throw new Error(payload.error ?? "移除集数失败");
      applyVideo(payload.video);
      setVideoRows(payload.videos ?? videoRows);
      toast.success("已移除合并集数，来源视频已恢复");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除集数失败");
    } finally {
      setPending(null);
    }
  }

  function toggleMergeSource(sourceVideoId: string) {
    if (selectedMergeSourceIds.includes(sourceVideoId)) {
      setSelectedMergeSourceIds((current) => current.filter((id) => id !== sourceVideoId));
      setMergeOrderDrafts((current) => {
        const next = { ...current };
        delete next[sourceVideoId];
        return next;
      });
      return;
    }

    setSelectedMergeSourceIds((current) => [...current, sourceVideoId]);
    setMergeOrderDrafts((current) => ({ ...current, [sourceVideoId]: String(selectedMergeSourceIds.length + 1) }));
  }

  function closeMergeModal() {
    setMergeModalOpened(false);
    setMergeSearch("");
    setSelectedMergeSourceIds([]);
    setMergeOrderDrafts({});
  }

  function getOrderedMergeSourceIds() {
    return selectedMergeSourceIds
      .map((id, selectionIndex) => {
        const raw = mergeOrderDrafts[id] ?? "";
        const parsed = raw.trim() ? Number(raw) : Number.NaN;
        return {
          id,
          selectionIndex,
          order: Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : selectionIndex + 1,
        };
      })
      .sort((left, right) => left.order - right.order || left.selectionIndex - right.selectionIndex)
      .map((item) => item.id);
  }

  function commitMergeOrder(id: string) {
    const selectionIndex = selectedMergeSourceIds.indexOf(id);
    const raw = mergeOrderDrafts[id] ?? "";
    const parsed = raw.trim() ? Number(raw) : Number.NaN;
    setMergeOrderDrafts((current) => ({
      ...current,
      [id]: Number.isFinite(parsed) ? String(Math.max(1, Math.trunc(parsed))) : String(selectionIndex + 1),
    }));
  }

  async function addTag() { if (!tagName.trim()) return; setPending("tag"); const response = await fetch(`/api/videos/${video.id}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tagName }) }); const payload = await response.json(); if (!response.ok) toast.error(payload.error ?? "添加标签失败"); else { setTags(payload.tags); setTagName(""); toast.success("标签已添加"); } setPending(null); }
  async function removeTag(tagId: string) { const response = await fetch(`/api/videos/${video.id}/tags`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId }) }); const payload = await response.json(); if (response.ok) setTags(payload.tags); }

  function move(index: number, delta: number) { const next = [...episodes]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; const ordered = next.map((episode, sortOrder) => ({ ...episode, sortOrder })); setEpisodes(ordered); setEpisodePositionDrafts(createPositionDrafts(ordered)); }

  function commitEpisodePosition(episodeId: string) {
    const currentIndex = episodes.findIndex((episode) => episode.id === episodeId);
    if (currentIndex < 0) return;

    const raw = episodePositionDrafts[episodeId] ?? "";
    const parsed = raw.trim() ? Number(raw) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      setEpisodePositionDrafts((current) => ({ ...current, [episodeId]: String(currentIndex + 1) }));
      return;
    }

    const next = insertItemAt(episodes, episodeId, parsed).map((episode, sortOrder) => ({ ...episode, sortOrder }));
    setEpisodes(next);
    setEpisodePositionDrafts(createPositionDrafts(next));
  }

  return <Stack gap="lg">
    <Group><AppButton component={Link} href="/admin/videos" variant="subtle" leftSection={<ArrowLeft size={15} />}>返回视频管理</AppButton><Text component="h1" size="20px" fw={700}>{video.displayTitle}</Text></Group>
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Text fw={700} mb="md">基本信息</Text><Group align="flex-end"><TextInput label="展示标题" value={title} onChange={(event) => setTitle(event.currentTarget.value)} style={{ flex: 1 }} /><AppButton loading={pending === "title"} leftSection={<Save size={15} />} onClick={() => void saveTitle()}>保存标题</AppButton></Group><Text size="xs" c="ink.5" mt="sm">来源标题：{video.fileTitle} · {video.videoRootName || "视频库"}</Text></Paper>
    {isMerged && <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, background: "var(--mantine-color-pink-0)" }}><Group justify="space-between" align="center"><Box><Text fw={700}>已合并为其他视频的集数</Text><Text size="sm" c="ink.6" mt={4}>当前集数属于：{parentVideo?.displayTitle ?? video.parentVideoId}</Text><Text size="xs" c="ink.5" mt={4}>恢复操作只修改数据库归属，不会移动真实视频文件。</Text></Box><AppButton variant="outline" loading={pending === "merge:restore"} onClick={() => void restoreMerge()}>恢复为独立视频</AppButton></Group></Paper>}
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Group justify="space-between" mb="md"><Text fw={700}>集数顺序</Text><Group gap="xs"><AppButton size="xs" variant="outline" leftSection={<GitMerge size={14} />} disabled={isMerged || video.status !== "readable"} onClick={() => setMergeModalOpened(true)}>合并其他视频为集数</AppButton><AppButton size="xs" loading={pending === "order"} disabled={isMerged} onClick={() => void saveOrder()}>保存顺序</AppButton></Group></Group><Table><Table.Thead><Table.Tr><Table.Th w={80}>排序</Table.Th><Table.Th>集标题</Table.Th><Table.Th w={130}>时长</Table.Th><Table.Th w={90}>状态</Table.Th><Table.Th w={150}>操作</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{episodes.length ? episodes.map((episode, index) => { const sourceTitle = episode.mergedFromVideoId ? videoRows.find((row) => row.id === episode.mergedFromVideoId)?.displayTitle : null; return <Table.Tr key={episode.id}><Table.Td><TextInput size="xs" type="number" min={1} max={episodes.length} step={1} value={episodePositionDrafts[episode.id] ?? String(index + 1)} disabled={isMerged} onChange={(event) => { const value = event.currentTarget.value; setEpisodePositionDrafts((current) => ({ ...current, [episode.id]: value })); }} onBlur={() => commitEpisodePosition(episode.id)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitEpisodePosition(episode.id); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); setEpisodePositionDrafts((current) => ({ ...current, [episode.id]: String(index + 1) })); event.currentTarget.blur(); } }} aria-label={`设置第 ${index + 1} 集的排序位置`} styles={{ root: { width: 64 }, input: { textAlign: "center" } }} /></Table.Td><Table.Td><Group gap="xs" align="flex-start" wrap="nowrap"><TextInput size="xs" value={episodeTitleDrafts[episode.id] ?? episode.title} disabled={isMerged} onChange={(event) => { const value = event.currentTarget.value; setEpisodeTitleDrafts((current) => ({ ...current, [episode.id]: value })); }} style={{ flex: 1, minWidth: 160 }} aria-label={`第 ${index + 1} 集标题`} /><ActionIcon size="sm" variant="default" aria-label="保存集标题" title="保存集标题" disabled={isMerged || (episodeTitleDrafts[episode.id] ?? episode.title).trim() === episode.title} loading={pending === `episode-title:${episode.id}`} onClick={() => void saveEpisodeTitle(episode.id)}><Save size={13} /></ActionIcon></Group><Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{episode.relativePath}</Text>{sourceTitle && <Text size="xs" c="pink.6">合并自：{sourceTitle}</Text>}</Table.Td><Table.Td>{formatDuration(episode.durationSeconds)}</Table.Td><Table.Td>{episode.isMissing ? <Text size="xs" c="red">缺文件</Text> : <Text size="xs" c="green">正常</Text>}</Table.Td><Table.Td><Group gap={3}><ActionIcon size="sm" variant="default" aria-label="上移集数" title="上移集数" disabled={isMerged || index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></ActionIcon><ActionIcon size="sm" variant="default" aria-label="下移集数" title="下移集数" disabled={isMerged || index === episodes.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></ActionIcon>{episode.mergedFromVideoId && <ActionIcon size="sm" variant="light" color="red" aria-label="移除合并集数" title="移除合并集数" loading={pending === `remove-episode:${episode.id}`} onClick={() => void removeMergedEpisode(episode.id)}><Unlink size={13} /></ActionIcon>}</Group></Table.Td></Table.Tr>; }) : <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="ink.5" ta="center" py="md">暂无独立集数</Text></Table.Td></Table.Tr>}</Table.Tbody></Table></Paper>
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}><Text fw={700} mb="md">标签</Text><Group mb="md" gap="xs" wrap="wrap">{tags.map((tag) => <Box key={tag.id} component="span" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid var(--mantine-color-pink-2)", borderRadius: 7, color: "var(--mantine-color-pink-6)", fontSize: 12 }}>{tag.displayNameZh || tag.name}<button type="button" onClick={() => void removeTag(tag.id)} style={{ border: 0, background: "none", cursor: "pointer", color: "inherit" }}>×</button></Box>)}</Group><Group align="flex-end"><TextInput label="新增通用标签" placeholder="例如 action" value={tagName} onChange={(event) => setTagName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void addTag(); }} style={{ width: 260 }} /><AppButton loading={pending === "tag"} onClick={() => void addTag()}>添加</AppButton></Group><Text size="xs" c="ink.5" mt="sm">视频来源标签内部使用 general 命名空间，界面不显示命名空间。</Text></Paper>
    <Paper p="md" style={{ border: "1px solid rgba(217,58,78,0.3)", borderRadius: 10, background: "white" }}><Text fw={700} c="red" mb="md">状态维护</Text><Group><AppButton variant="outline" leftSection={<EyeOff size={15} />} disabled={isMerged || video.status === "hidden" || video.status === "deleted"} loading={pending === "hide"} onClick={() => void changeStatus("hide")}>隐藏</AppButton><AppButton variant="outline" leftSection={<RotateCcw size={15} />} disabled={isMerged || video.status === "readable"} loading={pending === "restore"} onClick={() => void changeStatus("restore")}>恢复</AppButton><AppButton color="red" variant="outline" leftSection={<Trash2 size={15} />} disabled={isMerged || video.status === "deleted"} loading={pending === "soft_delete"} onClick={() => void changeStatus("soft_delete")}>软删除</AppButton></Group></Paper>
    <Modal opened={mergeModalOpened} onClose={closeMergeModal} title="选择要合并的视频" centered size="min(960px, 92vw)" styles={{ content: { maxWidth: "calc(100vw - 24px)" } }}><Stack gap="md"><Group justify="space-between" align="flex-start"><Box><Text size="sm" c="ink.6">可多选单集视频，按当前列表顺序追加为新集数。</Text><Text size="xs" c="ink.5" mt={3}>只修改数据库归属，真实文件不会移动或删除。</Text></Box><Text size="sm" fw={800} c="pink.6">已选 {selectedMergeSourceIds.length} 个</Text></Group><TextInput leftSection={<Search size={15} />} placeholder="搜索视频标题或路径..." value={mergeSearch} onChange={(event) => setMergeSearch(event.currentTarget.value)} />{selectedMergeCandidates.length > 0 && (
        <Paper p="sm" style={{ border: "1px solid var(--mantine-color-pink-2)", background: "var(--mantine-color-pink-0)" }}>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={700}>合并顺序</Text>
            <Text size="xs" c="ink.5">数字越小越靠前，相同序号按选择顺序排列</Text>
          </Group>
          <Stack gap={6}>
            {selectedMergeCandidates.map((candidate, selectionIndex) => (
              <Group key={candidate.id} gap="xs" wrap="nowrap">
                <TextInput
                  size="xs" type="number" min={1} step={1}
                  value={mergeOrderDrafts[candidate.id] ?? String(selectionIndex + 1)}
                  onChange={(event) => { const value = event.currentTarget.value; setMergeOrderDrafts((current) => ({ ...current, [candidate.id]: value })); }}
                  onBlur={() => commitMergeOrder(candidate.id)}
                  aria-label={"设置" + candidate.displayTitle + "的合并顺序"}
                  styles={{ root: { width: 64 }, input: { textAlign: "center" } }}
                />
                <Text size="sm" fw={600} style={{ flex: 1 }} lineClamp={1}>{candidate.displayTitle}</Text>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}<Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12, maxHeight: 540, overflowY: "auto", padding: 2 }}>{mergeCandidates.map((candidate) => <Box key={candidate.id} component="label" style={{ display: "grid", gridTemplateColumns: "128px minmax(0, 1fr)", gap: 12, alignItems: "stretch", padding: 10, border: "1px solid var(--pink-line)", borderRadius: 12, background: selectedMergeSourceIds.includes(candidate.id) ? "var(--pink-soft)" : "white", cursor: "pointer" }}><Box style={{ position: "relative", minHeight: 88, overflow: "hidden", borderRadius: 8, background: "var(--pink-soft)", border: "1px solid var(--pink-line)" }}><Box component="img" src={`/api/videos/${candidate.id}/cover`} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(event) => { event.currentTarget.style.display = "none"; }} /><Text size="xs" c="pink.6" fw={700} ta="center" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>视频封面</Text></Box><Box style={{ minWidth: 0 }}><Checkbox checked={selectedMergeSourceIds.includes(candidate.id)} onChange={() => toggleMergeSource(candidate.id)} aria-label={`选择${candidate.displayTitle}`} label={<Text size="sm" fw={700} lineClamp={2}>{candidate.displayTitle}</Text>} /><Text size="xs" c="ink.5" mt={5} lineClamp={2} style={{ wordBreak: "break-all" }}>{candidate.primaryPath ?? candidate.fileTitle}</Text><Text size="xs" c="ink.5" mt={4}>{candidate.episodeCount} 集 · {formatDuration(candidate.totalDurationSeconds)}</Text></Box></Box>)}{mergeCandidates.length === 0 && <Text size="sm" c="ink.5" py="md" ta="center" style={{ gridColumn: "1 / -1" }}>没有可合并的单集视频</Text>}</Box><Group justify="flex-end"><AppButton variant="outline" onClick={closeMergeModal}>取消</AppButton><AppButton loading={pending === "merge"} disabled={!selectedMergeSourceIds.length} onClick={() => void mergeVideo()}>确认合并</AppButton></Group></Stack></Modal>
  </Stack>;
}

function createPositionDrafts(items: readonly { id: string }[]) {
  return Object.fromEntries(items.map((item, index) => [item.id, String(index + 1)]));
}
