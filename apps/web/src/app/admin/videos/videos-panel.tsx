"use client";

import { Box, Group, Select, Table, Text, TextInput } from "@mantine/core";
import { Search, Video } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton } from "@/components/ui/app-components";
import type { VideoAdminRowRecord } from "@/modules/video-library";
import { formatDuration } from "@/components/video-card";

export function VideosPanel({ videos }: { videos: VideoAdminRowRecord[] }) {
  const [search, setSearch] = useAdminTabState("search", "");
  const [status, setStatus] = useAdminTabState("status", "all");
  const [page, setPage] = useState(1);
  const rows = useMemo(() => videos.filter((video) => (status === "all" || video.status === status) && (!search.trim() || [video.displayTitle, video.fileTitle, video.status, video.primaryPath ?? ""].join(" ").toLowerCase().includes(search.trim().toLowerCase()))), [videos, status, search]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginated = rows.slice((page - 1) * pageSize, page * pageSize);
  return <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
    <Group mb="lg"><Video size={22} /><Box><Text component="h1" size="20px" fw={700} mb={2}>视频管理</Text><Text size="sm" c="ink.5">维护视频标题、标签、集数顺序和文件状态。</Text></Box></Group>
    <Group mb="md" align="flex-end"><TextInput placeholder="搜索标题、路径或状态..." leftSection={<Search size={16} />} value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(1); }} style={{ flex: 1, maxWidth: 440 }} /><Select label="状态" value={status} onChange={(value) => { setStatus(value ?? "all"); setPage(1); }} data={[{ value: "all", label: "全部" }, { value: "readable", label: "就绪" }, { value: "missing_local_file", label: "缺文件" }, { value: "hidden", label: "已隐藏" }, { value: "deleted", label: "已删除" }]} w={150} /></Group>
    <Table.ScrollContainer minWidth={820} type="native"><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>封面</Table.Th><Table.Th>标题</Table.Th><Table.Th w={90}>集数</Table.Th><Table.Th w={120}>总时长</Table.Th><Table.Th w={100}>状态</Table.Th><Table.Th w={90}>操作</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{paginated.map((video) => <Table.Tr key={video.id}><Table.Td><Box component="img" src={`/api/videos/${video.id}/cover`} alt="" style={{ width: 74, height: 42, objectFit: "cover", borderRadius: 6, background: "#251a2d" }} /></Table.Td><Table.Td><Text fw={700} size="sm">{video.displayTitle}</Text><Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{video.primaryPath ?? video.fileTitle}</Text></Table.Td><Table.Td>{video.episodeCount}</Table.Td><Table.Td>{formatDuration(video.totalDurationSeconds)}</Table.Td><Table.Td><StatusLabel status={video.status} missing={video.isPrimaryFileMissing} /></Table.Td><Table.Td><AppButton component={Link} href={`/admin/videos/${video.id}`} variant="outline" size="xs">查看</AppButton></Table.Td></Table.Tr>)}{paginated.length === 0 ? <Table.Tr><Table.Td colSpan={6}><Text ta="center" c="ink.5" py="md">没有找到匹配的视频</Text></Table.Td></Table.Tr> : null}</Table.Tbody></Table></Table.ScrollContainer>
    <Group justify="flex-end" mt="md"><Text size="sm" c="ink.5">共 {rows.length} 条</Text><AppButton variant="outline" size="xs" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</AppButton><Text size="sm">{page} / {totalPages}</Text><AppButton variant="outline" size="xs" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</AppButton></Group>
  </Box>;
}

function StatusLabel({ status, missing }: { status: VideoAdminRowRecord["status"]; missing: boolean }) { const label: Record<VideoAdminRowRecord["status"], string> = { readable: "就绪", missing_local_file: "缺文件", hidden: "已隐藏", deleted: "已删除" }; return <Text size="xs" fw={800} c={missing || status !== "readable" ? "red" : "green"}>{missing ? "缺文件" : label[status]}</Text>; }
