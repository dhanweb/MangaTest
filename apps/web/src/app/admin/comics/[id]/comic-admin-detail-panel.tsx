"use client";

import { Box, FileInput, Group, Modal, Radio, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { ArrowDown, ArrowLeft, ArrowUp, EyeOff, GitMerge, GripVertical, Plus, RefreshCw, RotateCcw, Save, Search, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";

import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";
import type { ComicMaintenanceAction, LibraryChapterRecord, LibraryComicAdminRowRecord } from "@/modules/library";
import type { CanonicalTag } from "@/modules/tags";
import { namespaceLabel, tagDisplayLabel } from "@/modules/tags";

type TagRow = CanonicalTag & { comicCount: number };
type AssignedComicTag = CanonicalTag & {
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
  assignedAt: string;
};

const EMPTY_ASSIGNED_TAGS: AssignedComicTag[] = [];
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
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [metadataDraft, setMetadataDraft] = useState({
    displayTitle: comic.displayTitle,
    metadataQueryTitle: comic.metadataQueryTitle ?? "",
    originalTitle: comic.originalTitle ?? "",
  });
  const [newTagDraft, setNewTagDraft] = useState({ namespace: "tag", name: "", displayNameZh: "" });
  const [assignedTags, setAssignedTags] = useState<AssignedComicTag[]>(EMPTY_ASSIGNED_TAGS);
  const [savedChapters, setSavedChapters] = useState<LibraryChapterRecord[]>(EMPTY_CHAPTERS);
  const [chapterDrafts, setChapterDrafts] = useState<LibraryChapterRecord[]>(EMPTY_CHAPTERS);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [isLoadingChapters, setIsLoadingChapters] = useState(!isMergedComic(comic));
  const [actionError, setActionError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverMessage, setCoverMessage] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [metadataMessage, setMetadataMessage] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [chapterError, setChapterError] = useState("");
  const [tagError, setTagError] = useState("");
  const [mergeModalOpened, setMergeModalOpened] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergeTargetId, setSelectedMergeTargetId] = useState<string | null>(null);

  const currentTags = assignedTags;
  const currentChapters = chapterDrafts;
  const chapterOrderChanged = currentChapters.map((chapter) => chapter.id).join("|") !== savedChapters.map((chapter) => chapter.id).join("|");
  const editTargetIsMerged = isMergedComic(currentComic);
  const parentComic = currentComic.parentComicId ? rows.find((row) => row.id === currentComic.parentComicId) : null;
  const canReorderChapters = !editTargetIsMerged && currentChapters.length > 1;
  const assignedTagIds = useMemo(() => new Set(currentTags.map((tag) => tag.id)), [currentTags]);
  const availableTagOptions = useMemo(
    () =>
      tagRows
        .filter((tag) => !assignedTagIds.has(tag.id))
        .map((tag) => ({
          value: tag.id,
          label: `${tagDisplayLabel(tag)} · ${namespaceLabel(tag.namespace)}`,
        })),
    [assignedTagIds, tagRows],
  );
  const mergeCandidates = useMemo(() => {
    const query = mergeSearch.trim().toLowerCase();
    return rows
      .filter((row) => row.id !== currentComic.id && row.status === "readable" && !row.parentComicId && !row.mergedAsChapterId)
      .filter((row) =>
        query
          ? [row.displayTitle, row.fileTitle, row.originalTitle ?? "", row.metadataQueryTitle ?? "", row.primaryLocalPath ?? ""].join(" ").toLowerCase().includes(query)
          : true,
      );
  }, [currentComic.id, mergeSearch, rows]);

  useEffect(() => {
    let isCanceled = false;

    fetch(`/api/comics/${currentComic.id}/tags`)
      .then((response) => response.json())
      .then((payload: { tags?: AssignedComicTag[]; error?: string }) => {
        if (isCanceled) {
          return;
        }

        if (!payload.tags) {
          throw new Error(payload.error ?? "读取漫画标签失败。");
        }

        setAssignedTags(payload.tags);
      })
      .catch((error) => {
        if (!isCanceled) {
          setTagError(error instanceof Error ? error.message : "读取漫画标签失败。");
        }
      })
      .finally(() => {
        if (!isCanceled) {
          setIsLoadingTags(false);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [currentComic.id]);

  useEffect(() => {
    if (editTargetIsMerged) {
      return;
    }

    let isCanceled = false;

    fetch(`/api/comics/${currentComic.id}/chapters/order`)
      .then((response) => response.json())
      .then((payload: { chapters?: LibraryChapterRecord[]; error?: string }) => {
        if (isCanceled) {
          return;
        }

        if (!payload.chapters) {
          throw new Error(payload.error ?? "读取章节顺序失败。");
        }

        setSavedChapters(payload.chapters);
        setChapterDrafts(payload.chapters);
      })
      .catch((error) => {
        if (!isCanceled) {
          setChapterError(error instanceof Error ? error.message : "读取章节顺序失败。");
        }
      })
      .finally(() => {
        if (!isCanceled) {
          setIsLoadingChapters(false);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [currentComic.id, editTargetIsMerged]);

  function patchCurrentComic(patch: Partial<LibraryComicAdminRowRecord>) {
    setCurrentComic((current) => ({ ...current, ...patch }));
    setRows((current) => current.map((row) => (row.id === currentComic.id ? { ...row, ...patch } : row)));
  }

  async function saveComicMetadata() {
    setPendingAction("metadata");
    setMetadataError("");
    setMetadataMessage("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/metadata`, {
        method: "PATCH",
        body: JSON.stringify(metadataDraft),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        comic?: {
          id: string;
          displayTitle: string;
          fileTitle: string;
          metadataQueryTitle: string | null;
          originalTitle: string | null;
          updatedAt: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.comic) {
        throw new Error(payload.error ?? "保存漫画元数据失败。");
      }

      patchCurrentComic({
        displayTitle: payload.comic.displayTitle,
        metadataQueryTitle: payload.comic.metadataQueryTitle,
        originalTitle: payload.comic.originalTitle,
        updatedAt: payload.comic.updatedAt,
      });
      setMetadataDraft({
        displayTitle: payload.comic.displayTitle,
        metadataQueryTitle: payload.comic.metadataQueryTitle ?? "",
        originalTitle: payload.comic.originalTitle ?? "",
      });
      setMetadataMessage("漫画元数据已保存。");
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : "保存漫画元数据失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function uploadCover() {
    if (!selectedCoverFile) {
      return;
    }

    setPendingAction("cover:upload");
    setCoverError("");
    setCoverMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedCoverFile);
      const response = await fetch(`/api/comics/${currentComic.id}/cover`, { method: "PUT", body: formData });
      const payload = (await response.json()) as { result?: { generatedCount: number }; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "上传封面失败。");
      }

      setSelectedCoverFile(null);
      setCoverMessage(`已上传手动封面，并生成 ${payload.result.generatedCount} 个封面缓存。`);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "上传封面失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function regenerateCover() {
    setPendingAction("cover:regenerate");
    setCoverError("");
    setCoverMessage("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/cover`, { method: "POST" });
      const payload = (await response.json()) as { result?: { generatedCount: number; removedCacheCount: number }; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "重新生成封面失败。");
      }

      setCoverMessage(`已重新生成 ${payload.result.generatedCount} 个封面缓存，清理旧缓存 ${payload.result.removedCacheCount} 个。`);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : "重新生成封面失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function changeComicStatus(action: ComicMaintenanceAction) {
    setPendingAction(action);
    setActionError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        comic?: { id: string; status: LibraryComicAdminRowRecord["status"] };
        error?: string;
      };

      if (!response.ok || !payload.comic) {
        throw new Error(payload.error ?? "漫画状态更新失败。");
      }

      patchCurrentComic({ status: payload.comic.status });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "漫画状态更新失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function addTagToComic(tagId: string) {
    setPendingAction("tag:add");
    setTagError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { tags?: AssignedComicTag[]; error?: string };

      if (!response.ok || !payload.tags) {
        throw new Error(payload.error ?? "绑定漫画标签失败。");
      }

      setAssignedTags(payload.tags);
      setSelectedTagId(null);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "绑定漫画标签失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function createAndBindTag() {
    if (!newTagDraft.namespace.trim() || !newTagDraft.name.trim()) {
      setTagError("标签分类和名称不能为空。");
      return;
    }

    setPendingAction("tag:create");
    setTagError("");

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        body: JSON.stringify({
          namespace: newTagDraft.namespace,
          name: newTagDraft.name,
          displayNameZh: newTagDraft.displayNameZh || null,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { tag?: CanonicalTag; error?: string };

      if (!response.ok || !payload.tag) {
        throw new Error(payload.error ?? "创建标签失败。");
      }

      const createdTag = payload.tag;

      setTagRows((current) => [...current, { ...createdTag, comicCount: 0 }]);
      setNewTagDraft({ namespace: newTagDraft.namespace, name: "", displayNameZh: "" });
      await addTagToComic(createdTag.id);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "创建并绑定标签失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function removeTagFromComic(tagId: string) {
    setPendingAction(`tag:remove:${tagId}`);
    setTagError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tagId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { tags?: AssignedComicTag[]; error?: string };

      if (!response.ok || !payload.tags) {
        throw new Error(payload.error ?? "移除漫画标签失败。");
      }

      setAssignedTags(payload.tags);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "移除漫画标签失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function mergeComicAsChapter() {
    if (!selectedMergeTargetId) {
      return;
    }

    setPendingAction("merge");
    setMergeError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetComicId: selectedMergeTargetId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { comics?: LibraryComicAdminRowRecord[]; error?: string };

      if (!response.ok || !payload.comics) {
        throw new Error(payload.error ?? "合并章节失败。");
      }

      setRows(payload.comics);
      setCurrentComic(payload.comics.find((row) => row.id === currentComic.id) ?? currentComic);
      setSelectedMergeTargetId(null);
      setMergeModalOpened(false);
      setIsLoadingChapters(false);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "合并章节失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function restoreMergedComic() {
    const parentComicId = currentComic.parentComicId;
    setPendingAction("merge:restore");
    setMergeError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/merge`, { method: "DELETE" });
      const payload = (await response.json()) as { comics?: LibraryComicAdminRowRecord[]; error?: string };

      if (!response.ok || !payload.comics) {
        throw new Error(payload.error ?? "恢复合并漫画失败。");
      }

      setRows(payload.comics);
      setCurrentComic(payload.comics.find((row) => row.id === currentComic.id) ?? currentComic);
      if (parentComicId) {
        setSavedChapters(EMPTY_CHAPTERS);
        setChapterDrafts(EMPTY_CHAPTERS);
        setIsLoadingChapters(true);
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "恢复合并漫画失败。");
    } finally {
      setPendingAction(null);
    }
  }

  function reorderChapterDraft(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= currentChapters.length) {
      return;
    }

    const nextChapters = [...currentChapters];
    const [movedChapter] = nextChapters.splice(fromIndex, 1);
    if (!movedChapter) {
      return;
    }

    nextChapters.splice(toIndex, 0, movedChapter);
    setChapterDrafts(nextChapters);
  }

  function moveChapter(chapterId: string, direction: -1 | 1) {
    const currentIndex = currentChapters.findIndex((chapter) => chapter.id === chapterId);
    reorderChapterDraft(currentIndex, currentIndex + direction);
  }

  function dropChapter(event: DragEvent<HTMLDivElement>, targetChapterId: string) {
    event.preventDefault();
    const draggedChapterId = event.dataTransfer.getData("text/plain");
    const fromIndex = currentChapters.findIndex((chapter) => chapter.id === draggedChapterId);
    const toIndex = currentChapters.findIndex((chapter) => chapter.id === targetChapterId);
    reorderChapterDraft(fromIndex, toIndex);
  }

  async function saveChapterOrder() {
    setPendingAction("chapters:order");
    setChapterError("");

    try {
      const response = await fetch(`/api/comics/${currentComic.id}/chapters/order`, {
        method: "PATCH",
        body: JSON.stringify({ chapterIds: currentChapters.map((chapter) => chapter.id) }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { chapters?: LibraryChapterRecord[]; error?: string };

      if (!response.ok || !payload.chapters) {
        throw new Error(payload.error ?? "保存章节顺序失败。");
      }

      setSavedChapters(payload.chapters);
      setChapterDrafts(payload.chapters);
    } catch (error) {
      setChapterError(error instanceof Error ? error.message : "保存章节顺序失败。");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Group justify="space-between" align="flex-start" mb="lg">
        <Box style={{ minWidth: 0 }}>
          <AppButton component={Link} href="/admin/comics" variant="transparent" leftSection={<ArrowLeft size={15} />} px={0} mb="xs">
            返回漫画管理
          </AppButton>
          <Text component="h1" size="24px" fw={900} c="ink.8" m={0}>
            {currentComic.displayTitle}
          </Text>
          <Text size="sm" c="ink.5" mt={4} style={{ overflowWrap: "anywhere" }}>
            {currentComic.fileTitle}
          </Text>
        </Box>
        <StatusBadge status={currentComic.status} missing={currentComic.isPrimaryFileMissing} merged={editTargetIsMerged} />
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Section title="标题与元数据" note="文件标题保留扫描来源，不会被这里的编辑覆盖。">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <AppInput label="展示标题" value={metadataDraft.displayTitle} onChange={(event) => setMetadataDraft((current) => ({ ...current, displayTitle: event.currentTarget.value }))} />
            <AppInput label="文件标题" value={currentComic.fileTitle} readOnly />
            <AppInput label="原始标题" value={metadataDraft.originalTitle} onChange={(event) => setMetadataDraft((current) => ({ ...current, originalTitle: event.currentTarget.value }))} />
            <AppInput
              label="元数据查询标题"
              value={metadataDraft.metadataQueryTitle}
              onChange={(event) => setMetadataDraft((current) => ({ ...current, metadataQueryTitle: event.currentTarget.value }))}
            />
            <AppInput label="格式" value={formatKind(currentComic.localFileKind)} readOnly />
            <AppInput label="状态" value={statusLabel(currentComic.status, editTargetIsMerged)} readOnly />
          </SimpleGrid>
          <Group justify="flex-end" mt="sm">
            <AppButton size="xs" leftSection={<Save size={14} />} disabled={!metadataDraft.displayTitle.trim()} loading={pendingAction === "metadata"} onClick={saveComicMetadata}>
              保存信息
            </AppButton>
          </Group>
          <Message success={metadataMessage} error={metadataError} />
        </Section>

        <Section title="本地文件" note="这里仅展示数据库记录，不提供物理删除文件操作。">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="sm">
            <Metric label="页数" value={String(currentComic.pageCount)} />
            <Metric label="章节" value={String(currentComic.chapterCount)} />
            <Metric label="格式" value={formatKind(currentComic.localFileKind)} />
            <Metric label="状态" value={statusLabel(currentComic.status, editTargetIsMerged)} />
          </SimpleGrid>
          <AppInput label="本地路径" value={currentComic.primaryLocalPath ?? "未关联主文件"} readOnly />
        </Section>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
        <Section title="封面缓存" note="手动封面会优先用于首页和详情页；自动封面仍可从当前封面页重新生成。">
          <Group gap="sm" align="flex-end">
            <FileInput
              accept="image/*"
              clearable
              label="上传手动封面"
              placeholder="选择图片文件"
              value={selectedCoverFile}
              onChange={setSelectedCoverFile}
              disabled={editTargetIsMerged}
              style={{ flex: 1, minWidth: 220 }}
            />
            <AppButton leftSection={<Upload size={15} />} disabled={editTargetIsMerged || !selectedCoverFile} loading={pendingAction === "cover:upload"} onClick={uploadCover}>
              上传封面
            </AppButton>
            <AppButton
              variant="outline"
              leftSection={<RefreshCw size={15} />}
              disabled={currentComic.status !== "readable" || currentComic.isPrimaryFileMissing}
              loading={pendingAction === "cover:regenerate"}
              onClick={regenerateCover}
            >
              重新生成
            </AppButton>
          </Group>
          <Message success={coverMessage} error={coverError} />
        </Section>

        <Section title="漫画标签" note="可从已有 canonical 标签中选择，也可以直接创建新标签并绑定。">
          <Group justify="space-between" align="flex-start" mb="xs">
            <Group gap={8} wrap="wrap">
              {currentTags.length > 0 ? (
                currentTags.map((tag) => (
                  <AppButton key={tag.id} variant="outline" size="xs" rightSection={<X size={13} />} loading={pendingAction === `tag:remove:${tag.id}`} onClick={() => removeTagFromComic(tag.id)}>
                    {tagDisplayLabel(tag)}
                  </AppButton>
                ))
              ) : (
                <Text size="sm" c="ink.5">
                  暂未绑定标签。
                </Text>
              )}
            </Group>
            {isLoadingTags && (
              <Text size="xs" c="ink.5">
                读取中...
              </Text>
            )}
          </Group>

          <Group gap="sm" align="flex-end">
            <AppSelect
              searchable
              clearable
              label="添加已有标签"
              placeholder={availableTagOptions.length > 0 ? "选择标签" : "没有可添加的标签"}
              value={selectedTagId}
              onChange={setSelectedTagId}
              data={availableTagOptions}
              disabled={availableTagOptions.length === 0}
              style={{ flex: 1, minWidth: 220 }}
            />
            <AppButton leftSection={<Plus size={15} />} disabled={!selectedTagId} loading={pendingAction === "tag:add"} onClick={() => selectedTagId && addTagToComic(selectedTagId)}>
              绑定
            </AppButton>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mt="sm">
            <AppInput label="新标签分类" value={newTagDraft.namespace} onChange={(event) => setNewTagDraft((current) => ({ ...current, namespace: event.currentTarget.value }))} />
            <AppInput label="新标签名称" value={newTagDraft.name} onChange={(event) => setNewTagDraft((current) => ({ ...current, name: event.currentTarget.value }))} />
            <AppInput label="中文显示名" value={newTagDraft.displayNameZh} onChange={(event) => setNewTagDraft((current) => ({ ...current, displayNameZh: event.currentTarget.value }))} />
          </SimpleGrid>
          <Group justify="flex-end" mt="sm">
            <AppButton variant="outline" leftSection={<Plus size={15} />} disabled={!newTagDraft.namespace.trim() || !newTagDraft.name.trim()} loading={pendingAction === "tag:create"} onClick={createAndBindTag}>
              创建并绑定
            </AppButton>
          </Group>
          <Message error={tagError} />
        </Section>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="md">
        <Section title="章节顺序" note="合并后的章节归属可在目标漫画中继续排序。">
          <Group justify="space-between" align="center" mb="sm">
            {isLoadingChapters ? (
              <Text size="xs" c="ink.5">
                读取中...
              </Text>
            ) : (
              <Text size="xs" c="ink.5">
                {currentChapters.length} 个章节
              </Text>
            )}
            <AppButton size="xs" leftSection={<Save size={14} />} disabled={!canReorderChapters || !chapterOrderChanged} loading={pendingAction === "chapters:order"} onClick={saveChapterOrder}>
              保存顺序
            </AppButton>
          </Group>

          <Stack gap={6}>
            {currentChapters.length > 0 ? (
              currentChapters.map((chapter, index) => (
                <Box
                  key={chapter.id}
                  draggable={canReorderChapters}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", chapter.id)}
                  onDragOver={(event) => {
                    if (canReorderChapters) {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => dropChapter(event, chapter.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "30px minmax(0, 1fr) auto",
                    gap: 10,
                    alignItems: "center",
                    minHeight: 46,
                    padding: "8px 10px",
                    border: "1px solid var(--mantine-color-pink-1)",
                    borderRadius: 8,
                    background: chapterOrderChanged ? "var(--mantine-color-pink-0)" : "white",
                  }}
                >
                  <GripVertical size={16} style={{ color: "var(--mantine-color-ink-4)", cursor: canReorderChapters ? "grab" : "default" }} />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={700} truncate>
                      {chapter.title ?? (currentChapters.length === 1 ? "单章节" : `章节 ${index + 1}`)}
                    </Text>
                    <Text size="xs" c="ink.5">
                      {chapter.pageCount} 页 · #{index + 1}
                    </Text>
                  </Box>
                  <Group gap={4} wrap="nowrap">
                    <AppButton aria-label="上移章节" variant="outline" size="xs" disabled={!canReorderChapters || index === 0} onClick={() => moveChapter(chapter.id, -1)}>
                      <ArrowUp size={14} />
                    </AppButton>
                    <AppButton aria-label="下移章节" variant="outline" size="xs" disabled={!canReorderChapters || index === currentChapters.length - 1} onClick={() => moveChapter(chapter.id, 1)}>
                      <ArrowDown size={14} />
                    </AppButton>
                  </Group>
                </Box>
              ))
            ) : (
              <Text size="sm" c="ink.5">
                暂无章节。
              </Text>
            )}
          </Stack>
          <Message error={chapterError} />
        </Section>

        <Section title="章节合并" note="合并只移动数据库章节归属，不移动、不复制、不删除真实文件。MVP 仅支持单章节漫画。">
          {editTargetIsMerged ? (
            <Group justify="space-between" align="center">
              <Text size="sm" c="ink.6">
                已合并到：{parentComic?.displayTitle ?? currentComic.parentComicId}
              </Text>
              <AppButton variant="outline" leftSection={<RotateCcw size={15} />} loading={pendingAction === "merge:restore"} onClick={restoreMergedComic}>
                恢复为独立漫画
              </AppButton>
            </Group>
          ) : (
            <Group justify="space-between" align="center">
              <Text size="sm" c="ink.6">
                从漫画列表中选择目标，可查看页数、章节、状态和路径后再确认。
              </Text>
              <AppButton
                leftSection={<GitMerge size={15} />}
                disabled={currentComic.status !== "readable" || mergeCandidates.length === 0}
                onClick={() => setMergeModalOpened(true)}
              >
                选择合并目标
              </AppButton>
            </Group>
          )}
          <Message error={mergeError} />
        </Section>
      </SimpleGrid>

      <Section title="记录维护" note="隐藏会从前台列表移除；软删除只是标记数据库记录，后续可从后台恢复。" mt="md">
        {actionError && (
          <Text size="sm" c="red.7" mb="sm">
            {actionError}
          </Text>
        )}
        <Group justify="flex-end">
          {!editTargetIsMerged && (currentComic.status === "hidden" || currentComic.status === "deleted") ? (
            <AppButton variant="outline" leftSection={<RotateCcw size={15} />} loading={pendingAction === "restore"} onClick={() => changeComicStatus("restore")}>
              恢复记录
            </AppButton>
          ) : !editTargetIsMerged ? (
            <AppButton variant="outline" leftSection={<EyeOff size={15} />} loading={pendingAction === "hide"} onClick={() => changeComicStatus("hide")}>
              隐藏
            </AppButton>
          ) : null}
          {!editTargetIsMerged && currentComic.status !== "deleted" && (
            <AppButton color="red" variant="outline" leftSection={<Trash2 size={15} />} loading={pendingAction === "soft_delete"} onClick={() => changeComicStatus("soft_delete")}>
              软删除
            </AppButton>
          )}
        </Group>
      </Section>

      <MergeTargetModal
        candidates={mergeCandidates}
        opened={mergeModalOpened}
        search={mergeSearch}
        selectedId={selectedMergeTargetId}
        isMerging={pendingAction === "merge"}
        onClose={() => setMergeModalOpened(false)}
        onConfirm={mergeComicAsChapter}
        onSearchChange={setMergeSearch}
        onSelect={setSelectedMergeTargetId}
      />
    </Box>
  );
}

function MergeTargetModal({
  candidates,
  isMerging,
  onClose,
  onConfirm,
  onSearchChange,
  onSelect,
  opened,
  search,
  selectedId,
}: {
  candidates: LibraryComicAdminRowRecord[];
  isMerging: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (value: string) => void;
  opened: boolean;
  search: string;
  selectedId: string | null;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="选择合并目标漫画" size="xl" styles={{ title: { fontWeight: 800 }, header: { borderBottom: "1px solid var(--mantine-color-pink-1)" } }}>
      <Stack gap="md">
        <TextInput
          placeholder="搜索标题、路径或元数据..."
          leftSection={<Search size={15} />}
          value={search}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
        <Radio.Group value={selectedId} onChange={onSelect}>
          <ScrollArea h={420} offsetScrollbars>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={42} />
                  <Table.Th>漫画</Table.Th>
                  <Table.Th w={74}>页数</Table.Th>
                  <Table.Th w={74}>章节</Table.Th>
                  <Table.Th w={90}>状态</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {candidates.map((candidate) => (
                  <Table.Tr key={candidate.id} onClick={() => onSelect(candidate.id)} style={{ cursor: "pointer" }}>
                    <Table.Td>
                      <Radio value={candidate.id} aria-label={`选择 ${candidate.displayTitle}`} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={800}>
                        {candidate.displayTitle}
                      </Text>
                      <Text size="xs" c="ink.5">
                        {candidate.fileTitle}
                      </Text>
                      <Text size="xs" c="ink.4" style={{ overflowWrap: "anywhere" }}>
                        {candidate.primaryLocalPath ?? "未关联主文件"}
                      </Text>
                    </Table.Td>
                    <Table.Td>{candidate.pageCount}</Table.Td>
                    <Table.Td>{candidate.chapterCount}</Table.Td>
                    <Table.Td>{statusLabel(candidate.status)}</Table.Td>
                  </Table.Tr>
                ))}
                {candidates.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text size="sm" c="ink.5" ta="center" py="md">
                        没有可合并的目标漫画
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Radio.Group>
        <Group justify="flex-end">
          <AppButton variant="outline" onClick={onClose}>
            取消
          </AppButton>
          <AppButton leftSection={<GitMerge size={15} />} disabled={!selectedId} loading={isMerging} onClick={onConfirm}>
            确认合并
          </AppButton>
        </Group>
      </Stack>
    </Modal>
  );
}

function Section({ children, mt, note, title }: { children: React.ReactNode; mt?: string; note?: string; title: string }) {
  return (
    <Box p="md" mt={mt} style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 10, background: "white" }}>
      <Box mb="sm">
        <Text size="sm" fw={800} c="ink.8">
          {title}
        </Text>
        {note && (
          <Text size="xs" c="ink.5" mt={2}>
            {note}
          </Text>
        )}
      </Box>
      {children}
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box p="xs" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 8, background: "var(--mantine-color-pink-0)" }}>
      <Text size="xs" c="ink.5">
        {label}
      </Text>
      <Text size="sm" fw={900} c="ink.8">
        {value}
      </Text>
    </Box>
  );
}

function Message({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) {
    return null;
  }

  return (
    <Text size="sm" c={error ? "red.7" : "green.7"} mt="xs">
      {error || success}
    </Text>
  );
}

function StatusBadge({ status, missing, merged }: { status: LibraryComicAdminRowRecord["status"]; missing: boolean; merged: boolean }) {
  const problem = missing || merged || status !== "readable";

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 26,
        padding: "0 10px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        background: problem ? "#ffe3e6" : "#e4f9ed",
        color: problem ? "#d93a4e" : "#00894a",
      }}
    >
      {missing ? "缺文件" : statusLabel(status, merged)}
    </Box>
  );
}

function statusLabel(status: LibraryComicAdminRowRecord["status"], merged = false) {
  if (merged) {
    return "已合并";
  }

  const labels: Record<LibraryComicAdminRowRecord["status"], string> = {
    readable: "就绪",
    missing_local_file: "缺文件",
    remote_only: "远程记录",
    hidden: "已隐藏",
    deleted: "已删除",
  };

  return labels[status];
}

function formatKind(kind: LibraryComicAdminRowRecord["localFileKind"]) {
  if (kind === "directory") {
    return "DIR";
  }

  return kind?.toUpperCase() ?? "LOCAL";
}

function isMergedComic(comic: LibraryComicAdminRowRecord) {
  return Boolean(comic.parentComicId || comic.mergedAsChapterId);
}
