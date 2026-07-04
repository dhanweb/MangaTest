"use client";

import { ActionIcon, Box, Group, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { FileWarning, FolderSync, RefreshCcw, Search, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { AppButton, AppInput } from "@/components/ui/app-components";
import type { FileMaintenanceIssueRecord } from "@/modules/local-files";

const ISSUE_CONFIG: Record<FileMaintenanceIssueRecord["issueType"], { label: string; bg: string; color: string }> = {
  missing: { label: "文件缺失", bg: "#ffe1e1", color: "#ec3c45" },
};

export function FilesPanel({ issues }: { issues: FileMaintenanceIssueRecord[] }) {
  const [items, setItems] = useState(issues);
  const [search, setSearch] = useState("");
  const [repairTarget, setRepairTarget] = useState<FileMaintenanceIssueRecord | null>(null);
  const [repairPath, setRepairPath] = useState("");
  const [repairError, setRepairError] = useState("");
  const [isRepairing, setIsRepairing] = useState(false);

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

  const missing = items.filter((issue) => issue.issueType === "missing").length;

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
        <Stat label="疑似重复" value={0} color="#4f46e5" />
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
          <AppButton disabled leftSection={<FolderSync size={16} />}>
            全部扫描
          </AppButton>
        </Group>
      </Group>

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
