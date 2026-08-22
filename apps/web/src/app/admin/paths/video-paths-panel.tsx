"use client";

import { ActionIcon, Box, Group, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { FolderOpen, Plus, RefreshCcw, Trash2, Video } from "lucide-react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { VideoRootWithStats } from "@/modules/video-library";

export function VideoPathsPanel({ initialRoots }: { initialRoots: VideoRootWithStats[] }) {
  const [roots, setRoots] = useState(initialRoots);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function addRoot() {
    setPending("add");
    try {
      const response = await fetch("/api/video-roots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ absolutePath: path, displayName: name }) });
      const payload = await response.json();
      if (!response.ok || !payload.root) throw new Error(payload.error ?? "添加失败。");
      setRoots((current) => [...current, { ...payload.root, videoCount: 0, episodeCount: 0 }]); setPath(""); setName(""); toast.success("视频根目录已添加");
    } catch (error) { toast.error(error instanceof Error ? error.message : "添加失败。"); } finally { setPending(null); }
  }

  async function scan(id: string) {
    setPending(`scan:${id}`);
    try { const response = await fetch(`/api/video-roots/${id}/scan`, { method: "POST" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "扫描失败。"); toast.success(`扫描完成：新增 ${payload.result.addedCount} 个视频，${payload.result.episodeCount} 集。`); window.location.reload(); } catch (error) { toast.error(error instanceof Error ? error.message : "扫描失败。"); } finally { setPending(null); }
  }

  async function remove(id: string) {
    if (!window.confirm("只删除视频路径记录，不会删除真实文件。确认删除？")) return;
    setPending(`delete:${id}`);
    const response = await fetch("/api/video-roots", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const payload = await response.json();
    if (!response.ok) toast.error(payload.error ?? "删除失败。"); else setRoots((current) => current.filter((root) => root.id !== id));
    setPending(null);
  }

  return <Box mt="lg" p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
    <Group mb="md"><Video size={22} /><Box><Text fw={700}>视频路径管理</Text><Text size="sm" c="ink.5">配置独立视频根目录，扫描直系视频文件和一层集数目录。</Text></Box></Group>
    <Group align="flex-end" mb="md" wrap="wrap"><TextInput label="绝对路径" value={path} onChange={(event) => setPath(event.currentTarget.value)} placeholder="例如 D:\\Videos" style={{ flex: "1 1 360px" }} /><TextInput label="描述" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="电影 / 番剧" style={{ width: 180 }} /><AppButton loading={pending === "add"} disabled={!path.trim()} leftSection={<Plus size={15} />} onClick={() => void addRoot()}>添加视频路径</AppButton></Group>
    <Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>路径</Table.Th><Table.Th>描述</Table.Th><Table.Th w={100}>视频</Table.Th><Table.Th w={100}>集数</Table.Th><Table.Th w={150}>操作</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{roots.map((root) => <Table.Tr key={root.id}><Table.Td><Text size="sm" style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{root.absolutePath}</Text></Table.Td><Table.Td>{root.displayName || "视频库"}</Table.Td><Table.Td>{root.videoCount}</Table.Td><Table.Td>{root.episodeCount}</Table.Td><Table.Td><Group gap={4} wrap="nowrap"><Tooltip label="打开目录"><ActionIcon variant="subtle" color="pink" onClick={() => void fetch(`/api/admin/paths/video/${root.id}/open-folder`, { method: "POST" })}><FolderOpen size={15} /></ActionIcon></Tooltip><Tooltip label="重新扫描"><ActionIcon variant="subtle" color="pink" disabled={pending === `scan:${root.id}`} onClick={() => void scan(root.id)}><RefreshCcw size={15} /></ActionIcon></Tooltip><Tooltip label="删除路径记录"><ActionIcon variant="subtle" color="red" disabled={pending === `delete:${root.id}`} onClick={() => void remove(root.id)}><Trash2 size={15} /></ActionIcon></Tooltip></Group></Table.Td></Table.Tr>)}{roots.length === 0 ? <Table.Tr><Table.Td colSpan={5}><Text ta="center" c="ink.5">还没有配置视频根目录。</Text></Table.Td></Table.Tr> : null}</Table.Tbody></Table>
  </Box>;
}
