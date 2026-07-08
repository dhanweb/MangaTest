import { Box, Group, SimpleGrid, Text } from "@mantine/core";
import { AlertCircle, Archive, FileWarning, Gauge, HardDrive, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { AppBadge, AppLink, AppTitle } from "@/components/ui/app-components";
import { getAdminHealthSummary } from "@/modules/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const summary = await getAdminHealthSummary();
  const cachePercent = summary.cache.maxSizeBytes > 0 ? Math.min(100, (summary.cache.totalSizeBytes / summary.cache.maxSizeBytes) * 100) : 0;

  return (
    <Box>
      <Group justify="space-between" align="flex-start" mb={24}>
        <Box>
          <AppTitle order={1}>后台首页</AppTitle>
          <Text size="sm" c="ink.5" mt={6}>
            本地漫画库、扫描任务、文件状态和缓存状态的实时概览。
          </Text>
        </Box>
        <AppLink href="/admin/paths" variant="filled" leftSection={<RotateCw size={16} />}>
          扫描漫画路径
        </AppLink>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb={24}>
        <MetricCard icon={<Gauge size={20} />} label="可读漫画" value={String(summary.readableComics)} note={`${summary.localFiles} 个本地文件记录`} />
        <MetricCard icon={<FileWarning size={20} />} label="缺失文件" value={String(summary.missingFiles)} note="来自文件维护模块" tone={summary.missingFiles > 0 ? "warn" : "normal"} />
        <MetricCard icon={<Archive size={20} />} label="疑似重复" value={String(summary.duplicateCandidates)} note="最近一次扫描结果" />
        <MetricCard icon={<HardDrive size={20} />} label="缓存占用" value={formatBytes(summary.cache.totalSizeBytes)} note={`${cachePercent.toFixed(1)}% / ${formatBytes(summary.cache.maxSizeBytes)}`} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <StatusPanel title="扫描状态" actionHref="/admin/paths" actionLabel="查看路径">
          <InfoRow label="最近状态" value={formatScanStatus(summary.scanStatus)} />
          <InfoRow label="完成时间" value={summary.latestScanFinishedAt ? formatDate(summary.latestScanFinishedAt) : "暂无"} />
          <InfoRow label="错误信息" value={summary.latestScanError ?? "无"} tone={summary.latestScanError ? "warn" : "normal"} />
          <InfoRow label="操作日志" value={`${summary.recentOperationCount} 条`} />
        </StatusPanel>

        <StatusPanel title="缓存状态" actionHref="/admin/settings" actionLabel="缓存设置">
          <InfoRow label="Reader 缩略图" value={`${summary.cache.mediaAssetCount} 个 / ${formatBytes(summary.cache.mediaAssetSizeBytes)}`} />
          <InfoRow label="压缩包文件列表" value={`${summary.cache.archiveFileListCount} 个 / ${formatBytes(summary.cache.archiveFileListSizeBytes)}`} />
          <InfoRow label="过期缓存" value={`${summary.cache.expiredCount} 个`} tone={summary.cache.expiredCount > 0 ? "warn" : "normal"} />
          <InfoRow label="最早访问" value={summary.cache.oldestLastAccessAt ? formatDate(summary.cache.oldestLastAccessAt) : "暂无"} />
        </StatusPanel>
      </SimpleGrid>

      <Box mt="md">
        <StatusPanel title="最近操作" actionHref="/admin/files" actionLabel="文件维护">
          {summary.recentOperations.length > 0 ? (
            summary.recentOperations.map((operation) => (
              <Group key={operation.id} justify="space-between" gap={16} wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={700} c="ink.8">
                    {formatOperation(operation.operation)} · {operation.summary}
                  </Text>
                  <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                    {operation.targetType}:{operation.targetId}
                  </Text>
                </Box>
                <AppBadge>{formatDate(operation.createdAt)}</AppBadge>
              </Group>
            ))
          ) : (
            <Text size="sm" c="ink.5">
              暂无操作日志。
            </Text>
          )}
        </StatusPanel>
      </Box>
    </Box>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "normal" | "warn";
}) {
  return (
    <Box
      p="lg"
      style={{
        border: "1px solid var(--mantine-color-pink-1)",
        borderRadius: 14,
        background: "white",
        boxShadow: "0 8px 24px rgba(239,59,145,0.08)",
      }}
    >
      <Group gap={10} c={tone === "warn" ? "orange.7" : "pink.5"} mb={12}>
        {icon}
        <Text size="sm" fw={800}>
          {label}
        </Text>
      </Group>
      <Text size="30px" fw={900} lh={1} c="ink.8">
        {value}
      </Text>
      <Text size="xs" c="ink.5" mt={8}>
        {note}
      </Text>
    </Box>
  );
}

function StatusPanel({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <Box p="lg" style={{ border: "1px solid var(--mantine-color-pink-1)", borderRadius: 14, background: "white" }}>
      <Group justify="space-between" mb={14}>
        <Text component="h2" size="lg" fw={900} c="ink.8" m={0}>
          {title}
        </Text>
        <AppLink href={actionHref}>{actionLabel}</AppLink>
      </Group>
      <Box style={{ display: "grid", gap: 10 }}>{children}</Box>
    </Box>
  );
}

function InfoRow({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <Group justify="space-between" gap={16} wrap="nowrap">
      <Text size="sm" c="ink.5">
        {label}
      </Text>
      <AppBadge color={tone === "warn" ? "orange" : "pink"} leftSection={tone === "warn" ? <AlertCircle size={12} /> : undefined}>
        {value}
      </AppBadge>
    </Group>
  );
}

function formatScanStatus(status: string) {
  const labels: Record<string, string> = {
    never_scanned: "尚未扫描",
    queued: "等待中",
    running: "扫描中",
    completed: "已完成",
    failed: "失败",
    cancel_requested: "等待取消",
    canceled: "已取消",
  };

  return labels[status] ?? status;
}

function formatOperation(operation: string) {
  const labels: Record<string, string> = {
    cache_cleanup: "缓存清理",
    collection_add_comic: "加入收藏",
    collection_create: "创建收藏",
    collection_delete: "删除收藏",
    collection_remove_comic: "移出收藏",
    collection_reorder: "收藏重排",
    collection_update: "更新收藏",
    download_task_cancel: "取消下载",
    download_task_create: "创建下载",
    download_task_retry: "重试下载",
    hide: "隐藏",
    merge_chapter: "合并章节",
    path_repair: "路径修复",
    restore: "恢复",
    soft_delete: "软删除",
    switch_primary_file: "切换主文件",
  };

  return labels[operation] ?? operation;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
