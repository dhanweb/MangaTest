"use client";

import { useMemo, useState } from "react";
import { Box, Group, Pagination, Select, Table, Text, TextInput } from "@mantine/core";
import { Library, Search } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";
import { comics, statusLabel, type ComicStatus } from "@/lib/mock-data";

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 条/页" },
  { value: "20", label: "20 条/页" },
  { value: "50", label: "50 条/页" },
];

export default function ComicsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return comics;
    return comics.filter((comic) => {
      const text = [comic.title, comic.originalTitle, comic.artist, comic.fileTitle, comic.status].join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [search]);

  const limit = Number(pageSize);
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
        <Library size={22} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>漫画管理</Text>
          <Text size="sm" c="ink.5">查看扫描结果、文件状态和需要维护的漫画记录。</Text>
        </Box>
      </Box>

      {/* Toolbar */}
      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="搜索漫画名称、作者或状态..."
          leftSection={<Search size={16} style={{ color: "var(--mantine-color-ink-5)" }} />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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

      {/* Table */}
      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w="auto">标题</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>作者</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={80}>页数</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={100}>状态</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={80}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginated.map((comic) => (
              <Table.Tr key={comic.id}>
                <Table.Td>
                  <Text fw={700} size="sm" truncate>
                    {comic.title}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{comic.artist}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{comic.pages}</Text>
                </Table.Td>
                <Table.Td>
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
                      background:
                        comic.status === "ready" || comic.status === "tagged"
                          ? "#e4f9ed"
                          : "#ffe3e6",
                      color:
                        comic.status === "ready" || comic.status === "tagged"
                          ? "#00894a"
                          : "#d93a4e",
                    }}
                  >
                    {statusLabel[comic.status]}
                  </Box>
                </Table.Td>
                <Table.Td>
                  <AppButton variant="outline" size="xs">
                    编辑
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

      {/* Pagination row */}
      <Group justify="flex-end" mt="md" gap="md" wrap="wrap">
        <Group gap="sm">
          <Text size="sm" c="ink.5">共 {total} 条</Text>
          <Select
            value={pageSize}
            onChange={(v) => { setPageSize(v ?? "10"); setPage(1); }}
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
        {totalPages > 1 && (
          <Pagination
            total={totalPages}
            value={page}
            onChange={setPage}
            color="pink"
            withEdges
          />
        )}
      </Group>
    </Box>
  );
}
