"use client";

import { Box, Text } from "@mantine/core";
import { Video } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminCrudList } from "@/components/admin-ui/admin-crud-list";
import { clampPage } from "@/components/admin-ui/admin-list-state";
import { AdminDataTable } from "@/components/admin-ui/admin-data-table";
import { AdminPageHeader } from "@/components/admin-ui/admin-page-header";
import { useAdminTabs } from "@/components/admin-workbench/admin-tab-provider";
import { useAdminTabState } from "@/components/admin-workbench/use-admin-tab-state";
import { AppLinkButton } from "@/components/ui/app-button";
import { AppTag } from "@/components/ui/app-tag";
import { OverflowTooltipText } from "@/components/ui/overflow-tooltip-text";
import type { AppTone } from "@/components/admin-ui/types";
import { formatDuration } from "@/components/video-card";
import type { VideoAdminRowRecord } from "@/modules/video-library";

export function VideosPanel({ videos }: { videos: VideoAdminRowRecord[] }) {
  const [search, setSearch] = useAdminTabState("search", "");
  const [status, setStatus] = useAdminTabState<string | null>("status", "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { refreshActiveTab, refreshing } = useAdminTabs();

  const rows = useMemo(
    () => videos.filter((video) => (!status || status === "all" || video.status === status) && (!search.trim() || [video.displayTitle, video.fileTitle, video.status, video.primaryPath ?? ""].join(" ").toLowerCase().includes(search.trim().toLowerCase()))),
    [videos, status, search],
  );
  const safePage = clampPage(page, rows.length, pageSize);
  const paginated = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <AdminPageHeader
        title="视频管理"
        icon={<Video size={22} />}
        description="维护视频标题、标签、集数顺序和文件状态。"
      />
      <AdminCrudList
        search={{
          value: search,
          placeholder: "搜索标题、路径或状态...",
          ariaLabel: "搜索视频标题、路径或状态",
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
        }}
        filters={[
          {
            key: "status",
            label: "状态",
            value: status,
            options: [
              { value: "all", label: "全部" },
              { value: "readable", label: "就绪" },
              { value: "missing_local_file", label: "缺文件" },
              { value: "hidden", label: "已隐藏" },
              { value: "deleted", label: "已删除" },
            ],
            onChange: (value) => {
              setStatus(value);
              setPage(1);
            },
            width: 150,
          },
        ]}
        onRefresh={refreshActiveTab}
        refreshing={refreshing}
        pagination={{
          page,
          pageSize,
          total: rows.length,
          pageSizeOptions: [10, 20, 50],
          onPageChange: setPage,
          onPageSizeChange: (value) => {
            setPageSize(value);
            setPage(1);
          },
        }}
      >
        <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
          <AdminDataTable
            rows={paginated}
            getRowKey={(video) => video.id}
            rowNumber={{ page: safePage, pageSize }}
            minWidth={820}
            empty="没有找到匹配的视频"
            columns={[
              {
                key: "cover",
                header: "封面",
                width: 100,
                cell: (video) => (
                  <Box
                    component="img"
                    src={`/api/videos/${video.id}/cover`}
                    alt=""
                    style={{ width: 74, height: 42, objectFit: "cover", borderRadius: 6, background: "var(--mantine-color-ink-8)" }}
                  />
                ),
              },
              {
                key: "title",
                header: "标题",
                minWidth: 240,
                cell: (video) => (
                  <Box style={{ minWidth: 0 }}>
                    <OverflowTooltipText fw={700} size="sm">{video.displayTitle}</OverflowTooltipText>
                    <OverflowTooltipText size="xs" c="ink.5">{video.primaryPath ?? video.fileTitle}</OverflowTooltipText>
                  </Box>
                ),
              },
              {
                key: "episodes",
                header: "集数",
                width: 90,
                align: "right",
                cell: (video) => <Text size="sm">{video.episodeCount}</Text>,
              },
              {
                key: "duration",
                header: "总时长",
                width: 120,
                cell: (video) => <Text size="sm">{formatDuration(video.totalDurationSeconds)}</Text>,
              },
              {
                key: "status",
                header: "状态",
                width: 100,
                cell: (video) => <VideoStatusTag status={video.status} missing={video.isPrimaryFileMissing} />,
              },
              {
                key: "actions",
                header: "操作",
                headerLabel: "操作",
                width: 90,
                fixed: "right",
                wrap: false,
                cell: (video) => <AppLinkButton href={`/admin/videos/${video.id}`} variant="outline" size="xs">查看</AppLinkButton>,
              },
            ]}
          />
        </Box>
      </AdminCrudList>
    </Box>
  );
}

function VideoStatusTag({ status, missing }: { status: VideoAdminRowRecord["status"]; missing: boolean }) {
  const tone: AppTone = missing || status === "missing_local_file" || status === "deleted" ? "danger" : status === "hidden" ? "warning" : "success";
  const label: Record<VideoAdminRowRecord["status"], string> = {
    readable: "就绪",
    missing_local_file: "缺文件",
    hidden: "已隐藏",
    deleted: "已删除",
  };
  return <AppTag tone={tone} size="sm">{missing ? "缺文件" : label[status]}</AppTag>;
}
