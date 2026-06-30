"use client";

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { FileWarning, FolderSync, RefreshCcw, Search, Wrench } from "lucide-react";
import { AppButton } from "@/components/ui/app-components";
import { fileIssues, type FileIssue } from "@/lib/mock-data";

const ISSUE_CONFIG: Record<FileIssue["issueType"], { label: string; bg: string; color: string }> = {
  missing: { label: "文件缺失", bg: "#ffe1e1", color: "#ec3c45" },
  changed: { label: "文件变更", bg: "#fff3d6", color: "#b87a00" },
  duplicate: { label: "疑似重复", bg: "#e0e7ff", color: "#4f46e5" },
  orphan: { label: "孤立文件", bg: "#f3e8ff", color: "#7c3aed" },
};

function IssueBadge({ type }: { type: FileIssue["issueType"] }) {
  const c = ISSUE_CONFIG[type];
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
        background: c.bg,
        color: c.color,
      }}
    >
      {c.label}
    </Box>
  );
}

export default function FilesPage() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fileIssues;
    return fileIssues.filter((f) =>
      f.comicTitle.toLowerCase().includes(q) ||
      f.filePath.toLowerCase().includes(q) ||
      ISSUE_CONFIG[f.issueType].label.includes(q)
    );
  }, [search]);

  const missing = fileIssues.filter((f) => f.issueType === "missing").length;
  const changed = fileIssues.filter((f) => f.issueType === "changed").length;
  const duplicates = fileIssues.filter((f) => f.issueType === "duplicate").length;
  const orphans = fileIssues.filter((f) => f.issueType === "orphan").length;

  return (
    <Box p="xl" style={{ borderRadius: 14, background: "white", boxShadow: "0 8px 24px rgba(239,59,145,0.08)" }}>
      {/* Header */}
      <Box style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
        <Wrench size={22} style={{ flexShrink: 0, marginTop: 1 }} />
        <Box style={{ flex: 1 }}>
          <Text component="h1" size="20px" fw={700} mb={4}>文件维护</Text>
          <Text size="sm" c="ink.5">检测缺失文件、文件变更、疑似重复和孤立文件，保持数据库与本地文件一致。</Text>
        </Box>
      </Box>

      {/* Stats row */}
      <Group gap="xl" mb="lg" px="md" py="sm" style={{ background: "var(--mantine-color-pink-0)", borderRadius: 10 }}>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>文件缺失</Text>
          <Text fw={900} size="lg" c="#ec3c45">{missing}</Text>
        </Box>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>文件变更</Text>
          <Text fw={900} size="lg" c="#b87a00">{changed}</Text>
        </Box>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>疑似重复</Text>
          <Text fw={900} size="lg" c="#4f46e5">{duplicates}</Text>
        </Box>
        <Box>
          <Text size="xs" c="ink.4" fw={600}>孤立文件</Text>
          <Text fw={900} size="lg" c="#7c3aed">{orphans}</Text>
        </Box>
      </Group>

      {/* Toolbar */}
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
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="搜索漫画名或文件路径…"
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
          <AppButton variant="outline" leftSection={<RefreshCcw size={16} />}>
            重新扫描
          </AppButton>
          <AppButton leftSection={<FolderSync size={16} />}>
            全部扫描
          </AppButton>
        </Group>
      </Group>

      {/* Table */}
      <Box style={{ overflow: "hidden", borderRadius: 10, border: "1px solid var(--mantine-color-pink-2)" }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr style={{ background: "var(--mantine-color-pink-0)" }}>
              <Table.Th fw={900} c="#8d5a6e" w={90}>类型</Table.Th>
              <Table.Th fw={900} c="#8d5a6e">关联漫画</Table.Th>
              <Table.Th fw={900} c="#8d5a6e">文件路径</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={90}>大小</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>检测时间</Table.Th>
              <Table.Th fw={900} c="#8d5a6e" w={140}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((issue) => (
              <Table.Tr key={issue.id}>
                <Table.Td>
                  <IssueBadge type={issue.issueType} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{issue.comicTitle}</Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="sm"
                    style={{
                      fontFamily: "var(--mantine-font-family-monospace)",
                      overflowWrap: "anywhere",
                      color: issue.issueType === "missing" ? "#ec3c45" : "#201422",
                    }}
                  >
                    {issue.filePath}
                  </Text>
                  <Text size="xs" c="ink.5" mt={4}>{issue.detail}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{issue.expectedSize}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="ink.5">{issue.detectedAt}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {issue.issueType === "missing" && (
                      <Tooltip label="修复路径" withArrow>
                        <ActionIcon variant="subtle" color="pink.5" size="md" aria-label="修复路径">
                          <Wrench size={15} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {issue.issueType === "duplicate" && (
                      <AppButton variant="outline" size="xs">查看</AppButton>
                    )}
                    {issue.issueType === "orphan" && (
                      <AppButton variant="outline" size="xs">关联</AppButton>
                    )}
                    {issue.issueType === "changed" && (
                      <AppButton variant="outline" size="xs">更新</AppButton>
                    )}
                    <Tooltip label="忽略" withArrow>
                      <ActionIcon variant="subtle" color="ink.5" size="md" aria-label="忽略">
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
    </Box>
  );
}
