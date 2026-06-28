"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Stack,
  Text,
  SimpleGrid,
  Popover,
} from "@mantine/core";
import { Edit3, Heart, Play, Star } from "lucide-react";
import { CoverBlock } from "@/components/SiteHeader";
import {
  AppBadge,
  AppButton,
  AppInput,
  AppLink,
  AppModal,
  AppSelect,
  AppTextarea,
  useAppModal,
} from "@/components/ui/app-components";
import { type Comic, type ComicStatus, statusOptions, tagGroups } from "@/lib/mock-data";

type EditableComic = Pick<
  Comic,
  "artist" | "group" | "localPath" | "note" | "originalTitle" | "source" | "status" | "tags" | "title"
>;

function createDraft(comic: Comic): EditableComic {
  return {
    artist: comic.artist,
    group: comic.group,
    localPath: comic.localPath,
    note: comic.note,
    originalTitle: comic.originalTitle,
    source: comic.source,
    status: comic.status,
    tags: comic.tags,
    title: comic.title,
  };
}

function tagValue(groupLabel: string, value: string) {
  return `${groupLabel.toLowerCase()}:${value}`;
}

function tagLabel(tag: string) {
  return tag.includes(":") ? tag.split(":").slice(1).join(":") : tag;
}

export function ComicDetailView({ comic }: { comic: Comic }) {
  const [savedComic, setSavedComic] = useState<EditableComic>(() => createDraft(comic));
  const [draftComic, setDraftComic] = useState<EditableComic>(() => createDraft(comic));
  const [favorite, setFavorite] = useState(true);
  const [dialogOpen, { open: openDialog, close: closeDialog }] = useAppModal(false);
  const firstChapter = comic.chapters[0];

  function updateDraft<F extends keyof EditableComic>(field: F, value: EditableComic[F]) {
    setDraftComic((cur) => ({ ...cur, [field]: value }));
  }

  function removeDraftTag(tag: string) {
    setDraftComic((cur) => ({ ...cur, tags: cur.tags.filter((t) => t !== tag) }));
  }

  function addDraftTagFromGroup(groupLabel: string) {
    const group = tagGroups.find((g) => g.label === groupLabel);
    if (!group) return;
    setDraftComic((cur) => {
      const next = group.values
        .map((v) => tagValue(group.label, v))
        .find((t) => !cur.tags.includes(t));
      return next ? { ...cur, tags: [...cur.tags, next] } : cur;
    });
  }

  function handleOpen() {
    setDraftComic(savedComic);
    openDialog();
  }

  function saveDraft() {
    setSavedComic(draftComic);
    closeDialog();
  }

  const statisticGrid = [
    { value: comic.episodes, label: "总话数" },
    { value: comic.pages, label: "总页数" },
    { value: comic.format, label: "格式" },
    { value: comic.fileSize, label: "文件大小" },
  ];

  return (
    <>
      <Flex direction={{ base: "column", sm: "row" }} gap={28} mb={42}>
        <CoverBlock title={`第1页 / 共${comic.pages}页`} color={comic.color} />
        <Box style={{ flex: 1 }}>
          <Text size="xs" fw={800} c="ink.5" mb={4}>
            {savedComic.status === "tagged" ? "Tagged" : savedComic.source}
          </Text>
          <Text component="h1" size="34px" fw={700} lh="1.15" c="pink.5" mb={4} mt={0}>
            {savedComic.title}
          </Text>
          <Text size="sm" c="ink.5" mb="md">{savedComic.originalTitle}</Text>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" my="lg">
            {statisticGrid.map((stat) => (
              <Box
                key={stat.label}
                style={{
                  display: "grid",
                  placeItems: "center",
                  minHeight: 70,
                  border: "1px solid var(--mantine-color-pink-2)",
                  borderRadius: 10,
                  background: "white",
                }}
              >
                <Text fw={700} size="lg" c="pink.5">{stat.value}</Text>
                <Text size="xs" c="ink.5">{stat.label}</Text>
              </Box>
            ))}
          </SimpleGrid>

          <Group gap={8} mb="xl" wrap="wrap">
            {savedComic.tags.map((tag) => (
              <AppBadge key={tag}>{tag}</AppBadge>
            ))}
          </Group>

          {savedComic.note && <Text size="sm" mb="xl" c="ink.7">{savedComic.note}</Text>}

          <Group gap={10} mt={28}>
            <AppLink href={`/reader/${comic.id}`} variant="filled">
              <Play size={16} />
              继续 {firstChapter?.title ?? "阅读"}
            </AppLink>
            <AppButton
              variant={favorite ? "light" : "outline"}
              color="pink"
              onClick={() => setFavorite((cur) => !cur)}
              leftSection={<Heart size={16} />}
            >
              {favorite ? "已收藏 (2)" : "收藏"}
            </AppButton>
            <AppButton
              variant="outline"
              onClick={handleOpen}
              leftSection={<Edit3 size={16} />}
            >
              编辑信息
            </AppButton>
          </Group>
        </Box>
      </Flex>

      {/* Chapter list */}
      <Box component="section">
        <Text component="h2" size="lg" fw={700} mb="md">章节列表</Text>
        <Stack gap={10}>
          {comic.chapters.map((chapter, index) => (
            <Box
              key={chapter.id}
              component={Link}
              href={`/reader/${comic.id}?chapter=${chapter.id}`}
              style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(0, 1fr) 22px",
                gap: 16,
                alignItems: "center",
                minHeight: 68,
                padding: "0 14px",
                borderRadius: 14,
                background: "white",
                textDecoration: "none",
                color: "inherit",
                transition: "background 160ms ease, box-shadow 160ms ease",
              }}
              className="chapter-link-hover"
            >
              <Box
                style={{
                  display: "grid",
                  width: 40,
                  height: 40,
                  placeItems: "center",
                  borderRadius: 10,
                  background: "var(--mantine-color-pink-5)",
                  color: "white",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                {comic.episodes - index}
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Text fw={700} size="sm">{chapter.title}</Text>
                <Text size="xs" c="ink.5" mt={4}>{chapter.pageCount} 页 · {chapter.addedAt} 添加</Text>
              </Box>
              <Star size={18} style={{ color: "var(--mantine-color-ink-5)" }} />
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Edit Dialog */}
      <AppModal opened={dialogOpen} onClose={closeDialog} title="编辑漫画信息">
        <ComicEditForm
          comic={comic}
          draft={draftComic}
          onTagAdd={addDraftTagFromGroup}
          onTagRemove={removeDraftTag}
          onUpdate={updateDraft}
        />
        <Group justify="flex-end" mt="md">
          <AppButton variant="outline" onClick={closeDialog}>取消</AppButton>
          <AppButton onClick={saveDraft}>保存更改</AppButton>
        </Group>
      </AppModal>
    </>
  );
}

function ComicEditForm({
  comic,
  draft,
  onTagAdd,
  onTagRemove,
  onUpdate,
}: {
  comic: Comic;
  draft: EditableComic;
  onTagAdd: (groupLabel: string) => void;
  onTagRemove: (tag: string) => void;
  onUpdate: <F extends keyof EditableComic>(field: F, value: EditableComic[F]) => void;
}) {
  const classifiedTags = tagGroups
    .map((group) => ({
      ...group,
      selectedTags: draft.tags.filter((tag) => tag.startsWith(`${group.label.toLowerCase()}:`)),
    }))
    .filter((group) => group.selectedTags.length > 0);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function confirmDelete() {
    if (deleteTarget) {
      onTagRemove(deleteTarget);
      setDeleteTarget(null);
    }
  }

  return (
    <Stack gap="md">
      <Text size="xs" c="ink.5">{comic.fileTitle}</Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <AppInput
          label="标题"
          value={draft.title}
          onChange={(e) => onUpdate("title", e.target.value)}
        />
        <AppInput
          label="原始标题"
          value={draft.originalTitle}
          onChange={(e) => onUpdate("originalTitle", e.target.value)}
        />
        <AppInput
          label="作者"
          value={draft.artist}
          onChange={(e) => onUpdate("artist", e.target.value)}
        />
        <AppInput
          label="组名"
          value={draft.group}
          onChange={(e) => onUpdate("group", e.target.value)}
        />
        <AppInput
          label="来源"
          value={draft.source}
          onChange={(e) => onUpdate("source", e.target.value)}
        />
        <AppSelect
          label="状态"
          value={draft.status}
          onChange={(value) => onUpdate("status", (value ?? "ready") as ComicStatus)}
          data={statusOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
        />
      </SimpleGrid>

      <AppInput
        label="本地路径"
        value={draft.localPath}
        onChange={(e) => onUpdate("localPath", e.target.value)}
        description="显示当前记录关联的本地文件位置。"
      />
      <AppTextarea
        label="备注"
        value={draft.note}
        onChange={(e) => onUpdate("note", e.target.value)}
        minRows={2}
      />

      {classifiedTags.length > 0 && (
        <Box>
          <Text component="h3" size="sm" fw={700} mb="sm" c="#8f526e">归类标签</Text>
          <Box
            p="md"
            style={{
              border: "1px dashed #ffb8d5",
              borderRadius: 10,
              background: "#fff4fa",
            }}
          >
            <Stack gap="sm">
              {classifiedTags.map((group) => (
                <Group key={group.label} gap={10} wrap="nowrap" align="flex-start">
                  <Text size="sm" fw={700} c="#b77792" w={100} ta="right" pt={4}>
                    {group.label}:
                  </Text>
                  <Group gap={7} wrap="wrap" style={{ flex: 1 }}>
                    {group.selectedTags.map((tag) => (
                      <Box
                        key={tag}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 7,
                          border: "1px solid var(--mantine-color-pink-2)",
                          background: "white",
                          overflow: "hidden",
                        }}
                      >
                        {/* Clicking the tag body = edit (placeholder) */}
                        <AppButton
                          variant="transparent"
                          size="xs"
                          onClick={() => {
                            /* TODO: open tag editor */
                          }}
                          styles={{
                            root: {
                              minHeight: 26,
                              padding: "0 9px",
                              color: "var(--mantine-color-pink-5)",
                              fontSize: 12,
                              fontWeight: 900,
                              transition: "background 160ms ease",
                              "&:hover": { background: "var(--mantine-color-pink-1)" },
                            },
                          }}
                        >
                          {tagLabel(tag)}
                        </AppButton>
                        {/* Clicking X = delete with popover confirm */}
                        <Popover
                          opened={deleteTarget === tag}
                          onChange={(opened) => {
                            if (!opened) setDeleteTarget(null);
                          }}
                          position="bottom-end"
                          withArrow
                          shadow="md"
                        >
                          <Popover.Target>
                            <ActionIcon
                              variant="transparent"
                              color="gray"
                              size={26}
                              onClick={() => setDeleteTarget(deleteTarget === tag ? null : tag)}
                              aria-label={`删除标签 ${tagLabel(tag)}`}
                              styles={{
                                root: {
                                  borderLeft: "1px solid var(--mantine-color-pink-2)",
                                  borderRadius: 0,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "var(--mantine-color-ink-5)",
                                },
                              }}
                            >
                              x
                            </ActionIcon>
                          </Popover.Target>
                          <Popover.Dropdown>
                            <Box style={{ maxWidth: 200 }}>
                              <Text size="xs" mb="sm" fw={500}>
                                确定删除「{tagLabel(tag)}」？
                              </Text>
                              <Group gap="xs" justify="flex-end">
                                <AppButton variant="outline" size="xs" onClick={() => setDeleteTarget(null)}>
                                  取消
                                </AppButton>
                                <AppButton size="xs" onClick={confirmDelete}>
                                  确认
                                </AppButton>
                              </Group>
                            </Box>
                          </Popover.Dropdown>
                        </Popover>
                      </Box>
                    ))}
                    <ActionIcon
                      variant="subtle"
                      color="pink"
                      size={28}
                      aria-label={`添加 ${group.label} 标签`}
                      onClick={() => onTagAdd(group.label)}
                      styles={{
                        root: {
                          border: "1px dashed var(--mantine-color-pink-2)",
                          "&:hover": { background: "var(--mantine-color-pink-1)" },
                        },
                      }}
                    >
                      +
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          </Box>
        </Box>
      )}

    </Stack>
  );
}
