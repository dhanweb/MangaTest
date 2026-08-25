"use client";

import { Box, Text, UnstyledButton } from "@mantine/core";
import { Library } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminCrudList } from "@/components/admin-ui/admin-crud-list";
import { clampPage } from "@/components/admin-ui/admin-list-state";
import { AdminDataTable } from "@/components/admin-ui/admin-data-table";
import { AdminPageHeader } from "@/components/admin-ui/admin-page-header";
import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { useAdminTabs } from "@/components/admin-workbench/admin-tab-provider";
import { ComicCover } from "@/components/comic-cover";
import { AppLinkButton } from "@/components/ui/app-button";
import { AppModal } from "@/components/ui/app-modal";
import { AppTag } from "@/components/ui/app-tag";
import { OverflowTooltipText } from "@/components/ui/overflow-tooltip-text";
import type { AppTone } from "@/components/admin-ui/types";
import type { LibraryComicAdminRowRecord } from "@/modules/library";

export function ComicsPanel({ comics }: { comics: LibraryComicAdminRowRecord[] }) {
  const [page, setPage] = useAdminTabState("page", 1);
  const [pageSize, setPageSize] = useAdminTabState("pageSize", "10");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useAdminTabState<string | null>("statusFilter:v2", "readable");
  const [previewComic, setPreviewComic] = useState<LibraryComicAdminRowRecord | null>(null);
  const { refreshActiveTab, refreshing } = useAdminTabs();

  useEffect(() => {
    setPage(1);
  }, [setPage, statusFilter]);

  const filtered = useMemo(() => {
    let rows = comics;
    if (statusFilter && statusFilter !== "all") {
      rows = rows.filter((comic) => comic.status === statusFilter);
    }

    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((comic) =>
      [
        comic.displayTitle,
        comic.fileTitle,
        comic.authorNames.join(" "),
        comic.originalTitle ?? "",
        comic.metadataQueryTitle ?? "",
        comic.status,
        comic.localFileKind ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [comics, search, statusFilter]);

  const limit = Math.max(1, Number(pageSize) || 10);
  const total = filtered.length;
  const safePage = clampPage(page, total, limit);
  const paginated = filtered.slice((safePage - 1) * limit, safePage * limit);

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <AdminPageHeader
        title="漫画管理"
        icon={<Library size={22} />}
        description="查看扫描结果、文件状态和需要维护的漫画记录。"
      />
      <AdminCrudList
        search={{
          value: search,
          placeholder: "搜索漫画名称、作者或状态...",
          ariaLabel: "搜索漫画名称、作者或状态",
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
        }}
        filters={[
          {
            key: "status",
            label: "状态",
            value: statusFilter,
            options: [
              { value: "all", label: "全部" },
              { value: "readable", label: "可读" },
              { value: "missing_local_file", label: "缺文件" },
              { value: "remote_only", label: "仅远程" },
              { value: "hidden", label: "已隐藏" },
            ],
            onChange: (value) => {
              setStatusFilter(value);
              setPage(1);
            },
            width: 160,
          },
        ]}
        onRefresh={refreshActiveTab}
        refreshing={refreshing}
        pagination={{
          page,
          pageSize: limit,
          total,
          pageSizeOptions: [10, 20, 50],
          onPageChange: setPage,
          onPageSizeChange: (value) => {
            setPageSize(String(value));
            setPage(1);
          },
        }}
      >
        <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
          <AdminDataTable
            rows={paginated}
            getRowKey={(comic) => comic.id}
            rowNumber={{ page: safePage, pageSize: limit }}
            minWidth={920}
            empty="没有找到匹配的漫画"
            columns={[
              {
                key: "cover",
                header: "封面",
                width: 64,
                cell: (comic, rowIndex) => (
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
                        index={rowIndex}
                        title={comic.displayTitle}
                        use="list_thumbnail"
                      />
                    </Box>
                  </UnstyledButton>
                ),
              },
              {
                key: "title",
                header: "标题",
                width: 380,
                minWidth: 220,
                cell: (comic) => (
                  <Box style={{ minWidth: 0, width: "100%" }}>
                    <OverflowTooltipText fw={700} size="sm">{comic.displayTitle}</OverflowTooltipText>
                    <OverflowTooltipText size="xs" c="ink.5">{comic.fileTitle}</OverflowTooltipText>
                  </Box>
                ),
              },
              {
                key: "authors",
                header: "作者",
                width: 180,
                cell: (comic) => <OverflowTooltipText size="sm">{comic.authorNames.length ? comic.authorNames.join("、") : "N/A"}</OverflowTooltipText>,
              },
              {
                key: "pages",
                header: "页数",
                width: 80,
                align: "right",
                cell: (comic) => <Text size="sm">{comic.pageCount}</Text>,
              },
              {
                key: "status",
                header: "状态",
                width: 100,
                cell: (comic) => <ComicStatusTag status={comic.status} missing={comic.isPrimaryFileMissing} merged={Boolean(comic.parentComicId || comic.mergedAsChapterId)} />,
              },
              {
                key: "actions",
                header: "操作",
                headerLabel: "操作",
                width: 86,
                fixed: "right",
                wrap: false,
                cell: (comic) => <AppLinkButton href={`/admin/comics/${comic.id}`} variant="outline" size="xs">查看</AppLinkButton>,
              },
            ]}
          />
        </Box>
      </AdminCrudList>

      <AppModal
        opened={previewComic !== null}
        onClose={() => setPreviewComic(null)}
        title={previewComic ? `封面预览：${previewComic.displayTitle}` : "封面预览"}
        size="sm"
      >
        {previewComic ? (
          <Box style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>
            <ComicCover
              comicId={previewableComicId(previewComic)}
              index={comics.findIndex((comic) => comic.id === previewComic.id)}
              title={previewComic.displayTitle}
              compact={false}
              use="cover"
            />
          </Box>
        ) : null}
      </AppModal>
    </Box>
  );
}

function ComicStatusTag({
  status,
  missing,
  merged,
}: {
  status: LibraryComicAdminRowRecord["status"];
  missing: boolean;
  merged: boolean;
}) {
  const tone: AppTone = merged || status === "hidden" ? "warning" : missing || status === "deleted" || status === "missing_local_file" ? "danger" : status === "remote_only" ? "info" : "success";
  return <AppTag tone={tone} size="sm">{missing ? "缺文件" : statusLabel(status, merged)}</AppTag>;
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
