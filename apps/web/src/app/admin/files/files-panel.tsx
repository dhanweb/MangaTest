"use client";

import { ActionIcon, Box, Group, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { EyeOff, FileWarning, FolderSync, RefreshCcw, Search, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";
import type { ComicMaintenanceAction, DuplicateCandidateGroupRecord, ScanAllMangaRootsResult } from "@/modules/library";
import type { FileMaintenanceIssueRecord } from "@/modules/local-files";

const ISSUE_CONFIG: Record<FileMaintenanceIssueRecord["issueType"], { label: string; bg: string; color: string }> = {
  missing: { label: "文件缺失", bg: "#ffe1e1", color: "#ec3c45" },
};
const STATUS_LABELS: Record<DuplicateCandidateGroupRecord["candidates"][number]["status"], string> = {
  deleted: "已删除",
  hidden: "已隐藏",
  missing_local_file: "缺文件",
  readable: "可读",
  remote_only: "远程",
};

export function FilesPanel({ duplicateGroups, issues }: { duplicateGroups: DuplicateCandidateGroupRecord[]; issues: FileMaintenanceIssueRecord[] }) {
  const [items, setItems] = useState(issues);
  const [duplicateItems, setDuplicateItems] = useState(duplicateGroups);
  const [search, setSearch] = useState("");
  const [repairTarget, setRepairTarget] = useState<FileMaintenanceIssueRecord | null>(null);
  const [repairPath, setRepairPath] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [pendingDuplicateAction, setPendingDuplicateAction] = useState<string | null>(null);
  const [repairError, setRepairError] = useState("");
  const [isRepairing, setIsRepairing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter(
      (issue) =>
        issue.comicTitle.toLowerCase().includes(query) ||
        issue.filePath.toLowerCase().includes(query) ||
        ISSUE_CONFIG[issue.issueType].label.includes(query),
    );
  }, [items, search]);
  const filteredDuplicateGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return duplicateItems;
    }

    return duplicateItems.filter(
      (group) =>
        group.sortTitle.includes(query) ||
        group.candidates.some((candidate) =>
          [candidate.displayTitle, candidate.fileTitle, candidate.primaryLocalPath ?? "", STATUS_LABELS[candidate.status]].join(" ").toLowerCase().includes(query),
        ),
    );
  }, [duplicateItems, search]);

  const missing = items.filter((issue) => issue.issueType === "missing").length;
  const duplicateCandidateCount = duplicateItems.length;

  function openRepair(issue: FileMaintenanceIssueRecord) {
    setRepairTarget(issue);
    setRepairPath(issue.filePath);
    setRepairError("");
  }

  async function repairPathForTarget() {
    if (!repairTarget) {
      return;
    }

    setIsRepairing(true);
    setRepairError("");

    const response = await fetch(`/api/local-files/${encodeURIComponent(repairTarget.id)}/repair`, {
      method: "POST",
      body: JSON.stringify({ absolutePath: repairPath }),
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setRepairError(payload.error ?? "修复路径失败。");
      setIsRepairing(false);
      return;
    }

    setItems((current) => current.filter((item) => item.id !== repairTarget.id));
    setIsRepairing(false);
    setRepairTarget(null);
  }

  async function changeDuplicateComicStatus(comicId: string, action: Extract<ComicMaintenanceAction, "hide" | "soft_delete">) {
    const actionKey = `${comicId}:${action}`;
    setPendingDuplicateAction(actionKey);
    setDuplicateError("");

    try {
      const response = await fetch(`/api/comics/${comicId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as {
        comic?: { id: string; status: DuplicateCandidateGroupRecord["candidates"][number]["status"] };
        error?: string;
      };

      if (!response.ok || !payload.comic) {
        throw new Error(payload.error ?? "处理重复候选失败。");
      }

      setDuplicateItems((current) =>
        current.map((group) => ({
          ...group,
          readableCount: group.candidates.filter((candidate) => (candidate.id === comicId ? payload.comic?.status === "readable" : candidate.status === "readable")).length,
          candidates: group.candidates.map((candidate) => (candidate.id === comicId ? { ...candidate, status: payload.comic?.status ?? candidate.status } : candidate)),
        })),
      );
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : "处理重复候选失败。");
    } finally {
      setPendingDuplicateAction(null);
    }
  }

  async function scanAllRoots() {
    if (isScanning) {
      return;
    }

    setIsScanning(true);
    setScanMessage("");
    setScanError("");

    try {
      const response = await fetch("/api/local-files/scan", { method: "POST" });
      const payload = (await response.json()) as { result?: ScanAllMangaRootsResult; error?: string };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "扫描全部漫画根目录失败。");
      }

      const result = payload.result;
      const message =
        result.enabledRootCount === 0
          ? "没有启用的漫画根目录可扫描。"
          : `扫描完成：成功 ${result.scannedRootCount} 个根目录，失败 ${result.failedRootCount} 个，新增 ${result.addedCount} 本，标记缺失 ${result.missingCount} 个。`;

      setScanMessage(result.failedRootCount > 0 ? `${message} 失败项已记录在扫描会话中。` : message);

      if (result.enabledRootCount > 0) {
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "扫描全部漫画根目录失败。");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Wrench size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>
            文件维护
          </Text>
          <Text size="sm" c="ink.5">
            检测缺失文件、文件变更、疑似重复和孤立文件，保持数据库与本地文件一致。
          </Text>
        </Box>
      </Box>

      <Group gap="xl" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <Stat label="文件缺失" value={missing} color="#ec3c45" />
        <Stat label="文件变更" value={0} color="#b87a00" />
        <Stat label="疑似重复" value={duplicateCandidateCount} color="#4f46e5" />
        <Stat label="孤立文件" value={0} color="#7c3aed" />
      </Group>

      <Group justify="space-between" mb="md">
        <Box
          component="label"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 36,
            padding: "0 12px",
            border: "1px solid var(--mantine-color-pink-2)",
            borderRadius: 10,
            background: "white",
            maxWidth: 360,
            flex: 1,
          }}
        >
          <Search size={15} style={{ color: "var(--mantine-color-ink-5)", flexShrink: 0 }} />
          <Box
            component="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="搜索漫画名或文件路径..."
            style={{
              width: "100%",
              minWidth: 0,
              border: 0,
              outline: 0,
              background: "transparent",
              color: "var(--mantine-color-ink-7)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </Box>
        <Group gap="sm">
          <AppButton variant="outline" disabled leftSection={<RefreshCcw size={16} />}>
            重新扫描
          </AppButton>
          <AppButton loading={isScanning} onClick={scanAllRoots} leftSection={<FolderSync size={16} />}>
            全部扫描
          </AppButton>
        </Group>
      </Group>

      {(scanMessage || scanError) && (
        <Text size="sm" c={scanError ? "red.7" : "green.7"} mb="md">
          {scanError || scanMessage}
        </Text>
      )}

      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w={90}>
                类型
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                关联漫画
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e">
                文件路径
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={90}>
                大小
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>
                检测时间
              </Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>
                操作
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((issue) => (
              <Table.Tr key={issue.id}>
                <Table.Td>
                  <IssueBadge type={issue.issueType} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {issue.comicTitle}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="sm"
                    style={{
                      fontFamily: "var(--mantine-font-family-monospace)",
                      overflowWrap: "anywhere",
                      color: "#ec3c45",
                    }}
                  >
                    {issue.filePath}
                  </Text>
                  <Text size="xs" c="ink.5" mt={4}>
                    {issue.detail}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{issue.expectedSize}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="ink.5">
                    {formatDate(issue.detectedAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="修复路径" withArrow>
                      <ActionIcon variant="subtle" color="pink" size="md" onClick={() => openRepair(issue)} aria-label="修复路径">
                        <Wrench size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="忽略后续实现" withArrow>
                      <ActionIcon variant="subtle" color="ink" size="md" disabled aria-label="忽略">
                        <FileWarning size={15} />
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
                    没有找到匹配的文件问题
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Box>

      <Box mt="xl">
        <Group justify="space-between" align="flex-start" mb="sm">
          <Box>
            <Text component="h2" size="lg" fw={900} c="ink.8" m={0}>
              疑似重复
            </Text>
            <Text size="sm" c="ink.5" mt={2}>
              按规范化标题分组；处理只更新漫画记录状态，不移动、不删除真实文件。
            </Text>
          </Box>
        </Group>

        {duplicateError && (
          <Text size="sm" c="red.7" mb="sm">
            {duplicateError}
          </Text>
        )}

        <Stack gap="sm">
          {filteredDuplicateGroups.map((group) => (
            <Box key={group.sortTitle} style={{ border: "1px solid var(--mantine-color-pink-2)", borderRadius: 10, overflow: "hidden" }}>
              <Group justify="space-between" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)" }}>
                <Box>
                  <Text size="sm" fw={900} c="ink.8">
                    {group.sortTitle}
                  </Text>
                  <Text size="xs" c="ink.5">
                    {group.totalCount} 条候选 · {group.readableCount} 条可读
                  </Text>
                </Box>
              </Group>
              <Table verticalSpacing="sm" horizontalSpacing="md">
                <Table.Tbody>
                  {group.candidates.map((candidate) => (
                    <Table.Tr key={candidate.id}>
                      <Table.Td>
                        <Text size="sm" fw={700}>
                          {candidate.displayTitle}
                        </Text>
                        <Text size="xs" c="ink.5">
                          {candidate.fileTitle}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="ink.5" style={{ overflowWrap: "anywhere" }}>
                          {candidate.primaryLocalPath ?? "未关联主文件"}
                        </Text>
                      </Table.Td>
                      <Table.Td w={92}>
                        <StatusBadge status={candidate.status} />
                      </Table.Td>
                      <Table.Td w={90}>
                        <Text size="sm">{candidate.pageCount} 页</Text>
                      </Table.Td>
                      <Table.Td w={110}>
                        <Group gap={4} wrap="nowrap">
                          <Tooltip label="隐藏候选" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="pink"
                              size="md"
                              disabled={candidate.status === "hidden" || candidate.status === "deleted"}
                              loading={pendingDuplicateAction === `${candidate.id}:hide`}
                              onClick={() => changeDuplicateComicStatus(candidate.id, "hide")}
                              aria-label="隐藏候选"
                            >
                              <EyeOff size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="软删除候选" withArrow>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="md"
                              disabled={candidate.status === "deleted"}
                              loading={pendingDuplicateAction === `${candidate.id}:soft_delete`}
                              onClick={() => changeDuplicateComicStatus(candidate.id, "soft_delete")}
                              aria-label="软删除候选"
                            >
                              <Trash2 size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          ))}
          {filteredDuplicateGroups.length === 0 && (
            <Text size="sm" c="ink.5" ta="center" py="md">
              没有找到疑似重复候选
            </Text>
          )}
        </Stack>
      </Box>

      <Modal
        opened={repairTarget !== null}
        onClose={() => setRepairTarget(null)}
        title="修复缺失文件路径"
        size="lg"
        styles={{
          title: { fontWeight: 700, fontSize: "18px" },
          header: { borderBottom: "1px solid var(--mantine-color-pink-1)" },
        }}
      >
        <Stack gap="md" py="sm">
          <Text size="sm" c="ink.5">
            只更新数据库记录，不移动、不复制、不删除真实文件。新路径必须位于原 manga root 下。
          </Text>
          <AppInput label="新绝对路径" value={repairPath} onChange={(event) => setRepairPath(event.currentTarget.value)} />
          {repairError && (
            <Text size="sm" c="red.7">
              {repairError}
            </Text>
          )}
          <Group justify="flex-end">
            <AppButton variant="outline" onClick={() => setRepairTarget(null)}>
              取消
            </AppButton>
            <AppButton loading={isRepairing} onClick={repairPathForTarget}>
              保存修复
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

function IssueBadge({ type }: { type: FileMaintenanceIssueRecord["issueType"] }) {
  const config = ISSUE_CONFIG[type];
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
        background: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </Box>
  );
}

function StatusBadge({ status }: { status: DuplicateCandidateGroupRecord["candidates"][number]["status"] }) {
  const isProblem = status !== "readable";

  return (
    <Box
      component="span"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 24,
        padding: "0 8px",
        borderRadius: 7,
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        background: isProblem ? "#ffe3e6" : "#e4f9ed",
        color: isProblem ? "#d93a4e" : "#00894a",
      }}
    >
      {STATUS_LABELS[status]}
    </Box>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box>
      <Text size="xs" c="ink.4" fw={600}>
        {label}
      </Text>
      <Text fw={900} size="lg" c={color}>
        {value}
      </Text>
    </Box>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
