"use client";

import { Box, Group, Modal, Pagination, Select, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { ArrowDown, ArrowUp, EyeOff, GitMerge, GripVertical, Library, Plus, RefreshCw, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";

import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";
import type { ComicMaintenanceAction, LibraryChapterRecord, LibraryComicAdminRowRecord } from "@/modules/library";
import type { CanonicalTag } from "@/modules/tags";
import { namespaceLabel, tagDisplayLabel } from "@/modules/tags";

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 条/页" },
  { value: "20", label: "20 条/页" },
  { value: "50", label: "50 条/页" },
];

type TagRow = CanonicalTag & { comicCount: number };
type AssignedComicTag = CanonicalTag & {
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
  assignedAt: string;
};

const EMPTY_ASSIGNED_TAGS: AssignedComicTag[] = [];
const EMPTY_CHAPTERS: LibraryChapterRecord[] = [];
const EMPTY_METADATA_DRAFT = {
  displayTitle: "",
  metadataQueryTitle: "",
  originalTitle: "",
};

export function ComicsPanel({ availableTags, comics }: { availableTags: TagRow[]; comics: LibraryComicAdminRowRecord[] }) {
  const [rows, setRows] = useState(() => comics);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<LibraryComicAdminRowRecord | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedMergeTargetId, setSelectedMergeTargetId] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState(EMPTY_METADATA_DRAFT);
  const [assignedTagsByComicId, setAssignedTagsByComicId] = useState<Record<string, AssignedComicTag[]>>({});
  const [chaptersByComicId, setChaptersByComicId] = useState<Record<string, LibraryChapterRecord[]>>({});
  const [chapterDraftsByComicId, setChapterDraftsByComicId] = useState<Record<string, LibraryChapterRecord[]>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [actionError, setActionError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverMessage, setCoverMessage] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [metadataMessage, setMetadataMessage] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [chapterError, setChapterError] = useState("");
  const [tagError, setTagError] = useState("");

  const editTargetId = editTarget?.id ?? null;

  useEffect(() => {
    if (!editTargetId || assignedTagsByComicId[editTargetId]) {
      return;
    }

    let isCanceled = false;

    fetch(`/api/comics/${editTargetId}/tags`)
      .then((response) => response.json())
      .then((payload: { tags?: AssignedComicTag[]; error?: string }) => {
        if (isCanceled) {
          return;
        }

        if (!payload.tags) {
          throw new Error(payload.error ?? "读取漫画标签失败。");
        }

        setAssignedTagsByComicId((current) => ({
          ...current,
          [editTargetId]: payload.tags ?? [],
        }));
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
  }, [assignedTagsByComicId, editTargetId]);

  useEffect(() => {
    if (!editTargetId || editTarget?.parentComicId || editTarget?.mergedAsChapterId || chaptersByComicId[editTargetId]) {
      return;
    }

    let isCanceled = false;

    fetch(`/api/comics/${editTargetId}/chapters/order`)
      .then((response) => response.json())
      .then((payload: { chapters?: LibraryChapterRecord[]; error?: string }) => {
        if (isCanceled) {
          return;
        }

        if (!payload.chapters) {
          throw new Error(payload.error ?? "读取章节顺序失败。");
        }

        setChaptersByComicId((current) => ({
          ...current,
          [editTargetId]: payload.chapters ?? [],
        }));
        setChapterDraftsByComicId((current) => ({
          ...current,
          [editTargetId]: payload.chapters ?? [],
        }));
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
  }, [chaptersByComicId, editTarget?.mergedAsChapterId, editTarget?.parentComicId, editTargetId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((comic) => {
      const text = [comic.displayTitle, comic.fileTitle, comic.originalTitle ?? "", comic.metadataQueryTitle ?? "", comic.status, comic.localFileKind ?? ""]
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    });
  }, [rows, search]);

  const limit = Number(pageSize);
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);
  const currentTags = editTarget ? (assignedTagsByComicId[editTarget.id] ?? EMPTY_ASSIGNED_TAGS) : EMPTY_ASSIGNED_TAGS;
  const savedChapters = editTarget ? (chaptersByComicId[editTarget.id] ?? EMPTY_CHAPTERS) : EMPTY_CHAPTERS;
  const currentChapters = editTarget ? (chapterDraftsByComicId[editTarget.id] ?? savedChapters) : EMPTY_CHAPTERS;
  const chapterOrderChanged = currentChapters.map((chapter) => chapter.id).join("|") !== savedChapters.map((chapter) => chapter.id).join("|");
  const editTargetIsMerged = Boolean(editTarget?.parentComicId || editTarget?.mergedAsChapterId);
  const parentComic = editTarget?.parentComicId ? rows.find((comic) => comic.id === editTarget.parentComicId) : null;
  const canReorderChapters = Boolean(editTarget && !editTargetIsMerged && currentChapters.length > 1);
  const mergeTargetOptions = useMemo(() => {
    if (!editTarget) {
      return [];
    }

    return rows
      .filter((comic) => comic.id !== editTarget.id && comic.status === "readable" && !comic.parentComicId && !comic.mergedAsChapterId)
      .map((comic) => ({
        value: comic.id,
        label: comic.displayTitle,
      }));
  }, [editTarget, rows]);
  const availableTagOptions = useMemo(() => {
    const assignedIds = new Set(currentTags.map((tag) => tag.id));

    return availableTags
      .filter((tag) => !assignedIds.has(tag.id))
      .map((tag) => ({
        value: tag.id,
        label: `${tagDisplayLabel(tag)} · ${namespaceLabel(tag.namespace)}`,
      }));
  }, [availableTags, currentTags]);

  function openComic(comic: LibraryComicAdminRowRecord) {
    const comicIsMerged = Boolean(comic.parentComicId || comic.mergedAsChapterId);

    setActionError("");
    setCoverError("");
    setCoverMessage("");
    setMetadataError("");
    setMetadataMessage("");
    setMergeError("");
    setChapterError("");
    setTagError("");
    setMetadataDraft({
      displayTitle: comic.displayTitle,
      metadataQueryTitle: comic.metadataQueryTitle ?? "",
      originalTitle: comic.originalTitle ?? "",
    });
    setSelectedTagId(null);
    setSelectedMergeTargetId(null);
    setIsLoadingTags(!assignedTagsByComicId[comic.id]);
    setIsLoadingChapters(!comicIsMerged && !chaptersByComicId[comic.id]);
    setEditTarget(comic);
  }

  async function saveComicMetadata(comic: LibraryComicAdminRowRecord) {
    setPendingAction(`${comic.id}:metadata`);
    setMetadataError("");
    setMetadataMessage("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/metadata`, {
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
      const updatedComic = payload.comic;

      if (!response.ok || !updatedComic) {
        throw new Error(payload.error ?? "保存漫画元数据失败。");
      }

      const rowPatch = {
        displayTitle: updatedComic.displayTitle,
        metadataQueryTitle: updatedComic.metadataQueryTitle,
        originalTitle: updatedComic.originalTitle,
        updatedAt: updatedComic.updatedAt,
      };

      setRows((current) => current.map((row) => (row.id === updatedComic.id ? { ...row, ...rowPatch } : row)));
      setEditTarget((current) => (current?.id === updatedComic.id ? { ...current, ...rowPatch } : current));
      setMetadataDraft({
        displayTitle: updatedComic.displayTitle,
        metadataQueryTitle: updatedComic.metadataQueryTitle ?? "",
        originalTitle: updatedComic.originalTitle ?? "",
      });
      setMetadataMessage("漫画元数据已保存。");
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : "保存漫画元数据失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function regenerateCover(comic: LibraryComicAdminRowRecord) {
    setPendingAction(`${comic.id}:cover:regenerate`);
    setCoverError("");
    setCoverMessage("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/cover`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        result?: { generatedCount: number; removedCacheCount: number; mangaFilesTouched: boolean };
        error?: string;
      };

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

  function clearChapterCache(...comicIds: Array<string | null | undefined>) {
    const ids = comicIds.filter((id): id is string => Boolean(id));

    if (ids.length === 0) {
      return;
    }

    if (editTarget && ids.includes(editTarget.id)) {
      setIsLoadingChapters(true);
    }

    setChaptersByComicId((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setChapterDraftsByComicId((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }

  async function changeComicStatus(comic: LibraryComicAdminRowRecord, action: ComicMaintenanceAction) {
    const actionKey = `${comic.id}:${action}`;
    setPendingAction(actionKey);
    setActionError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        comic?: { id: string; status: LibraryComicAdminRowRecord["status"] };
        error?: string;
      };

      const updatedComic = payload.comic;

      if (!response.ok || !updatedComic) {
        throw new Error(payload.error ?? "漫画状态更新失败。");
      }

      setRows((current) => current.map((row) => (row.id === updatedComic.id ? { ...row, status: updatedComic.status } : row)));
      setEditTarget((current) => (current?.id === updatedComic.id ? { ...current, status: updatedComic.status } : current));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "漫画状态更新失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function mergeComicAsChapter(comic: LibraryComicAdminRowRecord) {
    if (!selectedMergeTargetId) {
      return;
    }

    setPendingAction(`${comic.id}:merge`);
    setMergeError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetComicId: selectedMergeTargetId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { comics?: LibraryComicAdminRowRecord[]; error?: string };

      if (!response.ok || !payload.comics) {
        throw new Error(payload.error ?? "合并章节失败。");
      }

      setRows(payload.comics);
      clearChapterCache(comic.id, selectedMergeTargetId);
      setEditTarget(payload.comics.find((row) => row.id === comic.id) ?? null);
      setIsLoadingChapters(false);
      setSelectedMergeTargetId(null);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "合并章节失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function restoreMergedComic(comic: LibraryComicAdminRowRecord) {
    const parentComicId = comic.parentComicId;

    setPendingAction(`${comic.id}:merge:restore`);
    setMergeError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/merge`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { comics?: LibraryComicAdminRowRecord[]; error?: string };

      if (!response.ok || !payload.comics) {
        throw new Error(payload.error ?? "恢复合并漫画失败。");
      }

      setRows(payload.comics);
      clearChapterCache(comic.id, parentComicId);
      setEditTarget(payload.comics.find((row) => row.id === comic.id) ?? null);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "恢复合并漫画失败。");
    } finally {
      setPendingAction(null);
    }
  }

  function reorderChapterDraft(fromIndex: number, toIndex: number) {
    if (!editTarget || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= currentChapters.length) {
      return;
    }

    const nextChapters = [...currentChapters];
    const [movedChapter] = nextChapters.splice(fromIndex, 1);

    if (!movedChapter) {
      return;
    }

    nextChapters.splice(toIndex, 0, movedChapter);
    setChapterDraftsByComicId((current) => ({ ...current, [editTarget.id]: nextChapters }));
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

  async function saveChapterOrder(comic: LibraryComicAdminRowRecord) {
    setPendingAction(`${comic.id}:chapters:order`);
    setChapterError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/chapters/order`, {
        method: "PATCH",
        body: JSON.stringify({ chapterIds: currentChapters.map((chapter) => chapter.id) }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { chapters?: LibraryChapterRecord[]; error?: string };

      if (!response.ok || !payload.chapters) {
        throw new Error(payload.error ?? "保存章节顺序失败。");
      }

      setChaptersByComicId((current) => ({ ...current, [comic.id]: payload.chapters ?? [] }));
      setChapterDraftsByComicId((current) => ({ ...current, [comic.id]: payload.chapters ?? [] }));
    } catch (error) {
      setChapterError(error instanceof Error ? error.message : "保存章节顺序失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function addTagToComic(comic: LibraryComicAdminRowRecord) {
    if (!selectedTagId) {
      return;
    }

    setPendingAction(`${comic.id}:tag:add`);
    setTagError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tagId: selectedTagId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { tags?: AssignedComicTag[]; error?: string };

      if (!response.ok || !payload.tags) {
        throw new Error(payload.error ?? "绑定漫画标签失败。");
      }

      setAssignedTagsByComicId((current) => ({ ...current, [comic.id]: payload.tags ?? [] }));
      setSelectedTagId(null);
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "绑定漫画标签失败。");
    } finally {
      setPendingAction(null);
    }
  }

  async function removeTagFromComic(comic: LibraryComicAdminRowRecord, tagId: string) {
    setPendingAction(`${comic.id}:tag:remove:${tagId}`);
    setTagError("");

    try {
      const response = await fetch(`/api/comics/${comic.id}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tagId }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as { tags?: AssignedComicTag[]; error?: string };

      if (!response.ok || !payload.tags) {
        throw new Error(payload.error ?? "移除漫画标签失败。");
      }

      setAssignedTagsByComicId((current) => ({ ...current, [comic.id]: payload.tags ?? [] }));
    } catch (error) {
      setTagError(error instanceof Error ? error.message : "移除漫画标签失败。");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Library size={22} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>
            漫画管理
          </Text>
          <Text size="sm" c="ink.5">
            查看扫描结果、文件状态和需要维护的漫画记录。
          </Text>
        </Box>
      </Box>

      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="搜索漫画名称、作者或状态..."
          leftSection={<Search size={16} style={{ color: "var(--mantine-color-ink-5)" }} />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1, maxWidth: 420 }}
          styles={{
            input: {
              borderColor: "var(--mantine-color-pink-2)",
              borderRadius: "var(--mantine-radius-md)",
              "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
            },
          }}
        />
      </Group>

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w="auto">
                标题
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={110}>
                格式
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={80}>
                页数
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>
                状态
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={80}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginated.map((comic) => (
              <Table.Tr key={comic.id}>
                <Table.Td>
                  <Text fw={700} size="sm" truncate>
                    {comic.displayTitle}
                  </Text>
                  <Text size="xs" c="ink.5" truncate>
                    {comic.fileTitle}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatKind(comic.localFileKind)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{comic.pageCount}</Text>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={comic.status} missing={comic.isPrimaryFileMissing} merged={Boolean(comic.parentComicId || comic.mergedAsChapterId)} />
                </Table.Td>
                <Table.Td>
                  <AppButton variant="outline" size="xs" onClick={() => openComic(comic)}>
                    查看
                  </AppButton>
                </Table.Td>
              </Table.Tr>
            ))}
            {paginated.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="ink.5" ta="center" py="md">
                    没有找到匹配的漫画
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>

      <Group justify="flex-end" mt="md" gap="md" wrap="wrap">
        <Group gap="sm">
          <Text size="sm" c="ink.5">
            共 {total} 条
          </Text>
          <Select
            value={pageSize}
            onChange={(value) => {
              setPageSize(value ?? "10");
              setPage(1);
            }}
            data={PAGE_SIZE_OPTIONS}
            w={120}
            styles={{
              input: {
                borderColor: "var(--mantine-color-pink-2)",
                borderRadius: "var(--mantine-radius-md)",
                "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
              },
            }}
          />
        </Group>
        {totalPages > 1 && <Pagination total={totalPages} value={page} onChange={setPage} color="pink" withEdges />}
      </Group>

      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="漫画信息"
        size="xl"
        styles={{
          title: { fontWeight: 700, fontSize: "18px" },
          header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
        }}
      >
        {editTarget && (
          <Stack gap="md" py="sm">
            <Text size="xs" c="ink.5" ff="monospace">
              {editTarget.fileTitle}
            </Text>

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "white",
              }}
            >
              <Group justify="space-between" align="center" mb="sm">
                <Box>
                  <Text size="sm" fw={700} c="ink.8">
                    标题与元数据
                  </Text>
                  <Text size="xs" c="ink.5" mt={2}>
                    文件标题保留扫描来源，不会被这里的编辑覆盖。
                  </Text>
                </Box>
                <AppButton
                  size="xs"
                  leftSection={<Save size={14} />}
                  disabled={!metadataDraft.displayTitle.trim()}
                  loading={pendingAction === `${editTarget.id}:metadata`}
                  onClick={() => saveComicMetadata(editTarget)}
                >
                  保存信息
                </AppButton>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <AppInput
                  label="展示标题"
                  value={metadataDraft.displayTitle}
                  onChange={(event) => setMetadataDraft((current) => ({ ...current, displayTitle: event.currentTarget.value }))}
                />
                <AppInput label="文件标题" value={editTarget.fileTitle} readOnly />
                <AppInput
                  label="原始标题"
                  value={metadataDraft.originalTitle}
                  onChange={(event) => setMetadataDraft((current) => ({ ...current, originalTitle: event.currentTarget.value }))}
                />
                <AppInput
                  label="元数据查询标题"
                  value={metadataDraft.metadataQueryTitle}
                  onChange={(event) => setMetadataDraft((current) => ({ ...current, metadataQueryTitle: event.currentTarget.value }))}
                />
                <AppInput label="格式" value={formatKind(editTarget.localFileKind)} readOnly />
                <AppInput label="状态" value={statusLabel(editTarget.status, editTargetIsMerged)} readOnly />
              </SimpleGrid>

              {metadataMessage && (
                <Text size="sm" c="green.7" mt="xs">
                  {metadataMessage}
                </Text>
              )}
              {metadataError && (
                <Text size="sm" c="red.7" mt="xs">
                  {metadataError}
                </Text>
              )}
            </Box>

            <AppInput label="本地路径" value={editTarget.primaryLocalPath ?? "未关联主文件"} readOnly />

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "white",
              }}
            >
              <Group justify="space-between" align="center" gap="sm">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={700} c="ink.8">
                    封面缓存
                  </Text>
                  <Text size="xs" c="ink.5" mt={2}>
                    清理旧封面缓存后，从当前封面页重新生成列表封面和详情封面。
                  </Text>
                </Box>
                <AppButton
                  variant="outline"
                  leftSection={<RefreshCw size={15} />}
                  disabled={editTarget.status !== "readable" || editTarget.isPrimaryFileMissing}
                  loading={pendingAction === `${editTarget.id}:cover:regenerate`}
                  onClick={() => regenerateCover(editTarget)}
                >
                  重新生成封面
                </AppButton>
              </Group>

              {coverMessage && (
                <Text size="sm" c="green.7" mt="xs">
                  {coverMessage}
                </Text>
              )}
              {coverError && (
                <Text size="sm" c="red.7" mt="xs">
                  {coverError}
                </Text>
              )}
            </Box>

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "white",
              }}
            >
              <Group justify="space-between" align="flex-start" mb="xs">
                <Box>
                  <Text size="sm" fw={700} c="ink.8">
                    漫画标签
                  </Text>
                  <Text size="xs" c="ink.5" mt={2}>
                    绑定 canonical 标签后，前台搜索和标签筛选会立即使用这些关系。
                  </Text>
                </Box>
                {isLoadingTags && (
                  <Text size="xs" c="ink.5">
                    读取中...
                  </Text>
                )}
              </Group>

              <Group gap={8} wrap="wrap" mb="sm">
                {currentTags.length > 0 ? (
                  currentTags.map((tag) => (
                    <AppButton
                      key={tag.id}
                      variant="outline"
                      size="xs"
                      rightSection={<X size={13} />}
                      loading={pendingAction === `${editTarget.id}:tag:remove:${tag.id}`}
                      onClick={() => removeTagFromComic(editTarget, tag.id)}
                    >
                      {tagDisplayLabel(tag)}
                    </AppButton>
                  ))
                ) : (
                  <Text size="sm" c="ink.5">
                    暂未绑定标签。
                  </Text>
                )}
              </Group>

              <Group gap="sm" align="flex-end">
                <AppSelect
                  searchable
                  clearable
                  label="添加标签"
                  placeholder={availableTagOptions.length > 0 ? "选择标签" : "没有可添加的标签"}
                  value={selectedTagId}
                  onChange={setSelectedTagId}
                  data={availableTagOptions}
                  disabled={availableTagOptions.length === 0}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <AppButton
                  leftSection={<Plus size={15} />}
                  disabled={!selectedTagId}
                  loading={pendingAction === `${editTarget.id}:tag:add`}
                  onClick={() => addTagToComic(editTarget)}
                >
                  绑定
                </AppButton>
              </Group>

              {tagError && (
                <Text size="sm" c="red.7" mt="xs">
                  {tagError}
                </Text>
              )}
            </Box>

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "white",
              }}
            >
              <Group justify="space-between" align="center" mb="sm">
                <Box>
                  <Text size="sm" fw={700} c="ink.8">
                    章节顺序
                  </Text>
                  {isLoadingChapters && (
                    <Text size="xs" c="ink.5" mt={2}>
                      读取中...
                    </Text>
                  )}
                </Box>
                <AppButton
                  size="xs"
                  leftSection={<Save size={14} />}
                  disabled={!canReorderChapters || !chapterOrderChanged}
                  loading={pendingAction === `${editTarget.id}:chapters:order`}
                  onClick={() => saveChapterOrder(editTarget)}
                >
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
                        <AppButton
                          aria-label="上移章节"
                          variant="outline"
                          size="xs"
                          disabled={!canReorderChapters || index === 0}
                          onClick={() => moveChapter(chapter.id, -1)}
                        >
                          <ArrowUp size={14} />
                        </AppButton>
                        <AppButton
                          aria-label="下移章节"
                          variant="outline"
                          size="xs"
                          disabled={!canReorderChapters || index === currentChapters.length - 1}
                          onClick={() => moveChapter(chapter.id, 1)}
                        >
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

              {chapterError && (
                <Text size="sm" c="red.7" mt="xs">
                  {chapterError}
                </Text>
              )}
            </Box>

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "white",
              }}
            >
              <Text size="sm" fw={700} c="ink.8">
                章节合并
              </Text>
              <Text size="xs" c="ink.5" mt={2} mb="sm">
                合并只移动数据库章节归属，不移动、不复制、不删除真实文件。MVP 仅支持单章节漫画。
              </Text>

              {editTargetIsMerged ? (
                <Group justify="space-between" align="center">
                  <Text size="sm" c="ink.6">
                    已合并到：{parentComic?.displayTitle ?? editTarget.parentComicId}
                  </Text>
                  <AppButton
                    variant="outline"
                    leftSection={<RotateCcw size={15} />}
                    loading={pendingAction === `${editTarget.id}:merge:restore`}
                    onClick={() => restoreMergedComic(editTarget)}
                  >
                    恢复为独立漫画
                  </AppButton>
                </Group>
              ) : (
                <Group gap="sm" align="flex-end">
                  <AppSelect
                    searchable
                    clearable
                    label="合并到目标漫画"
                    placeholder={mergeTargetOptions.length > 0 ? "选择目标漫画" : "没有可合并的目标"}
                    value={selectedMergeTargetId}
                    onChange={setSelectedMergeTargetId}
                    data={mergeTargetOptions}
                    disabled={editTarget.status !== "readable" || mergeTargetOptions.length === 0}
                    style={{ flex: 1, minWidth: 220 }}
                  />
                  <AppButton
                    leftSection={<GitMerge size={15} />}
                    disabled={editTarget.status !== "readable" || !selectedMergeTargetId}
                    loading={pendingAction === `${editTarget.id}:merge`}
                    onClick={() => mergeComicAsChapter(editTarget)}
                  >
                    合并为章节
                  </AppButton>
                </Group>
              )}

              {mergeError && (
                <Text size="sm" c="red.7" mt="xs">
                  {mergeError}
                </Text>
              )}
            </Box>

            <Box
              p="sm"
              style={{
                border: "1px solid var(--mantine-color-pink-1)",
                borderRadius: 10,
                background: "var(--mantine-color-pink-0)",
              }}
            >
              <Text size="sm" fw={700} c="ink.8">
                记录维护不会移动或删除真实文件
              </Text>
              <Text size="xs" c="ink.5" mt={2}>
                隐藏会从前台列表移除；软删除只是标记数据库记录，后续可从后台恢复。
              </Text>
            </Box>

            {actionError && (
              <Text size="sm" c="red.7">
                {actionError}
              </Text>
            )}

            <Group justify="flex-end" mt="sm">
              <AppButton variant="outline" onClick={() => setEditTarget(null)}>
                关闭
              </AppButton>
              {!editTargetIsMerged && (editTarget.status === "hidden" || editTarget.status === "deleted") ? (
                <AppButton
                  variant="outline"
                  leftSection={<RotateCcw size={15} />}
                  loading={pendingAction === `${editTarget.id}:restore`}
                  onClick={() => changeComicStatus(editTarget, "restore")}
                >
                  恢复记录
                </AppButton>
              ) : !editTargetIsMerged ? (
                <AppButton
                  variant="outline"
                  leftSection={<EyeOff size={15} />}
                  loading={pendingAction === `${editTarget.id}:hide`}
                  onClick={() => changeComicStatus(editTarget, "hide")}
                >
                  隐藏
                </AppButton>
              ) : null}
              {!editTargetIsMerged && editTarget.status !== "deleted" && (
                <AppButton
                  color="red"
                  variant="outline"
                  leftSection={<Trash2 size={15} />}
                  loading={pendingAction === `${editTarget.id}:soft_delete`}
                  onClick={() => changeComicStatus(editTarget, "soft_delete")}
                >
                  软删除
                </AppButton>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
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
        minHeight: 24,
        padding: "0 8px",
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
