"use client";

import { Box, Group, Modal, Pagination, Select, Table, Text, TextInput, Tooltip, UnstyledButton, type TextProps } from "@mantine/core";
import { Library, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { useAdminTabs } from "@/components/admin-workbench/admin-tab-provider";
import { ComicCover } from "@/components/comic-cover";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useAdminTabState("statusFilter:v2", "readable");
  const [previewComic, setPreviewComic] = useState<LibraryComicAdminRowRecord | null>(null);
  const { refreshActiveTab } = useAdminTabs();

  useEffect(() => {
    setPage(1);
  }, [setPage, statusFilter]);

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
        [comic.displayTitle, comic.fileTitle, comic.authorNames.join(" "), comic.originalTitle ?? "", comic.metadataQueryTitle ?? "", comic.status, comic.localFileKind ?? ""]
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
        <AppButton variant="outline" size="xs" leftSection={<RefreshCw size={14} />} onClick={refreshActiveTab}>
          刷新
        </AppButton>
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
        <Table.ScrollContainer minWidth={920} type="native">
          <Table striped highlightOnHover layout="fixed" verticalSpacing="sm" horizontalSpacing="md" style={{ minWidth: 920 }}>
            <Table.Thead>
              <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
                <Table.Th fw={900} c="#8d5a6e" w={64}>
                  封面
                </Table.Th>
                <Table.Th fw={900} c="#8d5a6e" w={380}>
                  标题
                </Table.Th>
                <Table.Th fw={900} c="#8d5a6e" w={180}>
                  作者
                </Table.Th>
                <Table.Th fw={900} c="#8d5a6e" w={80}>
                  页数
                </Table.Th>
                <Table.Th fw={900} c="#8d5a6e" w={100}>
                  状态
                </Table.Th>
                <Table.Th
                  fw={900}
                  c="#8d5a6e"
                  w={86}
                  style={{
                    position: "sticky",
                    right: 0,
                    zIndex: 2,
                    background: "var(--mantine-color-pink-0)",
                    boxShadow: "-8px 0 12px -12px rgba(38, 25, 40, 0.4)",
                  }}
                >
                  操作
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.map((comic, index) => (
                <Table.Tr key={comic.id}>
                  <Table.Td w={64}>
                    <UnstyledButton
                      type="button"
                      aria-label={`预览封面：${comic.displayTitle}`}
                      onClick={() => setPreviewComic(comic)}
                      style={{ display: "block", borderRadius: 8 }}
                    >
                      <Box style={{ width: 44, height: 66, overflow: "hidden", borderRadius: 8 }}>
                        <ComicCover
                          className="admin-comic-thumbnail"
                          comicId={previewableComicId(comic)}
                          index={index}
                          title={comic.displayTitle}
                          use="list_thumbnail"
                        />
                      </Box>
                    </UnstyledButton>
                  </Table.Td>
                  <Table.Td style={{ minWidth: 0 }}>
                    <Box style={{ minWidth: 0, width: "100%" }}>
                      <OverflowTooltipText fw={700} size="sm">
                        {comic.displayTitle}
                      </OverflowTooltipText>
                      <OverflowTooltipText size="xs" c="ink.5">
                        {comic.fileTitle}
                      </OverflowTooltipText>
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <OverflowTooltipText size="sm">{comic.authorNames.length ? comic.authorNames.join("、") : "N/A"}</OverflowTooltipText>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{comic.pageCount}</Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge status={comic.status} missing={comic.isPrimaryFileMissing} merged={Boolean(comic.parentComicId || comic.mergedAsChapterId)} />
                  </Table.Td>
                  <Table.Td
                    style={{
                      position: "sticky",
                      right: 0,
                      zIndex: 1,
                      background: "inherit",
                      boxShadow: "-8px 0 12px -12px rgba(38, 25, 40, 0.4)",
                    }}
                  >
                    <AppButton component={Link} href={`/admin/comics/${comic.id}`} variant="outline" size="xs">
                      查看
                    </AppButton>
                  </Table.Td>
                </Table.Tr>
              ))}
              {paginated.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="ink.5" ta="center" py="md">
                      没有找到匹配的漫画
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
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
        opened={previewComic !== null}
        onClose={() => setPreviewComic(null)}
        title={previewComic ? `封面预览：${previewComic.displayTitle}` : "封面预览"}
        centered
        size="sm"
      >
        {previewComic && (
          <Box style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>
            <ComicCover
              comicId={previewableComicId(previewComic)}
              index={comics.findIndex((comic) => comic.id === previewComic.id)}
              title={previewComic.displayTitle}
              compact={false}
              use="cover"
            />
          </Box>
        )}
      </Modal>
    </Box>
  );
}

function OverflowTooltipText({ children, ...props }: { children: string } & Omit<TextProps, "children">) {
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) {
      return;
    }

    const updateOverflow = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };

    updateOverflow();
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Tooltip label={children} disabled={!isOverflowing} multiline maw={420} withArrow>
      <Text ref={textRef} component="div" truncate {...props}>
        {children}
      </Text>
    </Tooltip>
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

function previewableComicId(comic: LibraryComicAdminRowRecord) {
  return comic.status === "readable" && !comic.isPrimaryFileMissing && comic.pageCount > 0 ? comic.id : undefined;
}
