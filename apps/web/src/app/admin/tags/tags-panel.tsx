"use client";

import { ActionIcon, Box, Group, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput, AppSelect } from "@/components/ui/app-components";
import type { CanonicalTag } from "@/modules/tags";
import { namespaceLabel, namespaceOptionLabel, tagDisplayLabel } from "@/modules/tags";

export function TagsPanel({ tags }: { tags: Array<CanonicalTag & { comicCount: number }> }) {
  const [search, setSearch] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState<string | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<(CanonicalTag & { comicCount: number }) | null>(null);

  const namespaceOptions = useMemo(() => {
    const seen = new Set(tags.map((tag) => tag.namespace));
    return Array.from(seen)
      .sort((a, b) => namespaceLabel(a).localeCompare(namespaceLabel(b), "zh-Hans-CN"))
      .map((namespace) => ({ value: namespace, label: namespaceOptionLabel(namespace) }));
  }, [tags]);

  const filtered = useMemo(() => {
    let list = tags;
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
  }, [namespaceFilter, search, tags]);

  const openAdd = () => {
    setEditTarget(null);
    open();
  };

  const openEdit = (item: CanonicalTag & { comicCount: number }) => {
    setEditTarget(item);
    open();
  };

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
                      <Tooltip label="编辑标签后续实现" withArrow>
                        <ActionIcon variant="subtle" color="ink" size="md" onClick={() => openEdit(tag)} aria-label={`编辑 ${tag.canonical}`}>
                          <Pencil size={15} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="删除后续实现" withArrow>
                        <ActionIcon variant="subtle" color="red" size="md" disabled aria-label={`删除 ${tag.canonical}`}>
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

      <Modal
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
            value={editTarget?.namespace ?? null}
            searchable
            clearable={false}
            nothingFoundMessage="无匹配分类"
            comboboxProps={{ withinPortal: false }}
            disabled
          />
          <AppInput label="英文标签名" placeholder="例如: sole female" value={editTarget?.name ?? ""} readOnly />
          <AppInput label="中文翻译" placeholder="例如: 单女主" value={editTarget?.displayNameZh ?? ""} readOnly />
          <Group justify="flex-end" mt="sm">
            <AppButton variant="outline" onClick={close}>
              取消
            </AppButton>
            <AppButton leftSection={<Plus size={16} />} disabled>
              {editTarget ? "保存" : "添加"}
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
