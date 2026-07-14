"use client";

import { Box, Group, Stack, Table, Text } from "@mantine/core";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AppBadge, AppButton, AppInput, AppSelect, AppSwitch, AppTextarea, AppTitle } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type {
  CollectionEventOperation,
  CollectionEventRecord,
  CollectionKind,
  CollectionRecord,
  CollectionSortMode,
} from "@/modules/collections";

type CollectionsApiResponse = {
  collections?: CollectionRecord[];
  events?: CollectionEventRecord[];
  collection?: CollectionRecord;
  error?: string;
};

export function CollectionsPanel({
  collections: initialCollections,
  events: initialEvents,
}: {
  collections: CollectionRecord[];
  events: CollectionEventRecord[];
}) {
  const [collections, setCollections] = useState<CollectionRecord[]>(initialCollections);
  const [events, setEvents] = useState<CollectionEventRecord[]>(initialEvents);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CollectionKind>("collection");
  const [sortMode, setSortMode] = useState<CollectionSortMode>("manual");
  const [pending, setPending] = useState(false);

  async function refresh() {
    const response = await fetch("/api/collections", { cache: "no-store" }).then((res) => res.json() as Promise<CollectionsApiResponse>);
    if (response.collections) {
      setCollections(response.collections);
    }
    if (response.events) {
      setEvents(response.events);
    }
  }

  async function createCollection() {
    if (!name.trim()) {
      toast.error("收藏夹名称不能为空。");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, kind, sortMode }),
      }).then((res) => res.json() as Promise<CollectionsApiResponse>);
      if (response.error) {
        toast.error(response.error);
      } else {
        setName("");
        setDescription("");
        await refresh();
        toast.success("收藏夹已创建");
      }
    } catch {
      toast.error("创建收藏夹失败。");
    } finally {
      setPending(false);
    }
  }

  async function toggleEnabled(collection: CollectionRecord) {
    setPending(true);
    try {
      const response = await fetch(`/api/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !collection.isEnabled }),
      }).then((res) => res.json() as Promise<CollectionsApiResponse>);
      if (response.error) {
        toast.error(response.error);
      } else {
        await refresh();
        toast.success(collection.isEnabled ? "已禁用收藏夹" : "已启用收藏夹");
      }
    } finally {
      setPending(false);
    }
  }

  async function deleteCollection(collection: CollectionRecord) {
    if (!window.confirm(`确认删除收藏夹「${collection.name}」？其中的漫画不会被删除。`)) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/collections/${collection.id}`, { method: "DELETE" }).then((res) => res.json() as CollectionsApiResponse);
      if (response.error) {
        toast.error(response.error);
      } else {
        await refresh();
        toast.success("收藏夹已删除");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Box>
          <AppTitle order={1}>收藏夹与阅读队列</AppTitle>
          <Text size="sm" c="ink.5" mt={6}>
            管理收藏分类和阅读队列。在前台「收藏」页面可浏览并开始队列阅读。
          </Text>
        </Box>
      </Group>

      <Box p="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 14, background: "white" }}>
        <AppTitle order={3} mb={12}>
          新建收藏夹
        </AppTitle>
        <Stack gap="sm">
          <AppInput label="名称" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="例如：想看的系列" />
          <AppTextarea label="描述（可选）" value={description} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="简短描述这个收藏夹的用途" autosize minRows={2} />
          <Group gap="md" grow>
            <AppSelect
              label="类型"
              value={kind}
              onChange={(value) => setKind((value as CollectionKind) ?? "collection")}
              data={[
                { value: "collection", label: "收藏夹" },
                { value: "queue", label: "阅读队列" },
              ]}
            />
            <AppSelect
              label="排序方式"
              value={sortMode}
              onChange={(value) => setSortMode((value as CollectionSortMode) ?? "manual")}
              data={[
                { value: "manual", label: "手动排序" },
                { value: "recent_added", label: "最近加入优先" },
                { value: "title", label: "按标题" },
              ]}
            />
          </Group>
          <Group justify="flex-end">
            <AppButton onClick={createCollection} loading={pending} leftSection={<Plus size={16} />}>
              创建
            </AppButton>
          </Group>
        </Stack>
      </Box>

      <Box p="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 14, background: "white" }}>
        <Group justify="space-between" mb={12}>
          <AppTitle order={3}>
            <Group gap={8}>
              <Bookmark size={18} />
              收藏夹列表
            </Group>
          </AppTitle>
          <Text size="xs" c="ink.5">
            共 {collections.length} 个
          </Text>
        </Group>
        {collections.length === 0 ? (
          <Text size="sm" c="ink.5" py={20} ta="center">
            暂无收藏夹。
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>名称</Table.Th>
                <Table.Th>类型</Table.Th>
                <Table.Th>漫画数</Table.Th>
                <Table.Th>排序</Table.Th>
                <Table.Th>启用</Table.Th>
                <Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {collections.map((collection) => (
                <Table.Tr key={collection.id}>
                  <Table.Td>
                    <Text fw={700} size="sm">
                      {collection.name}
                    </Text>
                    {collection.description ? (
                      <Text size="xs" c="ink.5" lineClamp={1}>
                        {collection.description}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <AppBadge color={collection.kind === "queue" ? "blue" : "pink"}>{collection.kind === "queue" ? "队列" : "收藏"}</AppBadge>
                  </Table.Td>
                  <Table.Td>{collection.comicCount}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="ink.5">
                      {collection.sortMode === "manual" ? "手动" : collection.sortMode === "recent_added" ? "最近" : "标题"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <AppSwitch checked={collection.isEnabled} onChange={() => toggleEnabled(collection)} disabled={pending} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <AppButton
                        component="a"
                        href={`/collections/${collection.id}`}
                        variant="text"
                        size="xs"
                      >
                        查看
                      </AppButton>
                      <AppButton onClick={() => deleteCollection(collection)} variant="text" size="xs" color="red" disabled={pending} leftSection={<Trash2 size={14} />}>
                        删除
                      </AppButton>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>

      {events.length > 0 ? (
        <Box p="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 14, background: "white" }}>
          <AppTitle order={3} mb={12}>
            最近操作
          </AppTitle>
          <Stack gap={6}>
            {events.slice(0, 10).map((event) => (
              <Group key={event.id} justify="space-between" gap={16} wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={700}>
                    {formatEventOperation(event.operation)} · {event.collectionName}
                  </Text>
                  <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                    {event.summary}
                  </Text>
                </Box>
                <Text size="xs" c="ink.5">
                  {formatDate(event.createdAt)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function formatEventOperation(operation: CollectionEventOperation) {
  const labels: Record<CollectionEventOperation, string> = {
    collection_create: "创建",
    collection_update: "更新",
    collection_delete: "删除",
    collection_add_comic: "加入",
    collection_remove_comic: "移出",
    collection_reorder: "重排",
  };
  return labels[operation] ?? operation;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
