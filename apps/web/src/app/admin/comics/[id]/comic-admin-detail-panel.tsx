"use client";

import {
  ActionIcon, Badge, Box, Group, Paper, Radio, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput,
} from "@mantine/core";
import {
  ArrowLeft, BookOpen, EyeOff, GitMerge, RotateCcw, Save, Search, Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminTabTitle } from "@/components/admin-workbench/use-admin-tab-title";
import { AppButton, AppInput, DraggableModal } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { ComicMaintenanceAction, LibraryChapterRecord, LibraryComicAdminRowRecord } from "@/modules/library";
import type { CanonicalTag } from "@/modules/tags";
import { namespaceLabel } from "@/modules/tags";

type TagRow = CanonicalTag & { comicCount: number };
type ComicTagViewModel = CanonicalTag & { source: "scan" | "metadata" | "manual"; isUserEdited: boolean; assignedAt: string };
type SourceRecord = { id: string; site: string; sourceId: string | null; sourceUrl: string; originalTitle: string | null; coverUrl: string | null; createdAt: string; updatedAt: string };
type ResourceRecord = { id: string; comicSourceId: string | null; resourceType: string; displayLabel: string | null; redactedResource: string | null; createdAt: string; sourceSite: string | null; taskId: string | null; taskStatus: string | null; taskErrorMessage: string | null; taskCreatedAt: string | null };
type ProgressRecord = { id: string; chapterId: string; pageId: string; pageNumber: number; progressPercent: number; updatedAt: string; chapterTitle: string | null; chapterPageCount: number } | null;
type LocalFileRecord = { id: string; kind: string; absolutePath: string; relativePath: string; sizeBytes: number | null; mtimeMs: number | null; contentHash: string | null; isPrimary: boolean; isMissing: boolean; isIgnored: boolean; createdAt: string; updatedAt: string };
type LogRecord = { id: string; operation: string; targetType: string; targetId: string; summary: string; createdAt: string };

const EMPTY_CHAPTERS: LibraryChapterRecord[] = [];

export function ComicAdminDetailPanel({
  availableTags,
  comic,
  comics,
}: {
  availableTags: TagRow[];
  comic: LibraryComicAdminRowRecord;
  comics: LibraryComicAdminRowRecord[];
}) {
  const [rows, setRows] = useState(comics);
  const [tagRows, setTagRows] = useState(availableTags);
  const [currentComic, setCurrentComic] = useState(comic);
  const [activeTab, setActiveTab] = useState<string | null>("basic");

  const [metadataDraft, setMetadataDraft] = useState({
    displayTitle: comic.displayTitle,
    metadataQueryTitle: comic.metadataQueryTitle ?? "",
    originalTitle: comic.originalTitle ?? "",
  });

  const [assignedTags, setAssignedTags] = useState<ComicTagViewModel[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [savedChapters, setSavedChapters] = useState<LibraryChapterRecord[]>(EMPTY_CHAPTERS);
  const [chapterDrafts, setChapterDrafts] = useState<LibraryChapterRecord[]>(EMPTY_CHAPTERS);
  const [isLoadingChapters, setIsLoadingChapters] = useState(!isMergedComic(comic));
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [progress, setProgress] = useState<ProgressRecord>(null);
  const [localFileRecords, setLocalFileRecords] = useState<LocalFileRecord[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [mergeModalOpened, setMergeModalOpened] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeTargetId, setSelectedMergeTargetId] = useState<string | null>(null);

  useAdminTabTitle(currentComic.displayTitle);

  const editTargetIsMerged = isMergedComic(currentComic);
  const parentComic = currentComic.parentComicId ? rows.find((r) => r.id === currentComic.parentComicId) : null;
  const chapterOrderChanged = chapterDrafts.map((c) => c.id).join("|") !== savedChapters.map((c) => c.id).join("|");
  const canReorderChapters = !editTargetIsMerged && chapterDrafts.length > 1;
  const tagGroups = useMemo(() => getTagGroups(assignedTags), [assignedTags]);
  const mergeCandidates = useMemo(
    () => rows.filter((r) => r.id !== currentComic.id && r.status === "readable" && !r.parentComicId && !r.mergedAsChapterId)
      .filter((r) => { const q = mergeSearch.trim().toLowerCase(); return q ? [r.displayTitle, r.fileTitle, r.originalTitle ?? "", r.metadataQueryTitle ?? "", r.primaryLocalPath ?? ""].join(" ").toLowerCase().includes(q) : true; }),
    [currentComic.id, mergeSearch, rows],
  );

  const showMsg = useCallback((text: string, tone: "success" | "error") => {
    if (tone === "error") toast.error(text);
    else toast.success(text);
  }, []);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/tags`).then((r) => r.json()).then((d: { tags?: ComicTagViewModel[] }) => { if (!c && d.tags) setAssignedTags(d.tags); }).catch(() => {}).finally(() => { if (!c) setIsLoadingTags(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  useEffect(() => {
    // 合并漫画不需要章节顺序；用派生 loading，避免在 effect 里同步 setState
    if (editTargetIsMerged) {
      return;
    }
    let cancelled = false;
    fetch(`/api/comics/${currentComic.id}/chapters/order`)
      .then((r) => r.json())
      .then((d: { chapters?: LibraryChapterRecord[] }) => {
        if (!cancelled && d.chapters) {
          setSavedChapters(d.chapters);
          setChapterDrafts(d.chapters);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsLoadingChapters(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentComic.id, editTargetIsMerged]);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/sources`).then((r) => r.json()).then((d: { sources?: SourceRecord[] }) => { if (!c && d.sources) setSources(d.sources); }).catch(() => {}).finally(() => { if (!c) setIsLoadingSources(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/resources`).then((r) => r.json()).then((d: { resources?: ResourceRecord[] }) => { if (!c && d.resources) setResources(d.resources); }).catch(() => {}).finally(() => { if (!c) setIsLoadingResources(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/progress`).then((r) => r.json()).then((d: { progress?: ProgressRecord }) => { if (!c) setProgress(d.progress ?? null); }).catch(() => {}).finally(() => { if (!c) setIsLoadingProgress(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/local-files`).then((r) => r.json()).then((d: { files?: LocalFileRecord[] }) => { if (!c && d.files) setLocalFileRecords(d.files); }).catch(() => {}).finally(() => { if (!c) setIsLoadingFiles(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  useEffect(() => {
    let c = false;
    fetch(`/api/comics/${currentComic.id}/logs`).then((r) => r.json()).then((d: { logs?: LogRecord[] }) => { if (!c && d.logs) setLogs(d.logs); }).catch(() => {}).finally(() => { if (!c) setIsLoadingLogs(false); });
    return () => { c = true; };
  }, [currentComic.id]);

  function patchComic(p: Partial<LibraryComicAdminRowRecord>) { setCurrentComic((c) => ({ ...c, ...p })); setRows((r) => r.map((row) => (row.id === currentComic.id ? { ...row, ...p } : row))); }

  async function saveMeta() {
    setPendingAction("meta");
    try {
      const res = await fetch(`/api/comics/${currentComic.id}/metadata`, { method: "PATCH", body: JSON.stringify(metadataDraft), headers: { "Content-Type": "application/json" } });
      const p = await res.json() as { comic?: { displayTitle: string; metadataQueryTitle: string | null; originalTitle: string | null; updatedAt: string }; error?: string };
      if (!res.ok || !p.comic) throw new Error(p.error ?? "保存失败");
      patchComic({ displayTitle: p.comic.displayTitle, metadataQueryTitle: p.comic.metadataQueryTitle, originalTitle: p.comic.originalTitle });
      setMetadataDraft({ displayTitle: p.comic.displayTitle, metadataQueryTitle: p.comic.metadataQueryTitle ?? "", originalTitle: p.comic.originalTitle ?? "" });
      showMsg("已保存", "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "保存失败", "error"); } finally { setPendingAction(null); }
  }

  async function reloadCover() {
    setPendingAction("cover");
    try {
      await fetch(`/api/comics/${currentComic.id}/cover`, { method: "POST" });
      showMsg("封面已重新生成", "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "重新生成失败", "error"); } finally { setPendingAction(null); }
  }

  async function changeStatus(action: ComicMaintenanceAction) {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/comics/${currentComic.id}/status`, { method: "PATCH", body: JSON.stringify({ action }), headers: { "Content-Type": "application/json" } });
      const p = await res.json() as { comic?: { status: LibraryComicAdminRowRecord["status"] }; error?: string };
      if (!res.ok || !p.comic) throw new Error(p.error ?? "操作失败");
      patchComic({ status: p.comic.status });
      showMsg(`状态已更新`, "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "操作失败", "error"); } finally { setPendingAction(null); }
  }

  async function mergeComic() {
    if (!selectedMergeTargetId) return;
    setPendingAction("merge");
    try {
      const res = await fetch(`/api/comics/${currentComic.id}/merge`, { method: "POST", body: JSON.stringify({ targetComicId: selectedMergeTargetId }), headers: { "Content-Type": "application/json" } });
      const p = await res.json() as { comics?: LibraryComicAdminRowRecord[]; error?: string };
      if (!res.ok || !p.comics) throw new Error(p.error ?? "合并失败");
      setRows(p.comics); setCurrentComic(p.comics.find((r) => r.id === currentComic.id) ?? currentComic);
      setSelectedMergeTargetId(null); setMergeModalOpened(false); setIsLoadingChapters(false);
      showMsg("已合并为章节", "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "合并失败", "error"); } finally { setPendingAction(null); }
  }

  async function restoreMerge() {
    setPendingAction("merge:restore");
    try {
      const res = await fetch(`/api/comics/${currentComic.id}/merge`, { method: "DELETE" });
      const p = await res.json() as { comics?: LibraryComicAdminRowRecord[]; error?: string };
      if (!res.ok || !p.comics) throw new Error(p.error ?? "恢复失败");
      setRows(p.comics); setCurrentComic(p.comics.find((r) => r.id === currentComic.id) ?? currentComic);
      setSavedChapters(EMPTY_CHAPTERS); setChapterDrafts(EMPTY_CHAPTERS); setIsLoadingChapters(true);
      showMsg("已恢复", "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "恢复失败", "error"); } finally { setPendingAction(null); }
  }

  function moveChapter(id: string, dir: -1 | 1) {
    const idx = chapterDrafts.findIndex((c) => c.id === id); const to = idx + dir;
    if (idx === to || to < 0 || to >= chapterDrafts.length) return;
    const next = [...chapterDrafts]; const [m] = next.splice(idx, 1); if (!m) return; next.splice(to, 0, m); setChapterDrafts(next);
  }

  function dropChapter(ev: React.DragEvent, targetId: string) {
    ev.preventDefault(); const draggedId = ev.dataTransfer.getData("text/plain");
    const from = chapterDrafts.findIndex((c) => c.id === draggedId); const to = chapterDrafts.findIndex((c) => c.id === targetId);
    if (from === to || from < 0 || to < 0) return;
    const next = [...chapterDrafts]; const [m] = next.splice(from, 1); if (!m) return; next.splice(to, 0, m); setChapterDrafts(next);
  }

  async function saveChapterOrder() {
    setPendingAction("chapters");
    try {
      const res = await fetch(`/api/comics/${currentComic.id}/chapters/order`, { method: "PATCH", body: JSON.stringify({ chapterIds: chapterDrafts.map((c) => c.id) }), headers: { "Content-Type": "application/json" } });
      const p = await res.json() as { chapters?: LibraryChapterRecord[]; error?: string };
      if (!res.ok || !p.chapters) throw new Error(p.error ?? "保存失败");
      setSavedChapters(p.chapters); setChapterDrafts(p.chapters); showMsg("章节顺序已保存", "success");
    } catch (err) { showMsg(err instanceof Error ? err.message : "保存失败", "error"); } finally { setPendingAction(null); }
  }

  const tabBar = (
    <Box style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20, borderBottom: "1px solid #fde6ef" }} role="tablist">
      {TABS.map(({ key, label }) => (
        <AppButton
          key={key} variant="transparent" size="sm" role="tab"
          aria-selected={activeTab === key}
          onClick={() => setActiveTab(key)}
          styles={{
            root: {
              minHeight: 40, padding: "0 18px", fontWeight: 900, fontSize: 14,
              border: "none", borderRadius: 0, background: "transparent",
              borderBottom: activeTab === key ? "2px solid var(--mantine-color-pink-5)" : "2px solid transparent",
              color: activeTab === key ? "var(--mantine-color-pink-5)" : "#7a4d60",
              transition: "color 160ms ease, border-color 160ms ease",
              "&:hover": { background: "var(--mantine-color-pink-1)" },
            },
          }}
        >
          {label}
        </AppButton>
      ))}
    </Box>
  );

  return (
    <Box>
      <AppButton component={Link} href="/admin/comics" variant="transparent" leftSection={<ArrowLeft size={14} />} px={0} mb="md" size="xs">返回漫画管理</AppButton>

      <Paper p="lg" mb="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 14, background: "white" }}>
        <Group align="flex-start" gap="lg" wrap="nowrap">
          <Box style={{ width: 180, minHeight: 250, borderRadius: 12, overflow: "hidden", border: "1px solid var(--mantine-color-pink-1)", flexShrink: 0, background: "var(--mantine-color-pink-0)", position: "relative" }}>
            <Image
              src={`/api/comics/${currentComic.id}/cover?w=360&h=500&use=cover`}
              alt="cover"
              width={360}
              height={500}
              unoptimized
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </Box>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap="md" mb={4} wrap="wrap">
              <Text size="xl" fw={700} style={{ lineHeight: 1.3 }}>{currentComic.displayTitle}</Text>
              <Badge color={currentComic.isPrimaryFileMissing || editTargetIsMerged || currentComic.status !== "readable" ? "red" : "green"} variant="light" size="lg">
                {currentComic.isPrimaryFileMissing ? "缺文件" : statusLabel(currentComic.status, editTargetIsMerged)}
              </Badge>
            </Group>
            <Text size="sm" c="ink.5" mb="md" style={{ wordBreak: "break-all" }}>{currentComic.fileTitle}</Text>
            <Group gap="md" mb="md" style={{ fontSize: 12, color: "var(--mantine-color-ink-5)" }}>
              <span>章节: {currentComic.chapterCount}</span><span>页面: {currentComic.pageCount}</span><span>格式: {fmtKind(currentComic.localFileKind)}</span>
              {currentComic.originalTitle && <span>原始: {currentComic.originalTitle}</span>}
            </Group>
            <Group gap="sm">
              <AppButton component={Link} href={`/reader/${currentComic.id}`} leftSection={<BookOpen size={15} />} size="xs">打开阅读器</AppButton>
              <AppButton size="xs" leftSection={<Save size={14} />} loading={pendingAction === "meta"} onClick={saveMeta}>保存更改</AppButton>
              <AppButton variant="outline" size="xs" leftSection={<RotateCcw size={14} />} loading={pendingAction === "cover"} onClick={reloadCover}>重新生成封面</AppButton>
            </Group>
          </Box>
        </Group>
      </Paper>

      {tabBar}

      {activeTab === "basic" && (
        <Paper p="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
          <Stack gap="lg">
            <Box>
              <Text size="sm" fw={700} mb="sm">编辑基本信息</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <AppInput label="展示标题" value={metadataDraft.displayTitle} onChange={(e) => { const value = e.currentTarget.value; setMetadataDraft((d) => ({ ...d, displayTitle: value })); }} />
                <AppInput label="排序标题" value={currentComic.fileTitle} readOnly />
                <AppInput label="原始标题" value={metadataDraft.originalTitle} onChange={(e) => { const value = e.currentTarget.value; setMetadataDraft((d) => ({ ...d, originalTitle: value })); }} />
                <AppInput label="元数据查询标题" value={metadataDraft.metadataQueryTitle} onChange={(e) => { const value = e.currentTarget.value; setMetadataDraft((d) => ({ ...d, metadataQueryTitle: value })); }} />
              </SimpleGrid>
            </Box>
            <Box>
              <Text size="sm" fw={700} mb="sm">文件信息</Text>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="sm">
                <MiniStat label="页数" value={String(currentComic.pageCount)} />
                <MiniStat label="章节" value={String(currentComic.chapterCount)} />
                <MiniStat label="格式" value={fmtKind(currentComic.localFileKind)} />
                <MiniStat label="状态" value={statusLabel(currentComic.status, editTargetIsMerged)} />
              </SimpleGrid>
              <Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{currentComic.primaryLocalPath ?? "未关联主文件"}</Text>
            </Box>
            <Box>
              <Text size="sm" fw={700} mb="sm">阅读统计</Text>
              {isLoadingProgress ? <Text size="sm" c="ink.5">加载中...</Text> : progress ? (
                <Group gap="md" wrap="wrap">
                  <StatBox label="上次章节" value={progress.chapterTitle ?? "-"} />
                  <StatBox label="上次页面" value={`${progress.pageNumber} / ${progress.chapterPageCount}`} />
                  <StatBox label="进度" value={`${progress.progressPercent}%`} />
                  <StatBox label="上次时间" value={fmtDate(progress.updatedAt)} />
                </Group>
              ) : <Text size="sm" c="ink.5">暂无阅读记录</Text>}
            </Box>
          </Stack>
        </Paper>
      )}

      {activeTab === "chapters" && (
        <>
          <Paper p="md" mb="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={700}>章节列表 {isLoadingChapters ? "" : `(${chapterDrafts.length})`}</Text>
              <Group gap="sm">
                <AppButton size="xs" leftSection={<Save size={14} />} disabled={!canReorderChapters || !chapterOrderChanged} loading={pendingAction === "chapters"} onClick={saveChapterOrder}>保存顺序</AppButton>
                <AppButton variant="outline" size="xs" leftSection={<GitMerge size={14} />} onClick={() => setMergeModalOpened(true)} disabled={editTargetIsMerged || currentComic.status !== "readable"}>合并漫画为章节</AppButton>
              </Group>
            </Group>
            {isLoadingChapters ? <Text size="sm" c="ink.5" py="md">加载中...</Text> : chapterDrafts.length > 0 ? (
              <Stack gap={4}>
                {chapterDrafts.map((ch, i) => (
                  <Box key={ch.id} draggable={canReorderChapters}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", ch.id)}
                    onDragOver={(e) => canReorderChapters && e.preventDefault()}
                    onDrop={(e) => dropChapter(e, ch.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--mantine-color-pink-1)", background: chapterOrderChanged ? "var(--mantine-color-pink-0)" : "white", cursor: canReorderChapters ? "grab" : "default" }}
                  >
                    <Text size="sm" c="ink.4" style={{ width: 20, textAlign: "center", userSelect: "none" }}>⠿</Text>
                    <Text size="sm" fw={600} c="ink.5" style={{ minWidth: 28 }}>#{i + 1}</Text>
                    <Text size="sm" style={{ flex: 1 }}>{ch.title ?? `章节 ${i + 1}`}</Text>
                    <Text size="xs" c="ink.4">{ch.pageCount} 页</Text>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon size="sm" variant="default" disabled={!canReorderChapters || i === 0} onClick={() => moveChapter(ch.id, -1)}>↑</ActionIcon>
                      <ActionIcon size="sm" variant="default" disabled={!canReorderChapters || i === chapterDrafts.length - 1} onClick={() => moveChapter(ch.id, 1)}>↓</ActionIcon>
                    </Group>
                  </Box>
                ))}
              </Stack>
            ) : <Text size="sm" c="ink.5" py="md">暂无章节</Text>}
          </Paper>
          {editTargetIsMerged && (
            <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
              <Group justify="space-between" align="center">
                <Text size="sm">已合并到: {parentComic?.displayTitle ?? currentComic.parentComicId}</Text>
                <AppButton variant="outline" leftSection={<RotateCcw size={14} />} loading={pendingAction === "merge:restore"} onClick={restoreMerge} size="xs">恢复为独立漫画</AppButton>
              </Group>
            </Paper>
          )}
        </>
      )}

      {activeTab === "files" && (
        <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
          <Text size="sm" fw={700} mb="md">本地文件 {isLoadingFiles ? "" : `(${localFileRecords.length})`}</Text>
          {isLoadingFiles ? <Text size="sm" c="ink.5">加载中...</Text> : localFileRecords.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>路径</Table.Th><Table.Th w={80}>类型</Table.Th><Table.Th w={100}>大小</Table.Th><Table.Th w={80}>状态</Table.Th><Table.Th w={80}>主文件</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {localFileRecords.map((f) => (
                  <Table.Tr key={f.id}>
                    <Table.Td><Text size="sm" style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{f.relativePath}</Text></Table.Td>
                    <Table.Td>{f.kind.toUpperCase()}</Table.Td>
                    <Table.Td>{f.sizeBytes ? fmtBytes(f.sizeBytes) : "-"}</Table.Td>
                    <Table.Td><Badge color={f.isMissing ? "red" : "green"} variant="light" size="sm">{f.isMissing ? "缺失" : "正常"}</Badge></Table.Td>
                    <Table.Td>{f.isPrimary ? <Badge color="pink" variant="filled" size="sm">主文件</Badge> : "-"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : <Text size="sm" c="ink.5">暂无本地文件记录</Text>}
        </Paper>
      )}

      {activeTab === "tags" && (
        <TagManager
          comicId={currentComic.id} tagGroups={tagGroups} tagRows={tagRows}
          isLoading={isLoadingTags} pendingAction={pendingAction}
          onTagsChange={setAssignedTags} onTagRowsChange={setTagRows}
          onPendingAction={setPendingAction} onMessage={showMsg}
        />
      )}

      {activeTab === "sources" && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
            <Text size="sm" fw={700} mb="md">来源信息 {isLoadingSources ? "" : `(${sources.length})`}</Text>
            {isLoadingSources ? <Text size="sm" c="ink.5">加载中...</Text> : sources.length > 0 ? (
              <Stack gap="sm">{sources.map((src) => (
                <Box key={src.id} p="sm" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 8 }}>
                  <Badge size="sm" variant="light" color="pink" mb={4}>{src.site}</Badge>
                  <Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{src.sourceUrl}</Text>
                  <Text size="xs" c="ink.4">{src.sourceId ? `ID: ${src.sourceId}` : ""} · {fmtDate(src.createdAt)}</Text>
                </Box>
              ))}</Stack>
            ) : <Text size="sm" c="ink.5">暂无来源信息</Text>}
          </Paper>
          <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
            <Text size="sm" fw={700} mb="md">下载资源 {isLoadingResources ? "" : `(${resources.length})`}</Text>
            {isLoadingResources ? <Text size="sm" c="ink.5">加载中...</Text> : resources.length > 0 ? (
              <Stack gap="sm">{resources.map((res) => (
                <Box key={res.id} p="sm" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 8 }}>
                  <Group gap="xs" mb={2}>
                    <Badge size="sm" color={res.resourceType === "magnet" ? "violet" : "pink"} variant="filled">{res.resourceType.toUpperCase()}</Badge>
                    <Text size="sm" fw={600}>{res.displayLabel || res.resourceType}</Text>
                  </Group>
                  {res.redactedResource && <Text size="xs" c="ink.5" style={{ wordBreak: "break-all" }}>{res.redactedResource}</Text>}
                  <Text size="xs" c={res.taskStatus === "completed" ? "green" : res.taskStatus === "failed" ? "red" : "ink.4"} mt={2}>
                    {res.taskId ? `任务: ${taskLabel(res.taskStatus)}` : "未创建下载任务"}{res.taskErrorMessage ? ` - ${res.taskErrorMessage}` : ""}
                  </Text>
                </Box>
              ))}</Stack>
            ) : <Text size="sm" c="ink.5">暂无下载资源</Text>}
          </Paper>
        </SimpleGrid>
      )}

      {activeTab === "logs" && (
        <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
          <Text size="sm" fw={700} mb="md">操作日志 {isLoadingLogs ? "" : `(${logs.length})`}</Text>
          {isLoadingLogs ? <Text size="sm" c="ink.5">加载中...</Text> : logs.length > 0 ? (
            <Stack gap={4}>{logs.map((log) => (
              <Box key={log.id} p="sm" style={{ borderBottom: "1px solid var(--mantine-color-pink-1)" }}>
                <Group gap="sm" wrap="nowrap">
                  <Text size="xs" c="ink.4" style={{ fontFamily: "monospace", whiteSpace: "nowrap", minWidth: 140 }}>{fmtDate(log.createdAt)}</Text>
                  <Text size="xs"><Text component="span" fw={600}>{opLabel(log.operation)}</Text>{log.summary ? ` · ${log.summary}` : ""}</Text>
                </Group>
              </Box>
            ))}</Stack>
          ) : <Text size="sm" c="ink.5">暂无操作日志</Text>}
        </Paper>
      )}

      {activeTab === "danger" && (
        <Paper p="md" style={{ border: "1px solid rgba(217,58,78,0.3)", borderRadius: 10, background: "white" }}>
          <Text size="sm" fw={700} c="red" mb="md">⚠️ 危险操作区</Text>
          <Stack gap="sm">
            <DangerItem title="隐藏漫画" desc="从前台列表中隐藏，后台仍可查看和管理。"
              btn={currentComic.status === "hidden" || currentComic.status === "deleted"
                ? <AppButton variant="outline" size="xs" leftSection={<RotateCcw size={14} />} loading={pendingAction === "restore"} onClick={() => changeStatus("restore")}>恢复记录</AppButton>
                : <AppButton variant="outline" size="xs" leftSection={<EyeOff size={14} />} loading={pendingAction === "hide"} onClick={() => changeStatus("hide")}>隐藏</AppButton>} />
            {!editTargetIsMerged && currentComic.status !== "deleted" && (
              <DangerItem title="软删除记录" desc="标记为已删除，不删除本地文件。可在扫描结果中恢复。"
                btn={<AppButton color="red" variant="outline" size="xs" leftSection={<Trash2 size={14} />} loading={pendingAction === "soft_delete"} onClick={() => changeStatus("soft_delete")}>软删除</AppButton>} />
            )}
            <DangerItem title="合并为章节" desc="将本漫画合并到另一本漫画作为其章节。操作可逆，不会移动物理文件。"
              btn={<AppButton variant="outline" size="xs" leftSection={<GitMerge size={14} />} onClick={() => setMergeModalOpened(true)} disabled={currentComic.status !== "readable"}>合并...</AppButton>} />
          </Stack>
        </Paper>
      )}

      <DraggableModal opened={mergeModalOpened} onClose={() => setMergeModalOpened(false)} title="选择合并目标漫画" size="xl">
        <Stack gap="md">
          <TextInput placeholder="搜索标题、路径..." leftSection={<Search size={15} />} value={mergeSearch} onChange={(e) => setMergeSearch(e.currentTarget.value)} />
          <Radio.Group value={selectedMergeTargetId} onChange={setSelectedMergeTargetId}>
            <ScrollArea h={400} offsetScrollbars>
              <Table striped highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th w={42} /><Table.Th>漫画</Table.Th><Table.Th w={74}>页数</Table.Th><Table.Th w={74}>章节</Table.Th><Table.Th w={90}>状态</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {mergeCandidates.map((c) => (
                    <Table.Tr key={c.id} onClick={() => setSelectedMergeTargetId(c.id)} style={{ cursor: "pointer" }}>
                      <Table.Td><Radio value={c.id} /></Table.Td>
                      <Table.Td><Text size="sm" fw={700}>{c.displayTitle}</Text><Text size="xs" c="ink.5">{c.fileTitle}</Text></Table.Td>
                      <Table.Td>{c.pageCount}</Table.Td><Table.Td>{c.chapterCount}</Table.Td><Table.Td>{statusLabel(c.status)}</Table.Td>
                    </Table.Tr>
                  ))}
                  {mergeCandidates.length === 0 && <Table.Tr><Table.Td colSpan={5}><Text ta="center" py="md" c="ink.5">没有可合并的目标</Text></Table.Td></Table.Tr>}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Radio.Group>
          <Group justify="flex-end">
            <AppButton variant="outline" onClick={() => setMergeModalOpened(false)}>取消</AppButton>
            <AppButton leftSection={<GitMerge size={15} />} disabled={!selectedMergeTargetId} loading={pendingAction === "merge"} onClick={mergeComic}>确认合并</AppButton>
          </Group>
        </Stack>
      </DraggableModal>
    </Box>
  );
}

const TABS = [
  { key: "basic", label: "基本信息" }, { key: "chapters", label: "章节管理" },
  { key: "files", label: "本地文件" }, { key: "tags", label: "标签" },
  { key: "sources", label: "来源与资源" }, { key: "logs", label: "操作日志" },
  { key: "danger", label: "危险操作" },
] as const;

function TagManager({ comicId, tagGroups, tagRows, isLoading, pendingAction, onTagsChange, onTagRowsChange, onPendingAction, onMessage }: {
  comicId: string; tagGroups: Map<string, ComicTagViewModel[]>; tagRows: TagRow[]; isLoading: boolean; pendingAction: string | null;
  onTagsChange: (tags: ComicTagViewModel[]) => void; onTagRowsChange: React.Dispatch<React.SetStateAction<TagRow[]>>;
  onPendingAction: (a: string | null) => void; onMessage: (t: string, tone: "success" | "error") => void;
}) {
  const [addingNs, setAddingNs] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  function hasCjk(text: string) { return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text); }

  function startAdd(ns: string) { setAddingNs(ns); setAddName(""); requestAnimationFrame(() => nameRef.current?.focus()); }
  function cancelAdd() { setAddingNs(null); setAddName(""); }

  async function confirmAdd(ns: string) {
    const raw = addName.trim();
    if (!raw) return;
    onPendingAction("tag:add");
    try {
      const isCjk = hasCjk(raw);
      const tagName = isCjk ? raw : raw;
      const displayZh = isCjk ? raw : null;

      let tagId: string | null = null;
      const existing = tagRows.find((t) => t.namespace === ns && t.name === tagName.toLowerCase());
      if (existing) { tagId = existing.id; } else {
        const res = await fetch("/api/tags", {
          method: "POST",
          body: JSON.stringify({ namespace: ns, name: tagName, displayNameZh: displayZh }),
          headers: { "Content-Type": "application/json" },
        });
        const p = await res.json() as { tag?: CanonicalTag; error?: string };
        if (!res.ok || !p.tag) throw new Error(p.error ?? "创建标签失败");
        tagId = p.tag.id; onTagRowsChange((prev) => [...prev, { ...p.tag as CanonicalTag, comicCount: 0 }]);
      }
      const res2 = await fetch(`/api/comics/${comicId}/tags`, { method: "POST", body: JSON.stringify({ tagId }), headers: { "Content-Type": "application/json" } });
      const p2 = await res2.json() as { tags?: ComicTagViewModel[]; error?: string };
      if (!res2.ok || !p2.tags) throw new Error(p2.error ?? "绑定失败");
      onTagsChange(p2.tags); setAddingNs(null); setAddName("");
    } catch (err) { onMessage(err instanceof Error ? err.message : "添加失败", "error"); } finally { onPendingAction(null); }
  }

  function tagLabel(tag: ComicTagViewModel) {
    return tag.displayNameZh || tag.name || tag.canonical;
  }

  async function removeTag(tagId: string) {
    onPendingAction(`tag:rm:${tagId}`);
    try {
      const res = await fetch(`/api/comics/${comicId}/tags`, { method: "DELETE", body: JSON.stringify({ tagId }), headers: { "Content-Type": "application/json" } });
      const p = await res.json() as { tags?: ComicTagViewModel[]; error?: string };
      if (!res.ok || !p.tags) throw new Error(p.error ?? "移除失败");
      onTagsChange(p.tags);
    } catch (err) { onMessage(err instanceof Error ? err.message : "移除失败", "error"); } finally { onPendingAction(null); }
  }

  return (
    <Paper p="md" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
      <Text size="sm" fw={700} mb="md">标签管理</Text>
      {isLoading ? <Text size="sm" c="ink.5" py="md">加载中...</Text> : (
        <Stack gap={0}>
          {Array.from(tagGroups.entries()).map(([ns, tags]) => (
            <Box key={ns} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", minHeight: 50, borderBottom: "1px solid var(--mantine-color-pink-1)" }}>
              <Text size="sm" fw={600} style={{ minWidth: 60, whiteSpace: "nowrap" }}>{namespaceLabel(ns)}</Text>
              {tags.map((tag) => (
                <Box key={tag.id} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--mantine-color-pink-1)", fontSize: 12, fontWeight: 600, color: "var(--mantine-color-pink-6)" }}>
                  {tagLabel(tag)}
                  <Box component="span" style={{ cursor: "pointer", opacity: 0.4, lineHeight: 1, marginLeft: 2 }} onClick={() => removeTag(tag.id)}>✕</Box>
                </Box>
              ))}
              {addingNs === ns ? (
                <Group gap={4} wrap="nowrap">
                  <TextInput ref={nameRef} size="xs" placeholder="输入标签 (中/英文均可)" value={addName}
                    onChange={(e) => setAddName(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && addName.trim()) confirmAdd(ns); if (e.key === "Escape") cancelAdd(); }}
                    style={{ width: 180 }}
                  />
                  <ActionIcon size="sm" color="green" variant="filled" loading={pendingAction === "tag:add"} onClick={() => { if (addName.trim()) confirmAdd(ns); }}>✓</ActionIcon>
                  <ActionIcon size="sm" variant="default" onClick={cancelAdd}>✕</ActionIcon>
                </Group>
              ) : <ActionIcon size="sm" variant="outline" color="pink" disabled={pendingAction?.startsWith("tag:")} onClick={() => startAdd(ns)}>+</ActionIcon>}
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return <Box p="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10, minWidth: 100, textAlign: "center" }}>
    <Text size="lg" fw={700} c="pink.6">{value}</Text><Text size="xs" c="ink.4">{label}</Text>
  </Box>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <Box p="xs" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 8, background: "var(--mantine-color-pink-0)", textAlign: "center" }}>
    <Text size="xs" c="ink.5">{label}</Text><Text size="sm" fw={700} c="ink.8">{value}</Text>
  </Box>;
}

function DangerItem({ title, desc, btn }: { title: string; desc: string; btn: React.ReactNode }) {
  return <Group justify="space-between" p="sm" wrap="nowrap" style={{ borderBottom: "1px solid var(--mantine-color-pink-1)" }}>
    <Box style={{ minWidth: 0 }}><Text size="sm" fw={600}>{title}</Text><Text size="xs" c="ink.5">{desc}</Text></Box>{btn}
  </Group>;
}

function getTagGroups(tags: ComicTagViewModel[]) {
  const STANDARD = ["parody", "character", "female", "male", "artist", "group", "language", "category", "other"];
  const groups = new Map<string, ComicTagViewModel[]>();
  for (const ns of STANDARD) groups.set(ns, []);
  for (const tag of tags) { const ns = tag.namespace || "tag"; if (!groups.has(ns)) groups.set(ns, []); groups.get(ns)!.push(tag); }
  return groups;
}

function statusLabel(s: string, merged = false) {
  if (merged) return "已合并";
  const m: Record<string, string> = { readable: "就绪", missing_local_file: "缺文件", remote_only: "远程记录", hidden: "已隐藏", deleted: "已删除" };
  return m[s] ?? s;
}

function isMergedComic(c: { parentComicId: string | null; mergedAsChapterId: string | null }) { return Boolean(c.parentComicId || c.mergedAsChapterId); }

function fmtKind(k: string | null) { return k === "directory" ? "DIR" : k?.toUpperCase() ?? "LOCAL"; }

function taskLabel(s: string | null) { const m: Record<string, string> = { queued: "排队中", running: "下载中", completed: "已完成", failed: "失败", cancel_requested: "取消中", canceled: "已取消" }; return m[s ?? ""] ?? s ?? ""; }

function opLabel(op: string) { const m: Record<string, string> = { hide: "隐藏", soft_delete: "软删除", restore: "恢复", path_repair: "路径修复", merge_chapter: "合并章节", switch_primary_file: "切换主文件", cache_cleanup: "缓存清理", download_task_create: "创建下载", download_task_cancel: "取消下载", download_task_retry: "重试下载", download_task_pull_back: "拉回本地", collection_create: "创建收藏", collection_update: "更新收藏", collection_delete: "删除收藏", collection_add_comic: "加入收藏", collection_remove_comic: "移出收藏" }; return m[op] ?? op; }

function fmtDate(v: string) { try { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(v)); } catch { return v; } }

function fmtBytes(v: number) { if (v >= 1073741824) return `${(v / 1073741824).toFixed(1)} GB`; if (v >= 1048576) return `${(v / 1048576).toFixed(1)} MB`; if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`; return `${v} B`; }
