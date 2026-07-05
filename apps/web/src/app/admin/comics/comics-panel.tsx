"use client";

import { Box, Group, Modal, Pagination, Select, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { EyeOff, Library, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";
import type { ComicMaintenanceAction, LibraryComicAdminRowRecord } from "@/modules/library";

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 条/页" },
  { value: "20", label: "20 条/页" },
  { value: "50", label: "50 条/页" },
];

export function ComicsPanel({ comics }: { comics: LibraryComicAdminRowRecord[] }) {
  const [rows, setRows] = useState(() => comics);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<LibraryComicAdminRowRecord | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((comic) => {
      const text = [comic.displayTitle, comic.fileTitle, comic.status, comic.localFileKind ?? ""].join(" ").toLowerCase();
      return text.includes(query);
    });
  }, [rows, search]);

  const limit = Number(pageSize);
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

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
                  <StatusBadge status={comic.status} missing={comic.isPrimaryFileMissing} />
                </Table.Td>
                <Table.Td>
                  <AppButton variant="outline" size="xs" onClick={() => setEditTarget(comic)}>
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

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <AppInput label="标题" value={editTarget.displayTitle} readOnly />
              <AppInput label="文件标题" value={editTarget.fileTitle} readOnly />
              <AppInput label="格式" value={formatKind(editTarget.localFileKind)} readOnly />
              <AppInput label="状态" value={statusLabel(editTarget.status)} readOnly />
            </SimpleGrid>

            <AppInput label="本地路径" value={editTarget.primaryLocalPath ?? "未关联主文件"} readOnly />

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
              {editTarget.status === "hidden" || editTarget.status === "deleted" ? (
                <AppButton
                  variant="outline"
                  leftSection={<RotateCcw size={15} />}
                  loading={pendingAction === `${editTarget.id}:restore`}
                  onClick={() => changeComicStatus(editTarget, "restore")}
                >
                  恢复记录
                </AppButton>
              ) : (
                <AppButton
                  variant="outline"
                  leftSection={<EyeOff size={15} />}
                  loading={pendingAction === `${editTarget.id}:hide`}
                  onClick={() => changeComicStatus(editTarget, "hide")}
                >
                  隐藏
                </AppButton>
              )}
              {editTarget.status !== "deleted" && (
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

function StatusBadge({ status, missing }: { status: LibraryComicAdminRowRecord["status"]; missing: boolean }) {
  const problem = missing || status !== "readable";

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
      {missing ? "缺文件" : statusLabel(status)}
    </Box>
  );
}

function statusLabel(status: LibraryComicAdminRowRecord["status"]) {
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
