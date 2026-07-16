"use client";

import { Box, Group, Pagination, Select, Table, Text, TextInput } from "@mantine/core";
import { Library, Search } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppButton } from "@/components/ui/app-components";
import type { LibraryComicAdminRowRecord } from "@/modules/library";

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 条/页" },
  { value: "20", label: "20 条/页" },
  { value: "50", label: "50 条/页" },
];

export function ComicsPanel({ comics }: { comics: LibraryComicAdminRowRecord[] }) {
  const [page, setPage] = useAdminTabState("page", 1);
  const [pageSize, setPageSize] = useAdminTabState("pageSize", "10");
  const [search, setSearch] = useAdminTabState("search", "");
  const [statusFilter, setStatusFilter] = useAdminTabState("statusFilter", "all");

  const filtered = useMemo(() => {
    // Server already excludes soft-deleted; client only filters remaining statuses.
    let rows = comics;
    if (statusFilter !== "all") {
      rows = rows.filter((comic) => comic.status === statusFilter);
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((comic) =>
      [comic.displayTitle, comic.fileTitle, comic.originalTitle ?? "", comic.metadataQueryTitle ?? "", comic.status, comic.localFileKind ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [comics, search, statusFilter]);

  const limit = Number(pageSize);
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

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

      <Group justify="space-between" mb="md" align="flex-end" wrap="wrap">
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
        <Select
          label="状态"
          data={[
            { value: "all", label: "全部" },
            { value: "readable", label: "可读" },
            { value: "missing_local_file", label: "缺文件" },
            { value: "remote_only", label: "仅远程" },
            { value: "hidden", label: "已隐藏" },
          ]}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value || "all");
            setPage(1);
          }}
          allowDeselect={false}
          w={160}
          size="sm"
        />
      </Group>

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e">
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
              <Table.Th fw={900} c="#8d5a6e" w={86}>
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
                  <AppButton component={Link} href={`/admin/comics/${comic.id}`} variant="outline" size="xs">
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
