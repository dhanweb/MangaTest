"use client";

import { Box, Group, Stack, Table, Text } from "@mantine/core";
import { Database, Link2, RefreshCcw, ScanSearch, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";
import { toast } from "@/components/ui/toast";
import type {
  PixivConnectionCheckResult,
  PixivSyncEntry,
  PixivSyncStats,
} from "@/modules/metadata-ingest/sources/pixiv-downloader/types";

interface SyncSessionRow {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalArtworkCount: number;
  updatedCount: number;
  skippedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  pathErrorCount: number;
  errorCount: number;
  errorSummary: string | null;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  updated: { label: "已更新", color: "#00894a" },
  skipped: { label: "跳过", color: "#53606c" },
  unmatched: { label: "未匹配", color: "#b86b00" },
  conflict: { label: "冲突", color: "#d93a4e" },
  path_error: { label: "路径异常", color: "#d93a4e" },
  error: { label: "错误", color: "#d93a4e" },
};

const REASON_LABELS: Record<string, string> = {
  deleted_in_source: "外部已删除",
  manual_title_protected: "标题为用户手动编辑，保持不变",
  no_change: "无变化",
  no_local_match: "未找到匹配的本地文件",
  identity_path_mismatch: "来源身份与路径指向不同漫画",
  unknown_prefix: "路径前缀未知",
  path_escape: "路径越界",
  empty_folder: "作品目录为空",
  matched_comic_missing: "匹配的漫画记录不存在",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? { label: action, color: "#53606c" };
}

function reasonLabel(reason: string | null) {
  if (!reason) return "";
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  if (reason.startsWith("unknown_prefix:")) return `路径前缀未知：${reason.slice("unknown_prefix:".length)}`;
  if (reason.startsWith("path_escape:")) return "路径越界";
  return reason;
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return value.replace("T", " ").replace(/(\.\d+)?Z$/, "");
}

function StatsBar({ stats }: { stats: PixivSyncStats }) {
  const items: Array<[string, string, string]> = [
    ["作品", String(stats.total), "#3a2034"],
    ["已更新", String(stats.updated), "#00894a"],
    ["跳过", String(stats.skipped), "#53606c"],
    ["未匹配", String(stats.unmatched), "#b86b00"],
    ["冲突", String(stats.conflict), "#d93a4e"],
    ["路径异常", String(stats.pathError), "#d93a4e"],
    ["错误", String(stats.error), "#d93a4e"],
  ];

  return (
    <Group gap={6} wrap="wrap">
      {items.map(([label, value, color]) => (
        <Box
          key={label}
          component="span"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 7,
            border: "1px solid #fde6ef",
            background: "#fff7fb",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span style={{ color: "#7a4d60" }}>{label}</span>
          <span style={{ color }}>{value}</span>
        </Box>
      ))}
    </Group>
  );
}

function EntryTable({ entries }: { entries: PixivSyncEntry[] }) {
  if (entries.length === 0) {
    return (
      <Text size="sm" c="ink.5" py="md" ta="center">
        没有条目。
      </Text>
    );
  }

  return (
    <Box style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #fde6ef", borderRadius: 10 }}>
      <Table striped highlightOnHover style={{ tableLayout: "fixed", fontSize: 12 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={90}>作品 ID</Table.Th>
            <Table.Th w={110}>动作</Table.Th>
            <Table.Th>标题 / 原因</Table.Th>
            <Table.Th w={140}>匹配漫画</Table.Th>
            <Table.Th>解析路径</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry) => {
            const action = actionLabel(entry.action);
            return (
              <Table.Tr key={entry.artworkId}>
                <Table.Td style={{ fontFamily: "var(--mantine-font-family-monospace)" }}>{entry.artworkId}</Table.Td>
                <Table.Td>
                  <Text span size="xs" fw={700} style={{ color: action.color }}>
                    {action.label}
                    {entry.titleUpdated ? "·标题" : ""}
                    {entry.sourceCreated ? "·新来源" : ""}
                  </Text>
                </Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>
                  {entry.title ?? "—"}
                  {entry.reason ? (
                    <Text span size="xs" c="ink.5" ml={6}>
                      {reasonLabel(entry.reason)}
                    </Text>
                  ) : null}
                </Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>
                  {entry.matchedComicId ? (
                    <>
                      <Text span size="xs" fw={700}>
                        {entry.matchedComicTitle ?? entry.matchedComicId}
                      </Text>
                      <Text span size="xs" c="ink.5" ml={4}>
                        ({entry.matchedBy === "source" ? "来源" : "路径"})
                      </Text>
                    </>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td style={{ wordBreak: "break-all", fontFamily: "var(--mantine-font-family-monospace)", fontSize: 11 }}>
                  {entry.resolvedPath ?? "—"}
                  {!entry.existsOnDisk && entry.resolvedPath ? (
                    <Text span size="xs" c="ink.5" ml={4}>
                      (磁盘不存在)
                    </Text>
                  ) : null}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

export function PixivSyncPanel() {
  const [dbPath, setDbPath] = useState("");
  const [downloadRoot, setDownloadRoot] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<PixivSyncEntry[] | null>(null);
  const [previewStats, setPreviewStats] = useState<PixivSyncStats | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sessions, setSessions] = useState<SyncSessionRow[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [openSessionEntries, setOpenSessionEntries] = useState<PixivSyncEntry[] | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/settings")
      .then((response) => response.json())
      .then((payload: { settings?: { pixivDownloaderDbPath?: string; pixivDownloaderDownloadRoot?: string } }) => {
        if (!mounted || !payload.settings) return;
        setDbPath(payload.settings.pixivDownloaderDbPath ?? "");
        setDownloadRoot(payload.settings.pixivDownloaderDownloadRoot ?? "");
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshSessions() {
    try {
      const response = await fetch("/api/pixiv-downloader/sessions?limit=20");
      const payload = (await response.json()) as { sessions?: SyncSessionRow[] };
      if (payload.sessions) {
        setSessions(payload.sessions);
      }
    } catch {
      // 批次列表加载失败不打断主流程。
    }
  }

  useEffect(() => {
    let mounted = true;
    fetch("/api/pixiv-downloader/sessions?limit=20")
      .then((response) => response.json())
      .then((payload: { sessions?: SyncSessionRow[] }) => {
        if (mounted && payload.sessions) {
          setSessions(payload.sessions);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  async function saveConfig() {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixivDownloaderDbPath: dbPath,
          pixivDownloaderDownloadRoot: downloadRoot,
        }),
      });
      const payload = (await response.json()) as { settings?: { pixivDownloaderDbPath: string; pixivDownloaderDownloadRoot: string }; error?: string };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error ?? "保存失败。");
      }
      setDbPath(payload.settings.pixivDownloaderDbPath);
      setDownloadRoot(payload.settings.pixivDownloaderDownloadRoot);
      setIsDirty(false);
      toast.success("PixivDownloader 配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function checkConnection() {
    setIsChecking(true);
    setCheckResult(null);
    try {
      const response = await fetch("/api/pixiv-downloader/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbPath, downloadRoot }),
      });
      const payload = (await response.json()) as { result?: PixivConnectionCheckResult; error?: string };
      if (!payload.result) {
        throw new Error(payload.error ?? "连接测试失败。");
      }
      const result = payload.result;
      if (result.ok) {
        const counts = result.schema.tableCounts;
        setCheckResult(
          `连接正常：作品 ${counts.artworks}、作者 ${counts.authors}、标签 ${counts.tags}、路径前缀 ${counts.pathPrefixes}${
            result.schema.warnings.length ? `；${result.schema.warnings.join("；")}` : ""
          }`,
        );
        toast.success("PixivDownloader 数据库连接正常");
      } else {
        setCheckResult(result.message);
        toast.error(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接测试失败。";
      setCheckResult(message);
      toast.error(message);
    } finally {
      setIsChecking(false);
    }
  }

  async function runPreview() {
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const response = await fetch("/api/pixiv-downloader/preview", { method: "POST" });
      const payload = (await response.json()) as {
        result?: { ok: boolean; stats: PixivSyncStats; entries: PixivSyncEntry[]; error: string | null };
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "预览失败。");
      }
      setPreviewStats(payload.result.stats);
      setPreviewEntries(payload.result.entries);
      if (!payload.result.ok) {
        setPreviewError(payload.result.error ?? "预览失败。");
        toast.error(payload.result.error ?? "预览失败。");
      } else {
        toast.success(`预览完成：${payload.result.stats.updated} 将更新，${payload.result.stats.unmatched} 未匹配`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "预览失败。";
      setPreviewError(message);
      toast.error(message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function runSync(scanFirst: boolean) {
    const label = scanFirst ? "扫描并同步" : "同步";
    if (scanFirst && !window.confirm("将先对 PixivDownloader 下载根目录执行普通扫描，再执行 Pixiv 元数据同步。继续吗？")) {
      return;
    }
    if (!scanFirst && !window.confirm("将按当前本地库直接执行 Pixiv 元数据同步（不重新扫描）。继续吗？")) {
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch("/api/pixiv-downloader/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanFirst }),
      });
      const payload = (await response.json()) as {
        result?: { ok: boolean; summary: { stats: PixivSyncStats; scanAddedCount: number | null } | null };
        error?: string;
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "同步失败。");
      }
      const stats = payload.result.summary?.stats;
      if (payload.result.ok) {
        toast.success(
          `${label}完成：更新 ${stats?.updated ?? 0}，跳过 ${stats?.skipped ?? 0}，未匹配 ${stats?.unmatched ?? 0}${
            payload.result.summary?.scanAddedCount != null ? `；扫描新增 ${payload.result.summary.scanAddedCount}` : ""
          }`,
        );
      } else {
        toast.error(`${label}完成但有错误：${stats?.error ?? 0} 个条目失败，详见批次记录。`);
      }
      await refreshSessions();
      await runPreview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步失败。");
    } finally {
      setIsSyncing(false);
    }
  }

  async function toggleSession(sessionId: string) {
    if (openSessionId === sessionId) {
      setOpenSessionId(null);
      setOpenSessionEntries(null);
      return;
    }

    setOpenSessionId(sessionId);
    setOpenSessionEntries(null);
    try {
      const response = await fetch(`/api/pixiv-downloader/sessions/${sessionId}`);
      const payload = (await response.json()) as { entries?: PixivSyncEntry[]; error?: string };
      if (!response.ok || !payload.entries) {
        throw new Error(payload.error ?? "读取批次条目失败。");
      }
      setOpenSessionEntries(payload.entries);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取批次条目失败。");
    }
  }

  return (
    <Stack gap="lg">
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Database size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box>
          <Text component="h1" size="20px" fw={700} mb={4}>
            Pixiv 元数据同步
          </Text>
          <Text size="sm" c="ink.5">
            从 PixivDownloader SQLite 数据库只读同步标题、来源、作者和标签。下载根目录会自动注册为媒体路径，普通路径管理页不可编辑或删除；扫描和同步都会使用这条受管路径。
          </Text>
        </Box>
      </Box>

      <Box p="lg" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
        <Text fw={700} size="sm" c="#3a2034" mb="xs">
          连接配置
        </Text>
        <Stack gap="sm">
          <AppInput
            label="PixivDownloader 数据库文件（绝对路径）"
            placeholder="C:\\Program Files\\PixivDownload\\data\\pixiv_download.db"
            value={dbPath}
            onChange={(event) => {
              setDbPath(event.currentTarget.value);
              setIsDirty(true);
            }}
          />
          <AppInput
            label="PixivDownloader 下载根目录（绝对路径，解析 {0}；自动添加为受管媒体路径）"
            placeholder="例如 D:\\hentai\\pixiv"
            value={downloadRoot}
            onChange={(event) => {
              setDownloadRoot(event.currentTarget.value);
              setIsDirty(true);
            }}
          />
          <Text size="xs" c="ink.5">
            保存后会自动创建或更新同路径的 MangaTest 媒体路径；如需修改，只能从本页修改下载根目录。
          </Text>
          <Group gap="sm" mt={4}>
            <AppButton loading={isSaving} disabled={!isDirty} onClick={saveConfig}>
              保存配置
            </AppButton>
            <AppButton variant="outline" loading={isChecking} onClick={checkConnection}>
              测试连接
            </AppButton>
          </Group>
          {checkResult ? (
            <Text size="xs" c="ink.5">
              {checkResult}
            </Text>
          ) : null}
        </Stack>
      </Box>

      <Box p="lg" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm" c="#3a2034">
            同步
          </Text>
          <Group gap="sm">
            <AppButton variant="outline" leftSection={<Search size={14} />} loading={isPreviewing} onClick={runPreview}>
              预览同步
            </AppButton>
            <AppButton leftSection={<ScanSearch size={14} />} loading={isSyncing} onClick={() => void runSync(true)}>
              扫描并同步
            </AppButton>
            <AppButton variant="light" leftSection={<Link2 size={14} />} loading={isSyncing} onClick={() => void runSync(false)}>
              仅同步
            </AppButton>
          </Group>
        </Group>
        <Text size="xs" c="ink.5" mb="sm">
          “扫描并同步”先执行普通 Library 扫描再同步；“仅同步”直接按当前本地库匹配。手动编辑过的标题不会被覆盖。
        </Text>

        {previewStats ? <StatsBar stats={previewStats} /> : null}
        {previewError ? (
          <Text size="sm" c="#d93a4e" mt="xs">
            {previewError}
          </Text>
        ) : null}
        {previewEntries ? (
          <Box mt="sm">
            <Text size="xs" fw={700} c="#7a4d60" mb={4}>
              预览条目
            </Text>
            <EntryTable entries={previewEntries} />
          </Box>
        ) : null}
      </Box>

      <Box p="lg" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm" c="#3a2034">
            同步批次
          </Text>
          <AppButton variant="subtle" size="xs" leftSection={<RefreshCcw size={13} />} onClick={() => void refreshSessions()}>
            刷新
          </AppButton>
        </Group>
        {sessions.length === 0 ? (
          <Text size="sm" c="ink.5" py="sm" ta="center">
            还没有同步批次。
          </Text>
        ) : (
          <Stack gap="sm">
            {sessions.map((session) => (
              <Box key={session.id}>
                <Box
                  component="button"
                  onClick={() => void toggleSession(session.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: "10px 14px",
                    border: "1px solid #fde6ef",
                    borderRadius: 10,
                    background: openSessionId === session.id ? "#fff4f8" : "white",
                    cursor: "pointer",
                  }}
                >
                  <Text size="xs" fw={800} style={{ color: session.status === "completed" ? "#00894a" : "#d93a4e" }}>
                    {session.status === "completed" ? "完成" : "失败"}
                  </Text>
                  <Text size="xs" c="ink.5">
                    {formatTime(session.startedAt)}
                  </Text>
                  <Group gap={4}>
                    <Text size="xs">共 {session.totalArtworkCount}</Text>
                    <Text size="xs" c="#00894a">
                      更新 {session.updatedCount}
                    </Text>
                    <Text size="xs" c="#53606c">
                      跳过 {session.skippedCount}
                    </Text>
                    <Text size="xs" c="#b86b00">
                      未匹配 {session.unmatchedCount}
                    </Text>
                    <Text size="xs" c="#d93a4e">
                      冲突 {session.conflictCount}
                    </Text>
                    <Text size="xs" c="#d93a4e">
                      路径 {session.pathErrorCount}
                    </Text>
                    <Text size="xs" c="#d93a4e">
                      错误 {session.errorCount}
                    </Text>
                  </Group>
                </Box>
                {openSessionId === session.id ? (
                  <Box mt={6}>
                    {openSessionEntries === null ? (
                      <Text size="xs" c="ink.5" px="md">
                        加载条目中…
                      </Text>
                    ) : (
                      <EntryTable entries={openSessionEntries} />
                    )}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
