"use client";

import { ActionIcon, Box, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton, AppInput, AppSelect, DraggableModal } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type { CanonicalTag } from "@/modules/tags";
import { NAMESPACE_LABELS, namespaceLabel, namespaceOptionLabel, tagDisplayLabel } from "@/modules/tags";

type TagRow = CanonicalTag & { comicCount: number };

interface TagFormState {
  id: string | null;
  namespace: string;
  name: string;
  displayNameZh: string;
}

const DEFAULT_TAG_FORM: TagFormState = {
  id: null,
  namespace: "other",
  name: "",
  displayNameZh: "",
};

export function TagsPanel({ tags }: { tags: TagRow[] }) {
  const [items, setItems] = useState(tags);
  const [search, setSearch] = useAdminTabState("search", "");
  const [namespaceFilter, setNamespaceFilter] = useAdminTabState<string | null>("namespaceFilter", null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<TagRow | null>(null);
  const [form, setForm] = useState<TagFormState>(DEFAULT_TAG_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const namespaceOptions = useMemo(() => {
    const seen = new Set([...Object.keys(NAMESPACE_LABELS), ...items.map((tag) => tag.namespace)]);
    return Array.from(seen)
      .sort((a, b) => namespaceLabel(a).localeCompare(namespaceLabel(b), "zh-Hans-CN"))
      .map((namespace) => ({ value: namespace, label: namespaceOptionLabel(namespace) }));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (namespaceFilter) {
      list = list.filter((tag) => tag.namespace === namespaceFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (tag) =>
          tag.name.toLowerCase().includes(query) ||
          tag.canonical.toLowerCase().includes(query) ||
          (tag.displayNameZh ?? "").toLowerCase().includes(query) ||
          namespaceLabel(tag.namespace).includes(query),
      );
    }

    return list;
  }, [namespaceFilter, search, items]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(DEFAULT_TAG_FORM);
    open();
  };

  const openEdit = (item: TagRow) => {
    setEditTarget(item);
    setForm({
      id: item.id,
      namespace: item.namespace,
      name: item.name,
      displayNameZh: item.displayNameZh ?? "",
    });
    open();
  };

  async function saveTag() {
    setIsSaving(true);

    const response = await fetch("/api/tags", {
      method: editTarget ? "PATCH" : "POST",
      body: JSON.stringify(form),
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json()) as { tag?: CanonicalTag; error?: string };

    if (!response.ok || !payload.tag) {
      toast.error(payload.error ?? "保存标签失败。");
      setIsSaving(false);
      return;
    }

    const saved: TagRow = {
      ...payload.tag,
      comicCount: editTarget?.comicCount ?? 0,
    };

    setItems((current) => {
      if (editTarget) {
        return current.map((item) => (item.id === saved.id ? saved : item));
      }

      return [...current, saved].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
    });
    setIsSaving(false);
    close();
    toast.success(editTarget ? "标签已更新" : "标签已创建");
  }

  async function deleteTag(item: TagRow) {
    if (item.comicCount > 0) {
      return;
    }
    if (!window.confirm(`只删除标签记录，不会修改漫画文件。\n\n确认删除 ${item.canonical}？`)) {
      return;
    }

    const response = await fetch("/api/tags", {
      method: "DELETE",
      body: JSON.stringify({ id: item.id }),
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json()) as { deleted?: boolean; error?: string };

    if (!response.ok || !payload.deleted) {
      toast.error(payload.error ?? "删除标签失败。");
      return;
    }

    setItems((current) => current.filter((tag) => tag.id !== item.id));
    toast.success("标签已删除");
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Tag size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>
            标签管理
          </Text>
          <Text size="sm" c="ink.5">
            管理 canonical 标签及中文翻译。标签按分类分组，前台通过翻译表显示中文。
          </Text>
        </Box>
      </Box>

      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <AppInput
            placeholder="搜索标签名或翻译..."
            leftSection={<Search size={16} style={{ color: "var(--mantine-color-ink-5)" }} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ width: 280 }}
          />
          <AppSelect
            placeholder="全部分类"
            data={namespaceOptions}
            value={namespaceFilter}
            onChange={setNamespaceFilter}
            clearable
            searchable
            nothingFoundMessage="无匹配分类"
            comboboxProps={{ withinPortal: false }}
            styles={{
              root: { width: 170 },
            }}
          />
        </Group>
        <AppButton leftSection={<Plus size={16} />} onClick={openAdd}>
          添加标签
        </AppButton>
      </Group>

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w={100}>
                分类
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                标签
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={90}>
                漫画数
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((tag) => {
              const nsLabel = namespaceLabel(tag.namespace);
              return (
                <Table.Tr key={tag.id}>
                  <Table.Td>
                    <Tooltip label={tag.namespace} withArrow disabled={nsLabel === tag.namespace}>
                      <Box
                        component="span"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 24,
                          padding: "0 8px",
                          borderRadius: 6,
                          fontWeight: 800,
                          fontSize: 12,
                          background: "#f3e8ff",
                          color: "#7c3aed",
                          cursor: nsLabel !== tag.namespace ? "default" : undefined,
                        }}
                      >
                        {nsLabel}
                      </Box>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {tagDisplayLabel(tag)}
                      <Text component="span" fw={400} c="ink.5" ml={6}>
                        ({tag.name})
                      </Text>
                    </Text>
                    <Text size="xs" c="ink.5" style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>
                      {tag.canonical}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {tag.comicCount}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="编辑标签" withArrow>
                        <ActionIcon variant="subtle" color="ink" size="md" onClick={() => openEdit(tag)} aria-label={`编辑 ${tag.canonical}`}>
                          <Pencil size={15} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={tag.comicCount > 0 ? "已有漫画绑定，不能删除" : "删除标签"} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="md"
                          disabled={tag.comicCount > 0}
                          onClick={() => deleteTag(tag)}
                          aria-label={`删除 ${tag.canonical}`}
                        >
                          <Trash2 size={15} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {filtered.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="ink.5" ta="center" py="md">
                    没有找到匹配的标签
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>

      <DraggableModal
        opened={opened}
        onClose={close}
        title={editTarget ? "编辑标签" : "添加标签"}
        size="md"
        styles={{
          title: { fontWeight: 700, fontSize: "18px" },
          header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
        }}
      >
        <Stack gap="md" py="sm">
          <AppSelect
            label="分类"
            placeholder="选择分类"
            data={namespaceOptions}
            value={form.namespace}
            onChange={(value) => setForm((current) => ({ ...current, namespace: value ?? "other" }))}
            searchable
            clearable={false}
            nothingFoundMessage="无匹配分类"
            comboboxProps={{ withinPortal: false }}
          />
          <AppInput
            label="英文标签名"
            placeholder="例如: sole female"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
          />
          <AppInput
            label="中文翻译"
            placeholder="例如: 单女主"
            value={form.displayNameZh}
            onChange={(event) => setForm((current) => ({ ...current, displayNameZh: event.currentTarget.value }))}
          />
          <Group justify="flex-end" mt="sm">
            <AppButton variant="outline" onClick={close}>
              取消
            </AppButton>
            <AppButton leftSection={<Plus size={16} />} loading={isSaving} onClick={saveTag}>
              {editTarget ? "保存" : "添加"}
            </AppButton>
          </Group>
        </Stack>
      </DraggableModal>
    </Box>
  );
}
