"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Folder, Pencil, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { AppButton, AppInput, DraggableModal } from "@/components/ui/app-components";
import { scanPaths, type ScanPath } from "@/lib/mock-data";

const STATUS_MAP: Record<ScanPath["status"], { label: string; bg: string; color: string }> = {
  ok: { label: "正常", bg: "#d9f9e6", color: "#009b52" },
  missing: { label: "路径不存在", bg: "#ffe1e1", color: "#ec3c45" },
  scanning: { label: "扫描中…", bg: "#fff3d6", color: "#b87a00" },
};

function StatusBadge({ status }: { status: ScanPath["status"] }) {
  const s = STATUS_MAP[status];
  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 26,
        padding: "0 10px",
        borderRadius: 8,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </Box>
  );
}

export default function PathsPage() {
  const [search, setSearch] = useState("");
  const [opened, { open, close }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<ScanPath | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scanPaths;
    return scanPaths.filter((p) => p.path.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [search]);

  const totalPaths = scanPaths.length;
  const okPaths = scanPaths.filter((p) => p.status === "ok").length;
  const totalComics = scanPaths.reduce((sum, p) => sum + p.comicCount, 0);

  const openAdd = () => {
    setEditTarget(null);
    open();
  };

  const openEdit = (item: ScanPath) => {
    setEditTarget(item);
    open();
  };

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      {/* Header */}
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Folder size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>漫画路径管理</Text>
          <Text size="sm" c="ink.5">管理漫画扫描路径，添加本地目录或网络共享文件夹，系统将自动扫描并同步漫画。</Text>
        </Box>
      </Box>

      {/* Stats row */}
      <Group gap="xl" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>总路径</Text>
          <Text fw={900} size="lg" c="ink.7">{totalPaths}</Text>
        </Box>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>可用路径</Text>
          <Text fw={900} size="lg" c="#009b52">{okPaths}</Text>
        </Box>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>扫描漫画总数</Text>
          <Text fw={900} size="lg" c="pink.5">{totalComics}</Text>
        </Box>
      </Group>

      {/* Toolbar */}
      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="搜索路径或描述…"
          leftSection={<Search size={16} style={{ color: "var(--mantine-color-ink-5)" }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 420 }}
          styles={{
            input: {
              borderColor: "var(--mantine-color-pink-2)",
              borderRadius: "var(--mantine-radius-md)",
              "&:focus": { borderColor: "var(--mantine-color-pink-5)" },
            },
          }}
        />
        <AppButton leftSection={<Plus size={16} />} onClick={openAdd}>添加路径</AppButton>
      </Group>

      {/* Table */}
      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e">路径</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>描述</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>状态</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={90}>漫画数量</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>上次扫描</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Text
                    component="code"
                    size="sm"
                    style={{
                      fontFamily: "var(--mantine-font-family-monospace)",
                      overflowWrap: "anywhere",
                      color: "#201422",
                    }}
                  >
                    {item.path}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{item.description}</Text>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={item.status} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{item.comicCount}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="ink.5">{item.lastScanAt}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="重新扫描" withArrow>
                      <ActionIcon variant="subtle" color="pink.5" size="md" aria-label={`扫描 ${item.path}`}>
                        <RefreshCcw size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="编辑" withArrow>
                      <ActionIcon variant="subtle" color="ink.5" size="md" onClick={() => openEdit(item)} aria-label={`编辑 ${item.path}`}>
                        <Pencil size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="删除" withArrow>
                      <ActionIcon variant="subtle" color="red" size="md" aria-label={`删除 ${item.path}`}>
                        <Trash2 size={15} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {filtered.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text size="sm" c="ink.5" ta="center" py="md">
                    没有找到匹配的路径
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>

      {/* Add / Edit Modal */}
      <DraggableModal
        opened={opened}
        onClose={close}
        title={editTarget ? "编辑路径" : "添加路径"}
        size="lg"
        styles={{
          title: { fontWeight: 700, fontSize: "18px" },
          header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
        }}
      >
        <Stack gap="md" py="sm">
          <AppInput
            label="文件夹路径"
            placeholder="D:\Comics\Manga 或 \\NAS\shared\comics"
            defaultValue={editTarget?.path ?? ""}
          />
          <AppInput
            label="描述（可选）"
            placeholder="例如：主漫画库、下载待整理"
            defaultValue={editTarget?.description ?? ""}
          />
          <Group justify="flex-end" mt="sm">
            <AppButton variant="outline" onClick={close}>取消</AppButton>
            <AppButton leftSection={<Plus size={16} />}>
              {editTarget ? "保存" : "添加"}
            </AppButton>
          </Group>
        </Stack>
      </DraggableModal>
    </Box>
  );
}
